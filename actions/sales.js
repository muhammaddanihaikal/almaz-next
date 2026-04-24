"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"

export async function getSalesList() {
  const rows = await prisma.sales.findMany({ orderBy: { nama: "asc" } })
  return rows.map((s) => ({
    id: s.id,
    nama: s.nama,
    no_hp: s.no_hp || "",
    aktif: s.aktif,
  }))
}

export async function addSales(data) {
  await prisma.sales.create({
    data: { nama: data.nama, no_hp: data.no_hp || null },
  })
  revalidatePath("/sales")
}

export async function updateSales(id, data) {
  await prisma.sales.update({
    where: { id },
    data: { nama: data.nama, no_hp: data.no_hp || null },
  })
  revalidatePath("/sales")
}

export async function deleteSales(id) {
  await prisma.sales.delete({ where: { id } })
  revalidatePath("/sales")
}

export async function toggleAktifSales(id) {
  const s = await prisma.sales.findUnique({ where: { id }, select: { aktif: true } })
  await prisma.sales.update({ where: { id }, data: { aktif: !s.aktif } })
  revalidatePath("/sales")
}
