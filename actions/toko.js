"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"

function serialize(t) {
  return { id: t.id, nama: t.nama, tipe: t.tipe, alamat: t.alamat, aktif: t.aktif }
}

export async function getTokoList() {
  const rows = await prisma.toko.findMany({ orderBy: { nama: "asc" } })
  return rows.map(serialize)
}

export async function addToko(data) {
  await prisma.toko.create({
    data: { nama: data.nama, tipe: data.tipe, alamat: data.alamat || null, aktif: true },
  })
  revalidatePath("/toko")
}

export async function updateToko(id, data) {
  await prisma.toko.update({
    where: { id },
    data:  { nama: data.nama, tipe: data.tipe, alamat: data.alamat || null, aktif: data.aktif },
  })
  revalidatePath("/toko")
}

export async function deleteToko(id) {
  await prisma.toko.delete({ where: { id } })
  revalidatePath("/toko")
}
