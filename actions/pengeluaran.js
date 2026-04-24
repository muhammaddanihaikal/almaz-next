"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"

export async function getPengeluaran() {
  const rows = await prisma.pengeluaran.findMany({ orderBy: { tanggal: "desc" } })
  return rows.map((r) => ({
    id: r.id,
    tanggal: r.tanggal.toISOString().split("T")[0],
    jumlah: r.jumlah,
    keterangan: r.keterangan,
  }))
}

export async function addPengeluaran(data) {
  await prisma.pengeluaran.create({
    data: {
      tanggal: new Date(data.tanggal),
      jumlah: Number(data.jumlah),
      keterangan: data.keterangan,
    },
  })
  revalidatePath("/pengeluaran")
  revalidatePath("/")
}

export async function updatePengeluaran(id, data) {
  await prisma.pengeluaran.update({
    where: { id },
    data: {
      tanggal: new Date(data.tanggal),
      jumlah: Number(data.jumlah),
      keterangan: data.keterangan,
    },
  })
  revalidatePath("/pengeluaran")
  revalidatePath("/")
}

export async function deletePengeluaran(id) {
  await prisma.pengeluaran.delete({ where: { id } })
  revalidatePath("/pengeluaran")
  revalidatePath("/")
}
