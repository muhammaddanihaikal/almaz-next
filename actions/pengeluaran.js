"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { logAudit, AUDIT_ACTION, AUDIT_ENTITY } from "@/lib/audit"

async function getPosisiUang(tx, tanggalDate, excludeId = null) {
  const tgl = new Date(tanggalDate)
  const startOfMonth = new Date(tgl.getFullYear(), tgl.getMonth(), 1)
  
  const sesiList = await tx.sesiHarian.findMany({
    where: { 
      tanggal: { 
        gte: startOfMonth,
        lte: tgl 
      } 
    },
    include: { penjualan: true }
  })
  const totalSesi = sesiList.reduce((acc, s) => acc + s.penjualan.reduce((ss, it) => ss + (it.qty * it.harga), 0), 0)

  const titipList = await tx.titipJual.findMany({
    where: { 
      status: "selesai", 
      tanggal_selesai: { 
        gte: startOfMonth,
        lte: tgl 
      } 
    },
    include: { items: true }
  })
  const totalTitip = titipList.reduce((acc, t) => acc + t.items.reduce((ss, it) => ss + (it.qty_terjual * it.harga), 0), 0)

  const penjualanSaatItu = totalSesi + totalTitip

  const pengeluaranWhere = { 
    sumber: "penjualan", 
    tanggal: { 
      gte: startOfMonth,
      lte: tgl 
    } 
  }
  if (excludeId) {
    pengeluaranWhere.id = { not: excludeId }
  }
  const pengeluaranList = await tx.pengeluaran.findMany({
    where: pengeluaranWhere
  })
  const pengeluaranSebelumnya = pengeluaranList.reduce((acc, p) => acc + p.jumlah, 0)

  return penjualanSaatItu - pengeluaranSebelumnya
}

export async function getPengeluaran() {
  const rows = await prisma.pengeluaran.findMany({ orderBy: { tanggal: "desc" } })
  return rows.map((r) => ({
    id: r.id,
    tanggal: r.tanggal.toISOString().split("T")[0],
    jumlah: r.jumlah,
    keterangan: r.keterangan,
    sumber: r.sumber ?? "penjualan",
  }))
}

export async function addPengeluaran(data) {
  const session = await auth()
  const sumber = data.sumber ?? "penjualan"
  await prisma.$transaction(async (tx) => {
    const row = await tx.pengeluaran.create({
      data: {
        tanggal: new Date(data.tanggal),
        jumlah: Number(data.jumlah),
        keterangan: data.keterangan,
        sumber,
      },
    })

    const uangPenjualan = await getPosisiUang(tx, data.tanggal, row.id)
    const isPenjualan = sumber === "penjualan"

    await logAudit({
      tx,
      entity_type: AUDIT_ENTITY.PENGELUARAN,
      change_type: "Tambah Pengeluaran",
      entity_id:   row.id,
      action:      AUDIT_ACTION.CREATE,
      new_values:  { 
        tanggal: data.tanggal, 
        jumlah: row.jumlah, 
        keterangan: row.keterangan, 
        sumber: row.sumber,
        uang_penjualan_tersedia: uangPenjualan,
        pengeluaran_dikurangkan: isPenjualan ? row.jumlah : 0,
        sisa_uang_penjualan: uangPenjualan - (isPenjualan ? row.jumlah : 0)
      },
      user_id:     session?.user?.id,
      user_name:   session?.user?.name,
    })
  })
  revalidatePath("/pengeluaran")
  revalidatePath("/")
}

export async function updatePengeluaran(id, data, alasan) {
  const session = await auth()
  const sumber = data.sumber ?? "penjualan"
  await prisma.$transaction(async (tx) => {
    const old = await tx.pengeluaran.findUnique({ where: { id } })
    const oldUangPenjualan = await getPosisiUang(tx, old.tanggal, id)
    const oldIsPenjualan = (old.sumber ?? "penjualan") === "penjualan"

    await tx.pengeluaran.update({
      where: { id },
      data: {
        tanggal: new Date(data.tanggal),
        jumlah: Number(data.jumlah),
        keterangan: data.keterangan,
        sumber,
      },
    })

    const newUangPenjualan = await getPosisiUang(tx, data.tanggal, id)
    const newIsPenjualan = sumber === "penjualan"

    await logAudit({
      tx,
      entity_type: AUDIT_ENTITY.PENGELUARAN,
      change_type: "Edit Pengeluaran",
      entity_id:   id,
      action:      AUDIT_ACTION.UPDATE,
      old_values:  { 
        tanggal: old.tanggal.toISOString().split("T")[0], 
        jumlah: old.jumlah, 
        keterangan: old.keterangan, 
        sumber: old.sumber ?? "penjualan",
        uang_penjualan_tersedia: oldUangPenjualan,
        pengeluaran_dikurangkan: oldIsPenjualan ? old.jumlah : 0,
        sisa_uang_penjualan: oldUangPenjualan - (oldIsPenjualan ? old.jumlah : 0)
      },
      new_values:  { 
        tanggal: data.tanggal, 
        jumlah: Number(data.jumlah), 
        keterangan: data.keterangan, 
        sumber,
        uang_penjualan_tersedia: newUangPenjualan,
        pengeluaran_dikurangkan: newIsPenjualan ? Number(data.jumlah) : 0,
        sisa_uang_penjualan: newUangPenjualan - (newIsPenjualan ? Number(data.jumlah) : 0)
      },
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
    const oldUangPenjualan = await getPosisiUang(tx, old.tanggal, id)
    const oldIsPenjualan = (old.sumber ?? "penjualan") === "penjualan"

    await logAudit({
      tx,
      entity_type: AUDIT_ENTITY.PENGELUARAN,
      change_type: "Hapus Pengeluaran",
      entity_id:   id,
      action:      AUDIT_ACTION.DELETE,
      old_values:  { 
        tanggal: old.tanggal.toISOString().split("T")[0], 
        jumlah: old.jumlah, 
        keterangan: old.keterangan, 
        sumber: old.sumber ?? "penjualan",
        uang_penjualan_tersedia: oldUangPenjualan,
        pengeluaran_dikurangkan: oldIsPenjualan ? old.jumlah : 0,
        sisa_uang_penjualan: oldUangPenjualan - (oldIsPenjualan ? old.jumlah : 0)
      },
      alasan,
      user_id:     session?.user?.id,
      user_name:   session?.user?.name,
    })
    await tx.pengeluaran.delete({ where: { id } })
  })
  revalidatePath("/pengeluaran")
  revalidatePath("/")
}
