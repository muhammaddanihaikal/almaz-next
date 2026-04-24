"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"

export async function getAbsensi() {
  const rows = await prisma.absensi.findMany({
    include: { sales: true },
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
