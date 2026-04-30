"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"

export async function getRokokList() {
  try {
    const rows = await prisma.rokok.findMany({ orderBy: { urutan: "asc" } })
    return rows.map((r) => ({
      id: r.id,
      nama: r.nama,
      stok: r.stok,
      harga_beli: r.harga_beli,
      harga_grosir: r.harga_grosir,
      harga_toko: r.harga_toko,
      harga_perorangan: r.harga_perorangan,
      aktif: r.aktif,
      urutan: r.urutan,
    }))
  } catch (error) {
    console.error("Gagal mengambil daftar rokok dengan urutan custom:", error)
    const rows = await prisma.rokok.findMany({ orderBy: { nama: "asc" } })
    return rows.map((r) => ({
      id: r.id,
      nama: r.nama,
      stok: r.stok,
      harga_beli: r.harga_beli,
      harga_grosir: r.harga_grosir,
      harga_toko: r.harga_toko,
      harga_perorangan: r.harga_perorangan,
      aktif: r.aktif,
      urutan: r.urutan ?? 0,
    }))
  }
}

export async function addRokok(data) {
  const maxUrutan = await prisma.rokok.aggregate({
    _max: { urutan: true },
  })
  const nextUrutan = (maxUrutan._max.urutan ?? -1) + 1

  await prisma.$transaction(async (tx) => {
    const r = await tx.rokok.create({
      data: {
        nama: data.nama,
        stok: Number(data.stok) || 0,
        harga_beli: Number(data.harga_beli),
        harga_grosir: Number(data.harga_grosir),
        harga_toko: Number(data.harga_toko),
        harga_perorangan: Number(data.harga_perorangan),
        urutan: nextUrutan,
      },
    })
    if (r.stok > 0) {
      await tx.stokMasuk.create({
        data: {
          rokok_id: r.id,
          qty:      r.stok,
          tanggal:  new Date(),
          keterangan: "Stok Awal",
        },
      })
    }
  })
  revalidatePath("/rokok")
}

export async function updateRokok(id, data) {
  await prisma.rokok.update({
    where: { id },
    data: {
      nama: data.nama,
      stok: Number(data.stok) || 0,
      harga_beli: Number(data.harga_beli),
      harga_grosir: Number(data.harga_grosir),
      harga_toko: Number(data.harga_toko),
      harga_perorangan: Number(data.harga_perorangan),
    },
  })
  revalidatePath("/rokok")
}

export async function deleteRokok(id) {
  await prisma.rokok.delete({ where: { id } })
  revalidatePath("/rokok")
}

export async function toggleAktifRokok(id) {
  const r = await prisma.rokok.findUnique({ where: { id }, select: { aktif: true } })
  await prisma.rokok.update({ where: { id }, data: { aktif: !r.aktif } })
  revalidatePath("/rokok")
}

export async function tambahStok(id, qty, date, keterangan) {
  await prisma.$transaction(async (tx) => {
    await tx.stokMasuk.create({
      data: {
        rokok_id: id,
        qty:      qty,
        tanggal:  new Date(date),
        keterangan: keterangan || "Stok Masuk",
      },
    })
    await tx.rokok.update({
      where: { id },
      data: { stok: { increment: qty } },
    })
  })
  revalidatePath("/rokok")
}

export async function updateRokokOrder(items) {
  try {
    await Promise.all(
      items.map((it) =>
        prisma.rokok.update({
          where: { id: it.id },
          data: { urutan: it.urutan },
        })
      )
    )
    revalidatePath("/rokok")
    return { success: true }
  } catch (error) {
    console.error("DETAIL ERROR SIMPAN URUTAN:", error)
    return { 
      success: false, 
      error: `Gagal: ${error.message || "Unknown error"}` 
    }
  }
}
export async function getUsedRokokIds() {
  const [keluar, jual, kembali, konsinyasi, retur] = await Promise.all([
    prisma.sesiBarangKeluar.findMany({ select: { rokok_id: true }, distinct: ["rokok_id"] }),
    prisma.sesiPenjualan.findMany({ select: { rokok_id: true }, distinct: ["rokok_id"] }),
    prisma.sesiBarangKembali.findMany({ select: { rokok_id: true }, distinct: ["rokok_id"] }),
    prisma.titipJualItem.findMany({ select: { rokok_id: true }, distinct: ["rokok_id"] }),
    prisma.returItem.findMany({ select: { rokok_id: true }, distinct: ["rokok_id"] }),
  ])
  const ids = new Set([
    ...keluar.map(i => i.rokok_id),
    ...jual.map(i => i.rokok_id),
    ...kembali.map(i => i.rokok_id),
    ...konsinyasi.map(i => i.rokok_id),
    ...retur.map(i => i.rokok_id),
  ])
  return Array.from(ids)
}

