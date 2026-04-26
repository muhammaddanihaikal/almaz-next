"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"

function serialize(p) {
  const hasKeluar = p.keluarItems.length > 0
  const hasMasuk  = p.masukItems.length > 0
  return {
    id:            p.id,
    tanggal:       p.tanggal.toISOString().split("T")[0],
    sales:         p.sales.nama,
    sales_id:      p.sales_id,
    toko:          p.toko?.nama  || null,
    toko_id:       p.toko_id,
    tipe_penjualan: p.toko?.tipe || null,
    setoran_tipe:  p.setoran_tipe,
    setoran_total: p.setoran_total,
    status:        hasKeluar && !hasMasuk ? "belum_masuk" : "lengkap",
    keluarItems: p.keluarItems.map((it) => ({
      id:         it.id,
      rokok:      it.rokok.nama,
      rokok_id:   it.rokok_id,
      qty:        it.qty,
    })),
    masukItems: p.masukItems.map((it) => ({
      id:         it.id,
      rokok:      it.rokok.nama,
      rokok_id:   it.rokok_id,
      qty:        it.qty,
      harga:      it.harga,
      pembayaran: it.pembayaran,
    })),
    sampleItems: (p.sampleItems || []).map((it) => ({
      id:         it.id,
      rokok:      it.rokok.nama,
      rokok_id:   it.rokok_id,
      qty_keluar: it.qty_keluar,
      qty_masuk:  it.qty_masuk,
    })),
  }
}

const include = {
  sales: true,
  toko:  true,
  keluarItems: { include: { rokok: true } },
  masukItems:  { include: { rokok: true } },
  sampleItems: { include: { rokok: true } },
}

export async function getPenjualan() {
  const rows = await prisma.penjualan.findMany({ include, orderBy: { tanggal: "desc" } })
  return rows.map(serialize)
}

export async function addPenjualan(data) {
  const masuk   = data.masukItems  || []
  const samples = data.sampleItems || []
  await prisma.$transaction(async (tx) => {
    await tx.penjualan.create({
      data: {
        tanggal:       new Date(data.tanggal),
        sales_id:      data.sales_id,
        toko_id:       data.toko_id || null,
        setoran_tipe:  data.setoran_tipe  || null,
        setoran_total: data.setoran_total != null ? Number(data.setoran_total) : null,
        keluarItems: {
          create: (data.keluarItems || []).map((it) => ({
            rokok_id: it.rokok_id,
            qty:      it.qty,
          })),
        },
        masukItems: {
          create: masuk.map((it) => ({
            rokok_id:   it.rokok_id,
            qty:        it.qty,
            harga:      it.harga || 0,
            pembayaran: it.pembayaran || "Cash",
          })),
        },
        sampleItems: {
          create: samples.map((it) => ({
            rokok_id:  it.rokok_id,
            qty_keluar: it.qty_keluar || 0,
            qty_masuk:  it.qty_masuk  || 0,
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
    for (const it of samples) {
      if (it.qty_masuk > 0) {
        await tx.rokok.update({
          where: { id: it.rokok_id },
          data:  { stok: { decrement: it.qty_masuk } },
        })
      }
    }
  })
  revalidatePath("/penjualan")
  revalidatePath("/")
}

export async function updatePenjualan(id, data) {
  const masuk   = data.masukItems  || []
  const samples = data.sampleItems || []
  await prisma.$transaction(async (tx) => {
    const old = await tx.penjualan.findUnique({
      where: { id },
      include: { masukItems: true, sampleItems: true },
    })
    for (const it of old.masukItems) {
      await tx.rokok.update({
        where: { id: it.rokok_id },
        data:  { stok: { increment: it.qty } },
      })
    }
    for (const it of old.sampleItems) {
      if (it.qty_masuk > 0) {
        await tx.rokok.update({
          where: { id: it.rokok_id },
          data:  { stok: { increment: it.qty_masuk } },
        })
      }
    }
    await tx.penjualanKeluar.deleteMany({ where: { penjualan_id: id } })
    await tx.penjualanMasuk.deleteMany({  where: { penjualan_id: id } })
    await tx.penjualanSample.deleteMany({ where: { penjualan_id: id } })
    await tx.penjualan.update({
      where: { id },
      data: {
        tanggal:       new Date(data.tanggal),
        sales_id:      data.sales_id,
        toko_id:       data.toko_id || null,
        setoran_tipe:  data.setoran_tipe  || null,
        setoran_total: data.setoran_total != null ? Number(data.setoran_total) : null,
        keluarItems: {
          create: (data.keluarItems || []).map((it) => ({
            rokok_id: it.rokok_id,
            qty:      it.qty,
          })),
        },
        masukItems: {
          create: masuk.map((it) => ({
            rokok_id:   it.rokok_id,
            qty:        it.qty,
            harga:      it.harga || 0,
            pembayaran: it.pembayaran || "Cash",
          })),
        },
        sampleItems: {
          create: samples.map((it) => ({
            rokok_id:   it.rokok_id,
            qty_keluar: it.qty_keluar || 0,
            qty_masuk:  it.qty_masuk  || 0,
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
    for (const it of samples) {
      if (it.qty_masuk > 0) {
        await tx.rokok.update({
          where: { id: it.rokok_id },
          data:  { stok: { decrement: it.qty_masuk } },
        })
      }
    }
  })
  revalidatePath("/penjualan")
  revalidatePath("/")
}

export async function deletePenjualan(id) {
  await prisma.$transaction(async (tx) => {
    const old = await tx.penjualan.findUnique({
      where: { id },
      include: { masukItems: true, sampleItems: true },
    })
    for (const it of old.masukItems) {
      await tx.rokok.update({
        where: { id: it.rokok_id },
        data:  { stok: { increment: it.qty } },
      })
    }
    for (const it of old.sampleItems) {
      if (it.qty_masuk > 0) {
        await tx.rokok.update({
          where: { id: it.rokok_id },
          data:  { stok: { increment: it.qty_masuk } },
        })
      }
    }
    await tx.penjualan.delete({ where: { id } })
  })
  revalidatePath("/penjualan")
  revalidatePath("/")
}
