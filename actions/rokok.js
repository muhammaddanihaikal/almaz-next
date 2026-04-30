"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { mutateStock, MUTATION_SOURCE } from "@/lib/stock"
import { auth } from "@/lib/auth"

export async function getRokokList() {
  try {
    const rows = await prisma.rokok.findMany({ orderBy: { urutan: "asc" } })
    return rows.map((r) => ({
      id: r.id,
      nama: r.nama,
      stok: r.stok,
      harga_beli: r.harga_beli,
      harga_grosir: r.harga_grosir,
      harga_toko: r.harga_toko,
      harga_perorangan: r.harga_perorangan,
      aktif: r.aktif,
      urutan: r.urutan,
    }))
  } catch (error) {
    console.error("Gagal mengambil daftar rokok dengan urutan custom:", error)
    const rows = await prisma.rokok.findMany({ orderBy: { nama: "asc" } })
    return rows.map((r) => ({
      id: r.id,
      nama: r.nama,
      stok: r.stok,
      harga_beli: r.harga_beli,
      harga_grosir: r.harga_grosir,
      harga_toko: r.harga_toko,
      harga_perorangan: r.harga_perorangan,
      aktif: r.aktif,
      urutan: r.urutan ?? 0,
    }))
  }
}

export async function addRokok(data) {
  const maxUrutan = await prisma.rokok.aggregate({
    _max: { urutan: true },
  })
  const nextUrutan = (maxUrutan._max.urutan ?? -1) + 1

  await prisma.$transaction(async (tx) => {
    const r = await tx.rokok.create({
      data: {
        nama: data.nama,
        stok: Number(data.stok) || 0,
        harga_beli: Number(data.harga_beli),
        harga_grosir: Number(data.harga_grosir),
        harga_toko: Number(data.harga_toko),
        harga_perorangan: Number(data.harga_perorangan),
        urutan: nextUrutan,
      },
    })
    if (r.stok > 0) {
      const sm = await tx.stokMasuk.create({
        data: {
          rokok_id: r.id,
          qty:      r.stok,
          tanggal:  new Date(),
          keterangan: "Stok Awal",
        },
      })
      const session = await auth()
      await mutateStock({
        tx,
        rokok_id: r.id,
        tanggal: new Date(),
        jenis: 'in',
        qty: r.stok,
        source: MUTATION_SOURCE.STOK_AWAL,
        reference_id: sm.id,
        keterangan: `Stok awal saat data rokok dibuat`,
        user_id: session?.user?.id || null,
      })
    }
  })
  revalidatePath("/rokok")
}

export async function updateRokok(id, data) {
  await prisma.rokok.update({
    where: { id },
    data: {
      nama: data.nama,
      // stok: Number(data.stok) || 0, // Dihapus: stok diatur oleh stock_mutations
      harga_beli: Number(data.harga_beli),
      harga_grosir: Number(data.harga_grosir),
      harga_toko: Number(data.harga_toko),
      harga_perorangan: Number(data.harga_perorangan),
    },
  })
  revalidatePath("/rokok")
}

export async function deleteRokok(id) {
  await prisma.rokok.delete({ where: { id } })
  revalidatePath("/rokok")
}

export async function toggleAktifRokok(id) {
  const r = await prisma.rokok.findUnique({ where: { id }, select: { aktif: true } })
  await prisma.rokok.update({ where: { id }, data: { aktif: !r.aktif } })
  revalidatePath("/rokok")
}

export async function tambahStok(id, qty, date, keterangan) {
  await prisma.$transaction(async (tx) => {
    const sm = await tx.stokMasuk.create({
      data: {
        rokok_id: id,
        qty:      qty,
        tanggal:  new Date(date),
        keterangan: keterangan || "Stok Masuk",
      },
    })
    
    const session = await auth()
    await mutateStock({
      tx,
      rokok_id: id,
      tanggal: new Date(date),
      jenis: 'in',
      qty: qty,
      source: MUTATION_SOURCE.SUPPLIER,
      reference_id: sm.id,
      keterangan: keterangan || "Stok Masuk dari Supplier",
      user_id: session?.user?.id || null,
    })
  })
  revalidatePath("/rokok")
}