export async function getMutasiStok(startDate, endDate) {
  const start = new Date(startDate)
  const end   = new Date(endDate)

  const rokokList = await prisma.rokok.findMany({ orderBy: { urutan: "asc" } })

  // 1. Get initial balance before startDate
  const [preMasuk, preKeluar, preKembali, preRetur] = await Promise.all([
    prisma.stokMasuk.groupBy({ by: ["rokok_id"], where: { tanggal: { lt: start } }, _sum: { qty: true } }),
    prisma.sesiBarangKeluar.groupBy({ by: ["rokok_id"], where: { sesi: { tanggal: { lt: start } } }, _sum: { qty: true } }),
    prisma.sesiBarangKembali.groupBy({ by: ["rokok_id"], where: { sesi: { tanggal: { lt: start } } }, _sum: { qty: true } }),
    prisma.returItem.groupBy({ by: ["rokok_id"], where: { retur: { tanggal: { lt: start } } }, _sum: { qty: true } }),
  ])

  const initialBalances = {}
  for (const r of rokokList) {
    const masuk   = preMasuk.find((it) => it.rokok_id === r.id)?._sum.qty || 0
    const keluar  = preKeluar.find((it) => it.rokok_id === r.id)?._sum.qty || 0
    const kembali = preKembali.find((it) => it.rokok_id === r.id)?._sum.qty || 0
    const retur   = preRetur.find((it) => it.rokok_id === r.id)?._sum.qty || 0
    initialBalances[r.id] = masuk - keluar + kembali + retur
  }

  // 2. Get activity in range
  const [inMasuk, inKeluar, inKembali, inRetur] = await Promise.all([
    prisma.stokMasuk.findMany({ where: { tanggal: { gte: start, lte: end } }, orderBy: { tanggal: "asc" } }),
    prisma.sesiBarangKeluar.findMany({ where: { sesi: { tanggal: { gte: start, lte: end } } }, include: { sesi: true } }),
    prisma.sesiBarangKembali.findMany({ where: { sesi: { tanggal: { gte: start, lte: end } } }, include: { sesi: true } }),
    prisma.returItem.findMany({ where: { retur: { tanggal: { gte: start, lte: end } } }, include: { retur: true } }),
  ])

  // 3. Build daily summary
  const report = []
  let currentDate = new Date(start)
  const currentBalances = { ...initialBalances }

  while (currentDate <= end) {
    const dStr = currentDate.toISOString().split("T")[0]
    const dayRows = []

    for (const r of rokokList) {
      const masuk   = inMasuk.filter((it) => it.rokok_id === r.id && it.tanggal.toISOString().split("T")[0] === dStr).reduce((s, it) => s + it.qty, 0)
      const keluar  = inKeluar.filter((it) => it.rokok_id === r.id && it.sesi.tanggal.toISOString().split("T")[0] === dStr).reduce((s, it) => s + it.qty, 0)
      const kembali = inKembali.filter((it) => it.rokok_id === r.id && it.sesi.tanggal.toISOString().split("T")[0] === dStr).reduce((s, it) => s + it.qty, 0)
      const retur   = inRetur.filter((it) => it.rokok_id === r.id && it.retur.tanggal.toISOString().split("T")[0] === dStr).reduce((s, it) => s + it.qty, 0)

      const awal = currentBalances[r.id]
      const totalMasuk = masuk + kembali + retur
      const akhir = awal + totalMasuk - keluar

      if (awal !== 0 || totalMasuk !== 0 || keluar !== 0) {
        dayRows.push({
          rokok_id: r.id,
          nama:     r.nama,
          awal,
          masuk:    totalMasuk,
          keluar,
          akhir,
          detail_masuk: masuk,
          detail_kembali: kembali,
          detail_retur: retur
        })
      }
      currentBalances[r.id] = akhir
    }

    if (dayRows.length > 0) {
      report.push({ tanggal: dStr, data: dayRows })
    }
    currentDate.setDate(currentDate.getDate() + 1)
  }

  return report.reverse()
}
