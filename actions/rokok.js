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

  await prisma.rokok.create({
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

export async function tambahStok(id, qty) {
  await prisma.rokok.update({
    where: { id },
    data: { stok: { increment: qty } },
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
