"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { logAudit, AUDIT_ACTION, AUDIT_ENTITY } from "@/lib/audit"

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
  const session = await auth()
  await prisma.$transaction(async (tx) => {
    const row = await tx.pengeluaran.create({
      data: {
        tanggal: new Date(data.tanggal),
        jumlah: Number(data.jumlah),
        keterangan: data.keterangan,
      },
    })
    await logAudit({
      tx,
      entity_type: AUDIT_ENTITY.PENGELUARAN,
      change_type: "Tambah Pengeluaran",
      entity_id:   row.id,
      action:      AUDIT_ACTION.CREATE,
      new_values:  { tanggal: data.tanggal, jumlah: row.jumlah, keterangan: row.keterangan },
      user_id:     session?.user?.id,
      user_name:   session?.user?.name,
    })
  })
  revalidatePath("/pengeluaran")
  revalidatePath("/")
}

export async function updatePengeluaran(id, data, alasan) {
  const session = await auth()
  await prisma.$transaction(async (tx) => {
    const old = await tx.pengeluaran.findUnique({ where: { id } })
    await tx.pengeluaran.update({
      where: { id },
      data: {
        tanggal: new Date(data.tanggal),
        jumlah: Number(data.jumlah),
        keterangan: data.keterangan,
      },
    })
    await logAudit({
      tx,
      entity_type: AUDIT_ENTITY.PENGELUARAN,
      change_type: "Edit Pengeluaran",
      entity_id:   id,
      action:      AUDIT_ACTION.UPDATE,
      old_values:  { tanggal: old.tanggal.toISOString().split("T")[0], jumlah: old.jumlah, keterangan: old.keterangan },
      new_values:  { tanggal: data.tanggal, jumlah: Number(data.jumlah), keterangan: data.keterangan },
      alasan,
      user_id:     session?.user?.id,
      user_name:   session?.user?.name,
    })
  })
  revalidatePath("/pengeluaran")
  revalidatePath("/")
}

export async function deletePengeluaran(id, alasan) {
  const session = await auth()
  await prisma.$transaction(async (tx) => {
    const old = await tx.pengeluaran.findUnique({ where: { id } })
    await logAudit({
      tx,
      entity_type: AUDIT_ENTITY.PENGELUARAN,
      change_type: "Hapus Pengeluaran",
      entity_id:   id,
      action:      AUDIT_ACTION.DELETE,
      old_values:  { tanggal: old.tanggal.toISOString().split("T")[0], jumlah: old.jumlah, keterangan: old.keterangan },
      alasan,
      user_id:     session?.user?.id,
      user_name:   session?.user?.name,
    })
    await tx.pengeluaran.delete({ where: { id } })
  })
  revalidatePath("/pengeluaran")
  revalidatePath("/")
}