export async function updateRokokOrder(items) {
  try {
    await Promise.all(
      items.map((it) =>
        prisma.rokok.update({
          where: { id: it.id },
          data: { urutan: it.urutan },
        })
      )
    )
    revalidatePath("/rokok")
    return { success: true }
  } catch (error) {
    console.error("DETAIL ERROR SIMPAN URUTAN:", error)
    return { 
      success: false, 
      error: `Gagal: ${error.message || "Unknown error"}` 
    }
  }
}
export async function getUsedRokokIds() {
  const mutations = await prisma.stockMutation.findMany({ select: { rokok_id: true }, distinct: ["rokok_id"] })
  return mutations.map(m => m.rokok_id)
}

export async function getMutasiStok(startDate, endDate) {
  const start = new Date(startDate)
  const end   = new Date(endDate)

  const rokokList = await prisma.rokok.findMany({ orderBy: { urutan: "asc" } })

  // 1. Get initial balance before startDate
  const preMutations = await prisma.stockMutation.groupBy({
    by: ["rokok_id", "jenis"],
    where: { tanggal: { lt: start } },
    _sum: { qty: true }
  })

  const initialBalances = {}
  for (const r of rokokList) {
    const inQty = preMutations.find(m => m.rokok_id === r.id && m.jenis === 'in')?._sum.qty || 0
    const outQty = preMutations.find(m => m.rokok_id === r.id && m.jenis === 'out')?._sum.qty || 0
    initialBalances[r.id] = inQty - outQty
  }

  // 2. Get activity in range
  const inRangeMutations = await prisma.stockMutation.findMany({
    where: { tanggal: { gte: start, lte: end } },
    include: {
      user: { select: { name: true, username: true } },
      rokok: { select: { nama: true } }
    },
    orderBy: { createdAt: "desc" }
  })

  // 3. Build daily summary
  const report = []
  let currentDate = new Date(start)
  const currentBalances = { ...initialBalances }

  while (currentDate <= end) {
    const dStr = currentDate.toISOString().split("T")[0]
    const dayRows = []

    for (const r of rokokList) {
      const todayMuts = inRangeMutations.filter(m => m.rokok_id === r.id && m.tanggal.toISOString().split("T")[0] === dStr)
      
      const totalMasuk = todayMuts.filter(m => m.jenis === 'in').reduce((s, m) => s + m.qty, 0)
      const totalKeluar = todayMuts.filter(m => m.jenis === 'out').reduce((s, m) => s + m.qty, 0)
      
      // Keep old detail mapping for UI compatibility (supplier=masuk, retur_sales=kembali, retur=retur)
      const detail_masuk = todayMuts.filter(m => m.jenis === 'in' && m.source === 'supplier').reduce((s, m) => s + m.qty, 0)
      const detail_kembali = todayMuts.filter(m => m.jenis === 'in' && m.source === 'retur_sales').reduce((s, m) => s + m.qty, 0)
      const detail_retur = todayMuts.filter(m => m.jenis === 'in' && m.source === 'retur').reduce((s, m) => s + m.qty, 0)

      const awal = currentBalances[r.id]
      const akhir = awal + totalMasuk - totalKeluar

      if (awal !== 0 || totalMasuk !== 0 || totalKeluar !== 0) {
        dayRows.push({
          rokok_id: r.id,
          nama:     r.nama,
          awal,
          masuk:    totalMasuk,
          keluar:   totalKeluar,
          akhir,
          detail_masuk,
          detail_kembali,
          detail_retur,
          details: todayMuts // attach detailed records for this rokok on this day
        })
      }
      currentBalances[r.id] = akhir
    }

    if (dayRows.length > 0) {
      report.push({ tanggal: dStr, data: dayRows })
    }
    currentDate.setDate(currentDate.getDate() + 1)
  }

  return report.reverse()
}

export async function koreksiStok(id, qty, jenis, keterangan) {
  const session = await auth()
  await prisma.$transaction(async (tx) => {
    await mutateStock({
      tx,
      rokok_id: id,
      tanggal: new Date(),
      jenis, // 'in' or 'out'
      qty,
      source: MUTATION_SOURCE.KOREKSI,
      reference_id: "manual",
      keterangan: keterangan || "Koreksi manual admin",
      user_id: session?.user?.id || null,
    })
  })
  revalidatePath("/rokok")
}
