"use server"

import { prisma } from "@/lib/db"
import { revalidatePath, revalidateTag, unstable_cache } from "next/cache"

const SALES_TAG = "sales-list"

const _getSalesListCached = unstable_cache(
  async () => {
    const rows = await prisma.sales.findMany({ orderBy: { nama: "asc" } })
    return rows.map((s) => ({
      id: s.id,
      nama: s.nama,
      no_hp: s.no_hp || "",
      kategori: s.kategori || "grosir",
      aktif: s.aktif,
    }))
  },
  ["sales-list"],
  { tags: [SALES_TAG] }
)

export async function getSalesList() {
  return _getSalesListCached()
}

function bustSalesCache() {
  revalidateTag(SALES_TAG)
  revalidatePath("/sales")
}

export async function addSales(data) {
  await prisma.sales.create({
    data: { nama: data.nama, no_hp: data.no_hp || null, kategori: data.kategori || "grosir" },
  })
  bustSalesCache()
}

export async function updateSales(id, data) {
  await prisma.sales.update({
    where: { id },
    data: { nama: data.nama, no_hp: data.no_hp || null, kategori: data.kategori || "grosir" },
  })
  bustSalesCache()
}

export async function deleteSales(id) {
  await prisma.sales.delete({ where: { id } })
  bustSalesCache()
}

export async function toggleAktifSales(id) {
  const s = await prisma.sales.findUnique({ where: { id }, select: { aktif: true } })
  await prisma.sales.update({ where: { id }, data: { aktif: !s.aktif } })
  bustSalesCache()
}
