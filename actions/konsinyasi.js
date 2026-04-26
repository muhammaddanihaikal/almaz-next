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
    status:              k.status,
    catatan:             k.catatan,
    createdAt:           k.createdAt.toISOString(),
    nilaiTotal,
    nilaiTerjual,
    totalSetoran,
    flagSetoran,
    flagJatuhTempo,
    selisihHari,
    items: k.items.map((it) => ({
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

export async function getKonsinyasiList() {
  const rows = await prisma.konsinyasi.findMany({
    include,
    orderBy: { tanggal_jatuh_tempo: "asc" },
  })
  return rows.map(serialize)
}

export async function getKonsinyasiJatuhTempo() {
  const tiga_hari = new Date()
  tiga_hari.setDate(tiga_hari.getDate() + 3)
  const rows = await prisma.konsinyasi.findMany({
    where: {
      status: "aktif",
      tanggal_jatuh_tempo: { lte: tiga_hari },
    },
    include,
    orderBy: { tanggal_jatuh_tempo: "asc" },
  })
  return rows.map(serialize)
}

export async function settleKonsinyasi(id, data) {
  // data: { items: [{id, rokok_id, qty_terjual, qty_kembali}], setoran: [{metode, jumlah}], tanggal }
  const today = new Date(data.tanggal || new Date().toISOString().split("T")[0])

  await prisma.$transaction(async (tx) => {
    // Update qty_terjual & qty_kembali tiap item, kembalikan stok untuk yg kembali
    for (const it of data.items) {
      await tx.konsinyasiItem.update({
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

    // Catat setoran
    const validSetoran = (data.setoran || []).filter((s) => s.jumlah > 0)
    if (validSetoran.length > 0) {
      await tx.konsinyasiSetoran.createMany({
        data: validSetoran.map((s) => ({
          konsinyasi_id: id,
          metode:        s.metode,
          jumlah:        s.jumlah,
          tanggal:       today,
        })),
      })
    }

    // Update status jadi selesai
    await tx.konsinyasi.update({
      where: { id },
      data:  { status: "selesai" },
    })
  })

  revalidatePath("/konsinyasi")
  revalidatePath("/distribusi")
  revalidatePath("/")
}
