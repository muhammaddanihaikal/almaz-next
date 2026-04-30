"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { mutateStock } from "@/lib/stock"

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
      rokok: it.rokok?.nama || "???",
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
    const r = await tx.retur.create({
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
      await mutateStock({
        tx,
        rokok_id: it.rokok_id,
        tanggal: data.tanggal,
        jenis: 'in',
        qty: it.qty,
        source: 'retur',
        reference_id: r.id
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
      await mutateStock({
        tx,
        rokok_id: it.rokok_id,
        tanggal: data.tanggal,
        jenis: 'out',
        qty: it.qty,
        source: 'retur_edit_revert',
        reference_id: id
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
      await mutateStock({
        tx,
        rokok_id: it.rokok_id,
        tanggal: data.tanggal,
        jenis: 'in',
        qty: it.qty,
        source: 'retur',
        reference_id: id
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
      await mutateStock({
        tx,
        rokok_id: it.rokok_id,
        tanggal: old.tanggal,
        jenis: 'out',
        qty: it.qty,
        source: 'retur_delete_revert',
        reference_id: id
      })
    }
    await tx.retur.delete({ where: { id } })
  })
  revalidatePath("/retur")
  revalidatePath("/")
}
