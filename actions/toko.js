"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"

export async function getTokoList() {
  const rows = await prisma.toko.findMany({ orderBy: { nama: "asc" } })
  return rows.map((t) => ({
    id: t.id,
    nama: t.nama,
    no_hp: t.no_hp || "",
    alamat: t.alamat || "",
    tipe_harga: t.tipe_harga,
    aktif: t.aktif,
  }))
}

export async function addToko(data) {
  await prisma.toko.create({
    data: {
      nama: data.nama,
      no_hp: data.no_hp || null,
      alamat: data.alamat || null,
      tipe_harga: data.tipe_harga,
    },
  })
  revalidatePath("/toko")
}

export async function updateToko(id, data) {
  await prisma.toko.update({
    where: { id },
    data: {
      nama: data.nama,
      no_hp: data.no_hp || null,
      alamat: data.alamat || null,
      tipe_harga: data.tipe_harga,
    },
  })
  revalidatePath("/toko")
}

export async function deleteToko(id) {
  await prisma.toko.delete({ where: { id } })
  revalidatePath("/toko")
}

export async function toggleAktifToko(id) {
  const t = await prisma.toko.findUnique({ where: { id }, select: { aktif: true } })
  await prisma.toko.update({ where: { id }, data: { aktif: !t.aktif } })
  revalidatePath("/toko")
}
