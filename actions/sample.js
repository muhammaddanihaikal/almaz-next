"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"

/**
 * Simpan/update sample keluar saat sesi pagi dibuat/diedit.
 * samples: [{ rokok_id, type: "cukai"|"biasa", qty_keluar }]
 *
 * Fungsi ini dipanggil di dalam transaction pembuatan sesi,
 * sehingga menerima tx sebagai parameter opsional.
 */
export async function saveSesiSampleKeluar(sesi_id, samples, tx = prisma) {
  if (!samples || samples.length === 0) return

  const valid = samples.filter((s) => s.rokok_id && Number(s.qty_keluar) > 0)
  if (valid.length === 0) return

  for (const s of valid) {
    const qty = Number(s.qty_keluar)

    // Upsert SesiSample
    await tx.sesiSample.upsert({
      where: { sesi_id_rokok_id_type: { sesi_id, rokok_id: s.rokok_id, type: s.type } },
      create: { sesi_id, rokok_id: s.rokok_id, type: s.type, qty_keluar: qty, qty_kembali: 0 },
      update: { qty_keluar: qty },
    })

    // Update cache stok sample
    if (s.type === "cukai") {
      await tx.rokok.update({
        where: { id: s.rokok_id },
        data: { stok_sample_cukai: { decrement: qty } },
      })
    } else {
      await tx.rokok.update({
        where: { id: s.rokok_id },
        data: { stok_sample_biasa: { decrement: qty } },
      })
    }
  }
}

/**
 * Simpan sample kembali saat laporan sore diselesaikan.
 * samples: [{ rokok_id, type: "cukai"|"biasa", qty_kembali }]
 *
 * Fungsi ini dipanggil di dalam transaction penyelesaian sesi.
 */
export async function saveSesiSampleKembali(sesi_id, samples, tx = prisma) {
  if (!samples || samples.length === 0) return

  const valid = samples.filter((s) => s.rokok_id && Number(s.qty_kembali) >= 0)
  if (valid.length === 0) return

  for (const s of valid) {
    const qtyKembali = Number(s.qty_kembali)
    const existing = await tx.sesiSample.findUnique({
      where: { sesi_id_rokok_id_type: { sesi_id, rokok_id: s.rokok_id, type: s.type } },
    })
    if (!existing) continue

    const oldKembali = existing.qty_kembali
    const delta = qtyKembali - oldKembali

    await tx.sesiSample.update({
      where: { sesi_id_rokok_id_type: { sesi_id, rokok_id: s.rokok_id, type: s.type } },
      data: { qty_kembali: qtyKembali },
    })

    // Update cache stok sample berdasarkan delta
    if (delta !== 0) {
      if (s.type === "cukai") {
        await tx.rokok.update({
          where: { id: s.rokok_id },
          data: { stok_sample_cukai: delta > 0 ? { increment: delta } : { decrement: Math.abs(delta) } },
        })
      } else {
        await tx.rokok.update({
          where: { id: s.rokok_id },
          data: { stok_sample_biasa: delta > 0 ? { increment: delta } : { decrement: Math.abs(delta) } },
        })
      }
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
 * Harus dipanggil di dalam transaction sebelum sesi didelete.
 */
export async function revertSesiSampleKeluar(sesi_id, tx = prisma) {
  const samples = await tx.sesiSample.findMany({ where: { sesi_id } })
  for (const s of samples) {
    const net = s.qty_keluar - s.qty_kembali
    if (net > 0) {
      if (s.type === "cukai") {
        await tx.rokok.update({
          where: { id: s.rokok_id },
          data: { stok_sample_cukai: { increment: net } },
        })
      } else {
        await tx.rokok.update({
          where: { id: s.rokok_id },
          data: { stok_sample_biasa: { increment: net } },
        })
      }
    }
  }
}
