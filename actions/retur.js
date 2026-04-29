"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"

function serialize(r) {
  return {
    id: r.id,
    tanggal: r.tanggal.toISOString().split("T")[0],
    tipe_penjualan: r.tipe_penjualan,
    sales: r.sales.nama,
    sales_id: r.sales_id,
    alasan: r.alasan || "",
    items: r.items
      .sort((a, b) => (a.rokok?.urutan ?? 0) - (b.rokok?.urutan ?? 0))
      .map((it) => ({
      id: it.id,
      rokok: it.rokok.nama,
      rokok_id: it.rokok_id,
      qty: it.qty,
    })),
  }
}

const include = {
  sales: true,
  items: { include: { rokok: true } },
}

export async function getRetur() {
  const rows = await prisma.retur.findMany({ include, orderBy: { tanggal: "desc" } })
  return rows.map(serialize)
}

export async function addRetur(data) {
  await prisma.$transaction(async (tx) => {
    await tx.retur.create({
      data: {
        tanggal: new Date(data.tanggal),
        tipe_penjualan: data.tipe_penjualan,
                sales_id: data.sales_id,
        alasan: data.alasan || null,
        items: {
          create: data.items.map((it) => ({ rokok_id: it.rokok_id, qty: it.qty })),
        },
      },
    })
    for (const it of data.items) {
      await tx.rokok.update({
        where: { id: it.rokok_id },
        data: { stok: { increment: it.qty } },
      })
    }
  })
  revalidatePath("/retur")
  revalidatePath("/")
}

export async function updateRetur(id, data) {
  await prisma.$transaction(async (tx) => {
    const old = await tx.retur.findUnique({ where: { id }, include: { items: true } })
    // Reverse old stok (decrement, since retur increments)
    for (const it of old.items) {
      await tx.rokok.update({
        where: { id: it.rokok_id },
        data: { stok: { decrement: it.qty } },
      })
    }
    await tx.returItem.deleteMany({ where: { retur_id: id } })
    await tx.retur.update({
      where: { id },
      data: {
        tanggal: new Date(data.tanggal),
        tipe_penjualan: data.tipe_penjualan,
                sales_id: data.sales_id,
        alasan: data.alasan || null,
        items: {
          create: data.items.map((it) => ({ rokok_id: it.rokok_id, qty: it.qty })),
        },
      },
    })
    for (const it of data.items) {
      await tx.rokok.update({
        where: { id: it.rokok_id },
        data: { stok: { increment: it.qty } },
      })
    }
  })
  revalidatePath("/retur")
  revalidatePath("/")
}

export async function deleteRetur(id) {
  await prisma.$transaction(async (tx) => {
    const old = await tx.retur.findUnique({ where: { id }, include: { items: true } })
    for (const it of old.items) {
      await tx.rokok.update({
        where: { id: it.rokok_id },
        data: { stok: { decrement: it.qty } },
      })
    }
    await tx.retur.delete({ where: { id } })
  })
  revalidatePath("/retur")
  revalidatePath("/")
}
