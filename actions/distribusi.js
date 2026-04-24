"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"

function serialize(d) {
  return {
    id: d.id,
    tanggal: d.tanggal.toISOString().split("T")[0],
    tipe_penjualan: d.tipe_penjualan,
    sales: d.sales.nama,
    sales_id: d.sales_id,
    tanggal_bayar: d.tanggal_bayar ? d.tanggal_bayar.toISOString().split("T")[0] : null,
    items: d.items.map((it) => ({
      id: it.id,
      rokok: it.rokok.nama,
      rokok_id: it.rokok_id,
      qty: it.qty,
      harga: it.harga,
      pembayaran: it.pembayaran,
    })),
  }
}

const include = {
  sales: true,
  items: { include: { rokok: true } },
}

export async function getDistribusi() {
  const rows = await prisma.distribusi.findMany({ include, orderBy: { tanggal: "desc" } })
  return rows.map(serialize)
}

export async function addDistribusi(data) {
  await prisma.$transaction(async (tx) => {
    await tx.distribusi.create({
      data: {
        tanggal: new Date(data.tanggal),
        tipe_penjualan: data.tipe_penjualan,
                sales_id: data.sales_id,
        tanggal_bayar: data.tanggal_bayar ? new Date(data.tanggal_bayar) : null,
        items: {
          create: data.items.map((it) => ({
            rokok_id: it.rokok_id,
            qty: it.qty,
            harga: it.harga,
            pembayaran: it.pembayaran,
          })),
        },
      },
    })
    for (const it of data.items) {
      await tx.rokok.update({
        where: { id: it.rokok_id },
        data: { stok: { decrement: it.qty } },
      })
    }
  })
  revalidatePath("/penjualan")
  revalidatePath("/")
}

export async function updateDistribusi(id, data) {
  await prisma.$transaction(async (tx) => {
    const old = await tx.distribusi.findUnique({
      where: { id },
      include: { items: true },
    })
    // Restore stok for old items
    for (const it of old.items) {
      await tx.rokok.update({
        where: { id: it.rokok_id },
        data: { stok: { increment: it.qty } },
      })
    }
    // Replace items and apply new stok
    await tx.distribusiItem.deleteMany({ where: { distribusi_id: id } })
    await tx.distribusi.update({
      where: { id },
      data: {
        tanggal: new Date(data.tanggal),
        tipe_penjualan: data.tipe_penjualan,
                sales_id: data.sales_id,
        tanggal_bayar: data.tanggal_bayar ? new Date(data.tanggal_bayar) : null,
        items: {
          create: data.items.map((it) => ({
            rokok_id: it.rokok_id,
            qty: it.qty,
            harga: it.harga,
            pembayaran: it.pembayaran,
          })),
        },
      },
    })
    for (const it of data.items) {
      await tx.rokok.update({
        where: { id: it.rokok_id },
        data: { stok: { decrement: it.qty } },
      })
    }
  })
  revalidatePath("/penjualan")
  revalidatePath("/")
}

export async function deleteDistribusi(id) {
  await prisma.$transaction(async (tx) => {
    const old = await tx.distribusi.findUnique({ where: { id }, include: { items: true } })
    for (const it of old.items) {
      await tx.rokok.update({
        where: { id: it.rokok_id },
        data: { stok: { increment: it.qty } },
      })
    }
    await tx.distribusi.delete({ where: { id } })
  })
  revalidatePath("/penjualan")
  revalidatePath("/")
}
