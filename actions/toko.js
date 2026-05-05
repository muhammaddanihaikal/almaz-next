"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"

export async function getTokoList() {
  return prisma.toko.findMany({ orderBy: { nama: "asc" } })
}

export async function addToko(data) {
  await prisma.toko.create({
    data: {
      nama:     data.nama.trim(),
      alamat:   data.alamat?.trim() || null,
      kategori: data.kategori,
      aktif:    true,
    },
  })
  revalidatePath("/toko")
  revalidatePath("/distribusi")
}

export async function updateToko(id, data) {
  await prisma.toko.update({
    where: { id },
    data: {
      nama:     data.nama.trim(),
      alamat:   data.alamat?.trim() || null,
      kategori: data.kategori,
    },
  })
  revalidatePath("/toko")
  revalidatePath("/distribusi")
}

export async function deleteToko(id) {
  await prisma.toko.delete({ where: { id } })
  revalidatePath("/toko")
}

export async function toggleAktifToko(id) {
  const t = await prisma.toko.findUnique({ where: { id } })
  await prisma.toko.update({ where: { id }, data: { aktif: !t.aktif } })
  revalidatePath("/toko")
}
