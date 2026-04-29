"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"

const include = {
  sales: true,
  toko:  true,
  items: { include: { rokok: true } },
  setoran: true,
}

function serialize(k) {
  const nilaiTotal    = k.items.reduce((s, it) => s + it.qty_keluar * it.harga, 0)
  const nilaiTerjual  = k.items.reduce((s, it) => s + it.qty_terjual * it.harga, 0)
  const totalSetoran  = k.setoran.reduce((s, it) => s + it.jumlah, 0)
  const flagSetoran   = k.status === "selesai" && totalSetoran !== nilaiTerjual
  const today         = new Date().toISOString().split("T")[0]
  const jatuhTempo    = k.tanggal_jatuh_tempo.toISOString().split("T")[0]
  const selisihHari   = Math.ceil((new Date(jatuhTempo) - new Date(today)) / 86400000)
  const flagJatuhTempo = k.status === "aktif" && selisihHari <= 3

  return {
    id:                  k.id,
    sesi_id:             k.sesi_id,
    sales_id:            k.sales_id,
    sales:               k.sales.nama,
    toko_id:             k.toko_id,
    nama_toko:           k.toko.nama,
    kategori:            k.kategori,
    tanggal_jatuh_tempo: jatuhTempo,
    tanggal_selesai:     k.tanggal_selesai ? k.tanggal_selesai.toISOString().split("T")[0] : null,
    status:              k.status,
    catatan:             k.catatan,
    createdAt:           k.createdAt.toISOString(),
    nilaiTotal,
    nilaiTerjual,
    totalSetoran,
    flagSetoran,
    flagJatuhTempo,
    selisihHari,
    items: k.items
      .sort((a, b) => (a.rokok?.urutan ?? 0) - (b.rokok?.urutan ?? 0))
      .map((it) => ({
      id:          it.id,
      rokok_id:    it.rokok_id,
      rokok:       it.rokok.nama,
      qty_keluar:  it.qty_keluar,
      qty_terjual: it.qty_terjual,
      qty_kembali: it.qty_kembali,
      harga:       it.harga,
    })),
    setoran: k.setoran.map((it) => ({
      id:     it.id,
      metode: it.metode,
      jumlah: it.jumlah,
      tanggal: it.tanggal.toISOString().split("T")[0],
    })),
  }
}

export async function getTitipJualList() {
  const rows = await prisma.titipJual.findMany({
    include,
    orderBy: { tanggal_jatuh_tempo: "asc" },
  })
  return rows.map(serialize)
}

export async function getTitipJualJatuhTempo() {
  const tiga_hari = new Date()
  tiga_hari.setDate(tiga_hari.getDate() + 3)
  const rows = await prisma.titipJual.findMany({
    where: {
      status: "aktif",
      tanggal_jatuh_tempo: { lte: tiga_hari },
    },
    include,
    orderBy: { tanggal_jatuh_tempo: "asc" },
  })
  return rows.map(serialize)
}

export async function settleTitipJual(id, data) {
  const today = new Date(data.tanggal || new Date().toISOString().split("T")[0])

  await prisma.$transaction(async (tx) => {
    for (const it of data.items) {
      await tx.titipJualItem.update({
        where: { id: it.id },
        data:  { qty_terjual: it.qty_terjual, qty_kembali: it.qty_kembali },
      })
      if (it.qty_kembali > 0) {
        await tx.rokok.update({
          where: { id: it.rokok_id },
          data:  { stok: { increment: it.qty_kembali } },
        })
      }
    }

    const validSetoran = (data.setoran || []).filter((s) => s.jumlah > 0)
    if (validSetoran.length > 0) {
      await tx.titipJualSetoran.createMany({
        data: validSetoran.map((s) => ({
          titip_jual_id: id,
          metode:        s.metode,
          jumlah:        s.jumlah,
          tanggal:       today,
        })),
      })
    }

    await tx.titipJual.update({
      where: { id },
      data:  { status: "selesai", tanggal_selesai: today },
    })
  })

  revalidatePath("/titip-jual")
  revalidatePath("/distribusi")
  revalidatePath("/")
}

