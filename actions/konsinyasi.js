"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { mutateStock } from "@/lib/stock"

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
        await mutateStock({
          tx,
          rokok_id: it.rokok_id,
          tanggal: data.tanggal || new Date().toISOString().split("T")[0],
          jenis: 'in',
          qty: it.qty_kembali,
          source: 'konsinyasi_kembali',
          reference_id: id
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
      data:  { status: "selesai", tanggal_selesai: today },
    })
  })

  revalidatePath("/konsinyasi")
  revalidatePath("/distribusi")
  revalidatePath("/")
}

export async function editKonsinyasiDetail(id, data) {
  // data: { tanggal_jatuh_tempo, catatan }
  await prisma.konsinyasi.update({
    where: { id },
    data: {
      tanggal_jatuh_tempo: new Date(data.tanggal_jatuh_tempo),
      catatan:             data.catatan || null,
    },
  })
  revalidatePath("/konsinyasi")
  revalidatePath("/distribusi")
  revalidatePath("/")
}

export async function deleteKonsinyasi(id) {
  await prisma.$transaction(async (tx) => {
    const k = await tx.konsinyasi.findUnique({ where: { id }, include: { items: true } })
    if (k.status !== "aktif") throw new Error("Hanya konsinyasi aktif yang bisa dihapus")
    for (const it of k.items) {
      await mutateStock({
        tx,
        rokok_id: it.rokok_id,
        tanggal: k.createdAt, // Or today
        jenis: 'in',
        qty: it.qty_keluar,
        source: 'konsinyasi_delete_revert',
        reference_id: id
      })
    }
    await tx.konsinyasi.delete({ where: { id } })
  })
  revalidatePath("/konsinyasi")
  revalidatePath("/distribusi")
  revalidatePath("/")
}

export async function createKonsinyasi(sesiId, salesId, k) {
  const rokokList = await prisma.rokok.findMany()
  const hargaMap  = {}
  for (const r of rokokList) {
    hargaMap[r.id] = { grosir: r.harga_grosir, toko: r.harga_toko, perorangan: r.harga_perorangan }
  }

  const result = await prisma.konsinyasi.create({
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
  revalidatePath("/konsinyasi")
  return serialize(result)
}

export async function editSettlement(id, data) {
  const today = new Date(data.tanggal || new Date().toISOString().split("T")[0])

  await prisma.$transaction(async (tx) => {
    const old = await tx.konsinyasi.findUnique({ where: { id }, include: { items: true } })

    for (const it of old.items) {
      if (it.qty_kembali > 0) {
        await mutateStock({
          tx,
          rokok_id: it.rokok_id,
          tanggal: data.tanggal || new Date().toISOString().split("T")[0],
          jenis: 'out',
          qty: it.qty_kembali,
          source: 'konsinyasi_kembali_edit_revert',
          reference_id: id
        })
      }
    }

    for (const it of data.items) {
      await tx.konsinyasiItem.update({
        where: { id: it.id },
        data:  { qty_terjual: it.qty_terjual, qty_kembali: it.qty_kembali },
      })
      if (it.qty_kembali > 0) {
        await mutateStock({
          tx,
          rokok_id: it.rokok_id,
          tanggal: data.tanggal || new Date().toISOString().split("T")[0],
          jenis: 'in',
          qty: it.qty_kembali,
          source: 'konsinyasi_kembali',
          reference_id: id
        })
      }
    }

    await tx.konsinyasiSetoran.deleteMany({ where: { konsinyasi_id: id } })
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
  })

  revalidatePath("/konsinyasi")
  revalidatePath("/distribusi")
  revalidatePath("/")
}

export async function revertSettlement(id) {
  await prisma.$transaction(async (tx) => {
    const old = await tx.konsinyasi.findUnique({ where: { id }, include: { items: true } })

    for (const it of old.items) {
      if (it.qty_kembali > 0) {
        await mutateStock({
          tx,
          rokok_id: it.rokok_id,
          tanggal: new Date().toISOString().split("T")[0],
          jenis: 'out',
          qty: it.qty_kembali,
          source: 'konsinyasi_kembali_revert',
          reference_id: id
        })
      }
      await tx.konsinyasiItem.update({
        where: { id: it.id },
        data:  { qty_terjual: 0, qty_kembali: 0 },
      })
    }

    await tx.konsinyasiSetoran.deleteMany({ where: { konsinyasi_id: id } })
    await tx.konsinyasi.update({ where: { id }, data: { status: "aktif", tanggal_selesai: null } })
  })

  revalidatePath("/konsinyasi")
  revalidatePath("/distribusi")
  revalidatePath("/")
}
