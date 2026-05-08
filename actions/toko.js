"use server"

import { prisma } from "@/lib/db"
import { revalidatePath, revalidateTag, unstable_cache } from "next/cache"

const TOKO_TAG = "toko-list"

const _getTokoListCached = unstable_cache(
  async () => {
    const rows = await prisma.toko.findMany({ orderBy: { nama: "asc" } })
    return rows.map((t) => ({
      id:       t.id,
      nama:     t.nama,
      alamat:   t.alamat || "",
      kategori: t.kategori || "toko",
      aktif:    t.aktif,
    }))
  },
  ["toko-list"],
  { tags: [TOKO_TAG] }
)

export async function getTokoList() {
  return _getTokoListCached()
}

function bustTokoCache() {
  revalidateTag(TOKO_TAG)
  revalidatePath("/toko")
  revalidatePath("/distribusi")
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
  bustTokoCache()
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
  bustTokoCache()
}

export async function deleteToko(id) {
  await prisma.toko.delete({ where: { id } })
  bustTokoCache()
}

export async function toggleAktifToko(id) {
  const t = await prisma.toko.findUnique({ where: { id } })
  await prisma.toko.update({ where: { id }, data: { aktif: !t.aktif } })
  bustTokoCache()
}
