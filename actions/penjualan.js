"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"

function serialize(p) {
  const hasKeluar = p.keluarItems.length > 0
  const hasMasuk  = p.masukItems.length > 0
  return {
    id:             p.id,
    tanggal:        p.tanggal.toISOString().split("T")[0],
    sales:          p.sales.nama,
    sales_id:       p.sales_id,
    tipe_penjualan: p.tipe_penjualan,
    setoran_tipe:   p.setoran_tipe,
    setoran_total:  p.setoran_total,
    status:         hasKeluar && !hasMasuk ? "belum_masuk" : "lengkap",
    keluarItems: p.keluarItems.map((it) => ({
      id:        it.id,
      rokok:     it.rokok.nama,
      rokok_id:  it.rokok_id,
      qty:       it.qty,
      is_sample: it.is_sample,
    })),
    masukItems: p.masukItems.map((it) => ({
      id:         it.id,
      rokok:      it.rokok.nama,
      rokok_id:   it.rokok_id,
      qty:        it.qty,
      harga:      it.harga,
      pembayaran: it.pembayaran,
      is_sample:  it.is_sample,
    })),
  }
}

const include = {
  sales: true,
  keluarItems: { include: { rokok: true } },
  masukItems:  { include: { rokok: true } },
}

export async function getPenjualan() {
  const rows = await prisma.penjualan.findMany({ include, orderBy: { tanggal: "desc" } })
  return rows.map(serialize)
}

export async function addPenjualan(data) {
  const masuk = data.masukItems || []
  await prisma.$transaction(async (tx) => {
    await tx.penjualan.create({
      data: {
        tanggal:        new Date(data.tanggal),
        sales_id:       data.sales_id,
        tipe_penjualan: data.tipe_penjualan,
        setoran_tipe:   data.setoran_tipe  || null,
        setoran_total:  data.setoran_total != null ? Number(data.setoran_total) : null,
        keluarItems: {
          create: (data.keluarItems || []).map((it) => ({
            rokok_id:  it.rokok_id,
            qty:       it.qty,
            is_sample: !!it.is_sample,
          })),
        },
        masukItems: {
          create: masuk.map((it) => ({
            rokok_id:   it.rokok_id,
            qty:        it.qty,
            harga:      it.harga || 0,
            pembayaran: it.is_sample ? "Cash" : (it.pembayaran || "Cash"),
            is_sample:  !!it.is_sample,
          })),
        },
      },
    })
    for (const it of masuk) {
      await tx.rokok.update({
        where: { id: it.rokok_id },
        data:  { stok: { decrement: it.qty } },
      })
    }
  })
  revalidatePath("/penjualan")
  revalidatePath("/")
}

export async function updatePenjualan(id, data) {
  const masuk = data.masukItems || []
  await prisma.$transaction(async (tx) => {
    const old = await tx.penjualan.findUnique({ where: { id }, include: { masukItems: true } })
    for (const it of old.masukItems) {
      await tx.rokok.update({
        where: { id: it.rokok_id },
        data:  { stok: { increment: it.qty } },
      })
    }
    await tx.penjualanKeluar.deleteMany({ where: { penjualan_id: id } })
    await tx.penjualanMasuk.deleteMany({  where: { penjualan_id: id } })
    await tx.penjualan.update({
      where: { id },
      data: {
        tanggal:        new Date(data.tanggal),
        sales_id:       data.sales_id,
        tipe_penjualan: data.tipe_penjualan,
        setoran_tipe:   data.setoran_tipe  || null,
        setoran_total:  data.setoran_total != null ? Number(data.setoran_total) : null,
        keluarItems: {
          create: (data.keluarItems || []).map((it) => ({
            rokok_id:  it.rokok_id,
            qty:       it.qty,
            is_sample: !!it.is_sample,
          })),
        },
        masukItems: {
          create: masuk.map((it) => ({
            rokok_id:   it.rokok_id,
            qty:        it.qty,
            harga:      it.harga || 0,
            pembayaran: it.is_sample ? "Cash" : (it.pembayaran || "Cash"),
            is_sample:  !!it.is_sample,
          })),
        },
      },
    })
    for (const it of masuk) {
      await tx.rokok.update({
        where: { id: it.rokok_id },
        data:  { stok: { decrement: it.qty } },
      })
    }
  })
  revalidatePath("/penjualan")
  revalidatePath("/")
}

export async function deletePenjualan(id) {
  await prisma.$transaction(async (tx) => {
    const old = await tx.penjualan.findUnique({ where: { id }, include: { masukItems: true } })
    for (const it of old.masukItems) {
      await tx.rokok.update({
        where: { id: it.rokok_id },
        data:  { stok: { increment: it.qty } },
      })
    }
    await tx.penjualan.delete({ where: { id } })
  })
  revalidatePath("/penjualan")
  revalidatePath("/")
}
