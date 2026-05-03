"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"

export async function getRetailList() {
  return prisma.retail.findMany({ orderBy: { nama: "asc" } })
}

export async function addRetail(data) {
  await prisma.retail.create({
    data: {
      nama:     data.nama.trim(),
      alamat:   data.alamat?.trim() || null,
      kategori: data.kategori,
      aktif:    true,
    },
  })
  revalidatePath("/retail")
  revalidatePath("/distribusi")
}

export async function updateRetail(id, data) {
  await prisma.retail.update({
    where: { id },
    data: {
      nama:     data.nama.trim(),
      alamat:   data.alamat?.trim() || null,
      kategori: data.kategori,
    },
  })
  revalidatePath("/retail")
  revalidatePath("/distribusi")
}

export async function deleteRetail(id) {
  await prisma.retail.delete({ where: { id } })
  revalidatePath("/retail")
}

export async function toggleAktifRetail(id) {
  const t = await prisma.retail.findUnique({ where: { id } })
  await prisma.retail.update({ where: { id }, data: { aktif: !t.aktif } })
  revalidatePath("/retail")
}
