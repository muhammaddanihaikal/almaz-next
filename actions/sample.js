"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { mutateStock, MUTATION_SOURCE } from "@/lib/stock"

/**
 * Simpan/update sample keluar saat sesi pagi dibuat/diedit.
 * samples: [{ rokok_id, type: "cukai"|"biasa", qty_keluar }]
 */
export async function saveSesiSampleKeluar(sesi_id, samples, tx = prisma) {
  if (!samples || samples.length === 0) return

  const valid = samples.filter((s) => s.rokok_id && Number(s.qty_keluar) > 0)
  if (valid.length === 0) return

  const sesi = await tx.sesiHarian.findUnique({ where: { id: sesi_id }, select: { tanggal: true } })

  for (const s of valid) {
    const qty = Number(s.qty_keluar)
    const stock_type = s.type === "cukai" ? "sample_cukai" : "sample_biasa"

    // Upsert SesiSample
    await tx.sesiSample.upsert({
      where: { sesi_id_rokok_id_type: { sesi_id, rokok_id: s.rokok_id, type: s.type } },
      create: { sesi_id, rokok_id: s.rokok_id, type: s.type, qty_keluar: qty, qty_kembali: 0 },
      update: { qty_keluar: qty },
    })

    // Record mutation (OUT)
    await mutateStock({
      tx,
      rokok_id: s.rokok_id,
      tanggal: sesi?.tanggal || new Date(),
      jenis: "out",
      qty,
      source: MUTATION_SOURCE.DISTRIBUSI,
      stock_type,
      reference_id: sesi_id,
      keterangan: `Sample ${s.type} dibawa sales (pagi)`,
    })
  }
}

/**
 * Simpan sample kembali saat laporan sore diselesaikan.
 * samples: [{ rokok_id, type: "cukai"|"biasa", qty_kembali }]
 */
export async function saveSesiSampleKembali(sesi_id, samples, tx = prisma) {
  if (!samples || samples.length === 0) return

  const valid = samples.filter((s) => s.rokok_id && Number(s.qty_kembali) >= 0)
  if (valid.length === 0) return

  const sesi = await tx.sesiHarian.findUnique({ where: { id: sesi_id }, select: { tanggal: true } })

  for (const s of valid) {
    const qtyKembali = Number(s.qty_kembali)
    const existing = await tx.sesiSample.findUnique({
      where: { sesi_id_rokok_id_type: { sesi_id, rokok_id: s.rokok_id, type: s.type } },
    })
    if (!existing) continue

    const oldKembali = existing.qty_kembali
    const delta = qtyKembali - oldKembali
    const stock_type = s.type === "cukai" ? "sample_cukai" : "sample_biasa"

    await tx.sesiSample.update({
      where: { sesi_id_rokok_id_type: { sesi_id, rokok_id: s.rokok_id, type: s.type } },
      data: { qty_kembali: qtyKembali },
    })

    // Record mutation (IN or OUT based on delta)
    if (delta !== 0) {
      await mutateStock({
        tx,
        rokok_id: s.rokok_id,
        tanggal: sesi?.tanggal || new Date(),
        jenis: delta > 0 ? "in" : "out",
        qty: Math.abs(delta),
        source: delta > 0 ? "retur_sales" : MUTATION_SOURCE.DISTRIBUSI,
        stock_type,
        reference_id: sesi_id,
        keterangan: delta > 0 ? `Sample ${s.type} kembali dari sales` : `Koreksi sample ${s.type} (dibawa tambahan)`,
      })
    }
  }
}

/**
 * Ambil data sample untuk satu sesi.
 */
export async function getSesiSample(sesi_id) {
  const rows = await prisma.sesiSample.findMany({
    where: { sesi_id },
    include: { rokok: { select: { nama: true } } },
  })
  return rows.map((r) => ({
    id:          r.id,
    rokok_id:    r.rokok_id,
    rokok:       r.rokok.nama,
    type:        r.type,
    qty_keluar:  r.qty_keluar,
    qty_kembali: r.qty_kembali,
  }))
}

/**
 * Batalkan semua sample keluar untuk sesi (dipakai saat sesi dihapus).
 */
export async function revertSesiSampleKeluar(sesi_id, tx = prisma) {
  const samples = await tx.sesiSample.findMany({ where: { sesi_id } })
  const sesi = await tx.sesiHarian.findUnique({ where: { id: sesi_id }, select: { tanggal: true } })

  for (const s of samples) {
    const net = s.qty_keluar - s.qty_kembali
    if (net > 0) {
      const stock_type = s.type === "cukai" ? "sample_cukai" : "sample_biasa"
      await mutateStock({
        tx,
        rokok_id: s.rokok_id,
        tanggal: sesi?.tanggal || new Date(),
        jenis: "in",
        qty: net,
        source: MUTATION_SOURCE.REVERT,
        stock_type,
        reference_id: sesi_id,
        keterangan: `Revert sample ${s.type} (sesi dihapus/diedit)`,
        allowNegative: true,
      })
    }
  }
}