export async function editTitipJualDetail(id, data) {
  await prisma.titipJual.update({
    where: { id },
    data: {
      tanggal_jatuh_tempo: new Date(data.tanggal_jatuh_tempo),
      catatan:             data.catatan || null,
    },
  })
  revalidatePath("/titip-jual")
  revalidatePath("/distribusi")
  revalidatePath("/")
}

export async function deleteTitipJual(id) {
  await prisma.$transaction(async (tx) => {
    const k = await tx.titipJual.findUnique({ where: { id }, include: { items: true } })
    if (k.status !== "aktif") throw new Error("Hanya titip jual aktif yang bisa dihapus")
    for (const it of k.items) {
      await tx.rokok.update({ where: { id: it.rokok_id }, data: { stok: { increment: it.qty_keluar } } })
    }
    await tx.titipJual.delete({ where: { id } })
  })
  revalidatePath("/titip-jual")
  revalidatePath("/distribusi")
  revalidatePath("/")
}

export async function createTitipJual(sesiId, salesId, k) {
  const rokokList = await prisma.rokok.findMany()
  const hargaMap  = {}
  for (const r of rokokList) {
    hargaMap[r.id] = { grosir: r.harga_grosir, toko: r.harga_toko, perorangan: r.harga_perorangan }
  }

  const result = await prisma.titipJual.create({
    data: {
      sesi_id:             sesiId,
      sales_id:            salesId,
      toko_id:             k.toko_id,
      kategori:            k.kategori,
      tanggal_jatuh_tempo: new Date(k.tanggal_jatuh_tempo),
      catatan:             k.catatan || null,
      items: {
        create: k.items
          .filter((it) => it.rokok_id && Number(it.qty) > 0)
          .map((it) => ({
            rokok_id:   it.rokok_id,
            qty_keluar: Number(it.qty),
            harga:      hargaMap[it.rokok_id]?.[k.kategori] || 0,
          })),
      },
    },
    include,
  })

  revalidatePath("/distribusi")
  revalidatePath("/titip-jual")
  return serialize(result)
}

export async function editSettlement(id, data) {
  const today = new Date(data.tanggal || new Date().toISOString().split("T")[0])

  await prisma.$transaction(async (tx) => {
    const old = await tx.titipJual.findUnique({ where: { id }, include: { items: true } })

    for (const it of old.items) {
      if (it.qty_kembali > 0) {
        await tx.rokok.update({ where: { id: it.rokok_id }, data: { stok: { decrement: it.qty_kembali } } })
      }
    }

    for (const it of data.items) {
      await tx.titipJualItem.update({
        where: { id: it.id },
        data:  { qty_terjual: it.qty_terjual, qty_kembali: it.qty_kembali },
      })
      if (it.qty_kembali > 0) {
        await tx.rokok.update({ where: { id: it.rokok_id }, data: { stok: { increment: it.qty_kembali } } })
      }
    }

    await tx.titipJualSetoran.deleteMany({ where: { titip_jual_id: id } })
    const validSetoran = (data.setoran || []).filter((s) => s.jumlah > 0)
    if (validSetoran.length > 0) {
      await tx.titipJualSetoran.createMany({
        data: validSetoran.map((s) => ({
          titip_jual_id: id,
          metode:        s.metode,
          jumlah:        s.jumlah,
          tanggal:       today,
        })),
      })
    }
  })

  revalidatePath("/titip-jual")
  revalidatePath("/distribusi")
  revalidatePath("/")
}

export async function revertSettlement(id) {
  await prisma.$transaction(async (tx) => {
    const old = await tx.titipJual.findUnique({ where: { id }, include: { items: true } })

    for (const it of old.items) {
      if (it.qty_kembali > 0) {
        await tx.rokok.update({ where: { id: it.rokok_id }, data: { stok: { decrement: it.qty_kembali } } })
      }
      await tx.titipJualItem.update({
        where: { id: it.id },
        data:  { qty_terjual: 0, qty_kembali: 0 },
      })
    }

    await tx.titipJualSetoran.deleteMany({ where: { titip_jual_id: id } })
    await tx.titipJual.update({ where: { id }, data: { status: "aktif", tanggal_selesai: null } })
  })

  revalidatePath("/titip-jual")
  revalidatePath("/distribusi")
  revalidatePath("/")
}
