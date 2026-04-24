"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"

function serialize(d) {
  return {
    id: d.id,
    tanggal: d.tanggal.toISOString().split("T")[0],
    sales: d.sales.nama,
    sales_id: d.sales_id,
    items: d.items.map((it) => ({
      id: it.id,
      rokok: it.rokok.nama,
      rokok_id: it.rokok_id,
      qty: it.qty,
    })),
  }
}

const include = { sales: true, items: { include: { rokok: true } } }

export async function getBarangKeluar() {
  const rows = await prisma.barangKeluar.findMany({ include, orderBy: { tanggal: "desc" } })
  return rows.map(serialize)
}

export async function addBarangKeluar(data) {
  await prisma.barangKeluar.create({
    data: {
      tanggal: new Date(data.tanggal),
      sales_id: data.sales_id,
      items: { create: data.items.map((it) => ({ rokok_id: it.rokok_id, qty: it.qty })) },
    },
  })
  revalidatePath("/barang-keluar")
}

export async function updateBarangKeluar(id, data) {
  await prisma.barangKeluarItem.deleteMany({ where: { barang_keluar_id: id } })
  await prisma.barangKeluar.update({
    where: { id },
    data: {
      tanggal: new Date(data.tanggal),
      sales_id: data.sales_id,
      items: { create: data.items.map((it) => ({ rokok_id: it.rokok_id, qty: it.qty })) },
    },
  })
  revalidatePath("/barang-keluar")
}

export async function deleteBarangKeluar(id) {
  await prisma.barangKeluar.delete({ where: { id } })
  revalidatePath("/barang-keluar")
}
