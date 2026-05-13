"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { nowJakarta } from "@/lib/utils"

// Default: hanya muat absensi 30 hari terakhir untuk performa.
// Halaman pakai filter tanggal di client; data lebih lama bisa diakses
// dengan memanggil getAbsensi(daysBack) dengan nilai lebih besar / null.
// Sales relation tidak di-include karena halaman sudah punya salesList sendiri.
export async function getAbsensi(daysBack = 30) {
  const where = {}
  if (daysBack && Number.isFinite(daysBack)) {
    const since = nowJakarta()
    since.setHours(0, 0, 0, 0)
    since.setDate(since.getDate() - daysBack)
    where.tanggal = { gte: since }
  }
  const rows = await prisma.absensi.findMany({
    where,
    orderBy: { tanggal: "desc" },
  })
  return rows.map((a) => ({
    id: a.id,
    tanggal: a.tanggal.toISOString().split("T")[0],
    sales_id: a.sales_id,
    status: a.status,
    reason: a.reason || "",
  }))
}

export async function saveAbsensi(tanggal, records) {
  await prisma.$transaction(async (tx) => {
    await tx.absensi.deleteMany({ where: { tanggal: new Date(tanggal) } })
    await tx.absensi.createMany({
      data: records.map((r) => ({
        tanggal: new Date(tanggal),
        sales_id: r.sales_id,
        status: r.status,
        reason: r.reason || null,
      })),
    })
  })
  revalidatePath("/absensi")
}

export async function deleteAbsensi(tanggal) {
  await prisma.absensi.deleteMany({ where: { tanggal: new Date(tanggal) } })
  revalidatePath("/absensi")
}
