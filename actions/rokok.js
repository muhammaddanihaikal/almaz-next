"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { mutateStock, MUTATION_SOURCE } from "@/lib/stock"
import { auth } from "@/lib/auth"
import { logAudit, AUDIT_ACTION, AUDIT_ENTITY } from "@/lib/audit"

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
  const session = await auth()
  let userId = session?.user?.id
  if (!userId && session?.user?.name) {
    const u = await prisma.user.findFirst({
      where: { OR: [{ name: session.user.name }, { username: session.user.name }] }
    })
    userId = u?.id
  }

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
      await mutateStock({
        tx,
        rokok_id: r.id,
        tanggal: new Date(),
        jenis: 'in',
        qty: r.stok,
        source: MUTATION_SOURCE.STOK_AWAL,
        reference_id: sm.id,
        keterangan: `Stok awal saat data rokok dibuat`,
        user_id: userId || null,
      })
    }
    await logAudit({
      tx,
      entity_type: AUDIT_ENTITY.ROKOK,
      change_type: "Tambah Rokok",
      entity_id:   r.id,
      action:      AUDIT_ACTION.CREATE,
      new_values:  { nama: r.nama, stok: r.stok, harga_beli: r.harga_beli, harga_grosir: r.harga_grosir, harga_toko: r.harga_toko, harga_perorangan: r.harga_perorangan },
      user_id:     userId,
      user_name:   session?.user?.name,
    })
  })
  revalidatePath("/rokok")
}

export async function updateRokok(id, data, alasan) {
  const session = await auth()
  let userId = session?.user?.id
  if (!userId && session?.user?.name) {
    const u = await prisma.user.findFirst({
      where: { OR: [{ name: session.user.name }, { username: session.user.name }] }
    })
    userId = u?.id
  }

  await prisma.$transaction(async (tx) => {
    const old = await tx.rokok.findUnique({ where: { id } })
    await tx.rokok.update({
      where: { id },
      data: {
        nama:             data.nama,
        harga_beli:       Number(data.harga_beli),
        harga_grosir:     Number(data.harga_grosir),
        harga_toko:       Number(data.harga_toko),
        harga_perorangan: Number(data.harga_perorangan),
      },
    })

    // Jika stok berubah, buat koreksi mutation agar ledger tetap akurat
    const newStok = data.stok !== undefined ? Number(data.stok) : null
    if (newStok !== null && newStok !== old.stok) {
      const diff  = newStok - old.stok
      const jenis = diff > 0 ? "in" : "out"
      const qty   = Math.abs(diff)
      await mutateStock({
        tx,
        rokok_id:     id,
        tanggal:      new Date(),
        jenis,
        qty,
        source:       MUTATION_SOURCE.KOREKSI,
        reference_id: "manual",
        keterangan:   `Koreksi stok dari edit: ${old.stok} → ${newStok}`,
        user_id:      userId || null,
      })
    }

    await logAudit({
      tx,
      entity_type: AUDIT_ENTITY.ROKOK,
      change_type: "Edit Harga / Nama",
      entity_id:   id,
      action:      AUDIT_ACTION.UPDATE,
      old_values:  { nama: old.nama, stok: old.stok, harga_beli: old.harga_beli, harga_grosir: old.harga_grosir, harga_toko: old.harga_toko, harga_perorangan: old.harga_perorangan },
      new_values:  { nama: data.nama, stok: newStok ?? old.stok, harga_beli: Number(data.harga_beli), harga_grosir: Number(data.harga_grosir), harga_toko: Number(data.harga_toko), harga_perorangan: Number(data.harga_perorangan) },
      alasan,
      user_id:     userId,
      user_name:   session?.user?.name,
    })
  })
  revalidatePath("/rokok")
}

export async function deleteRokok(id, alasan) {
  const session = await auth()
  let userId = session?.user?.id
  if (!userId && session?.user?.name) {
    const u = await prisma.user.findFirst({
      where: { OR: [{ name: session.user.name }, { username: session.user.name }] }
    })
    userId = u?.id
  }

  // Server-side check for safety
  const usedIds = await getUsedRokokIds()
  if (usedIds.includes(id)) {
    throw new Error("Data rokok tidak bisa dihapus karena sudah memiliki histori transaksi.")
  }

  await prisma.$transaction(async (tx) => {
    const old = await tx.rokok.findUnique({ where: { id } })
    if (!old) return

    await logAudit({
      tx,
      entity_type: AUDIT_ENTITY.ROKOK,
      change_type: "Hapus Rokok",
      entity_id:   id,
      action:      AUDIT_ACTION.DELETE,
      old_values:  { nama: old.nama, harga_beli: old.harga_beli, harga_grosir: old.harga_grosir, harga_toko: old.harga_toko, harga_perorangan: old.harga_perorangan },
      alasan,
      user_id:     userId,
      user_name:   session?.user?.name,
    })
    await tx.rokok.delete({ where: { id } })
  })
  revalidatePath("/rokok")
}

export async function toggleAktifRokok(id) {
  const session = await auth()
  let userId = session?.user?.id
  if (!userId && session?.user?.name) {
    const u = await prisma.user.findFirst({
      where: { OR: [{ name: session.user.name }, { username: session.user.name }] }
    })
    userId = u?.id
  }
  await prisma.$transaction(async (tx) => {
    const r = await tx.rokok.findUnique({ where: { id }, select: { aktif: true, nama: true } })
    await tx.rokok.update({ where: { id }, data: { aktif: !r.aktif } })
    await logAudit({
      tx,
      entity_type: AUDIT_ENTITY.ROKOK,
      change_type: r.aktif ? "Nonaktifkan Rokok" : "Aktifkan Rokok",
      entity_id:   id,
      action:      AUDIT_ACTION.UPDATE,
      old_values:  { nama: r.nama, aktif: r.aktif },
      new_values:  { nama: r.nama, aktif: !r.aktif },
      user_id:     userId,
      user_name:   session?.user?.name,
    })
  })
  revalidatePath("/rokok")
}

export async function tambahStok(id, qty, date, keterangan) {
  const session = await auth()
  let userId = session?.user?.id
  if (!userId && session?.user?.name) {
    const u = await prisma.user.findFirst({
      where: { OR: [{ name: session.user.name }, { username: session.user.name }] }
    })
    userId = u?.id
  }

  await prisma.$transaction(async (tx) => {
    const rokok = await tx.rokok.findUnique({ where: { id }, select: { nama: true } })
    const sm = await tx.stokMasuk.create({
      data: {
        rokok_id: id,
        qty:      qty,
        tanggal:  new Date(date),
        keterangan: keterangan || "Stok Masuk",
      },
    })
    await mutateStock({
      tx,
      rokok_id: id,
      tanggal: new Date(date),
      jenis: 'in',
      qty: qty,
      source: MUTATION_SOURCE.SUPPLIER,
      reference_id: sm.id,
      keterangan: keterangan || "Stok Masuk dari Supplier",
      user_id: userId || null,
    })
    await logAudit({
      tx,
      entity_type: AUDIT_ENTITY.ROKOK,
      change_type: "Tambah Stok",
      entity_id:   id,
      action:      AUDIT_ACTION.UPDATE,
      new_values:  { rokok: rokok?.nama, qty, tanggal: date, keterangan: keterangan || "Stok Masuk" },
      user_id:     userId,
      user_name:   session?.user?.name,
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
  // Satu query UNION untuk seluruh tabel yang mereferensi rokok_id.
  // UNION (tanpa ALL) sudah menghilangkan duplikat, jadi cukup di-flatten ke array.
  // stok_awal di-exclude agar rokok yang baru dibuat (hanya ada stok awal)
  // masih bisa dihapus jika salah input.
  const rows = await prisma.$queryRaw`
    SELECT rokok_id FROM "StockMutation" WHERE source <> ${MUTATION_SOURCE.STOK_AWAL}
    UNION
    SELECT rokok_id FROM "SesiBarangKeluar"
    UNION
    SELECT rokok_id FROM "SesiPenjualan"
    UNION
    SELECT rokok_id FROM "SesiBarangKembali"
    UNION
    SELECT rokok_id FROM "TitipJualItem"
    UNION
    SELECT rokok_id FROM "ReturItem"
    UNION
    SELECT rokok_id FROM "TukarBarangItemMasuk"
    UNION
    SELECT rokok_id FROM "TukarBarangItemKeluar"
  `
  return rows.map((r) => r.rokok_id)
}

export async function getMutasiStok(startDate, endDate) {
  const start = new Date(startDate)
  const end   = new Date(endDate)

  const rokokList = await prisma.rokok.findMany({ orderBy: { urutan: "asc" } })

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

  const inRangeMutations = await prisma.stockMutation.findMany({
    where: { tanggal: { gte: start, lte: end } },
    include: {
      user: { select: { name: true, username: true } },
      rokok: { select: { nama: true } }
    },
    orderBy: { createdAt: "desc" }
  })

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
          details: todayMuts.map(m => ({
            ...m,
            user_name: m.user?.name || m.user?.username || "Sistem"
          }))
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

export async function getMutasiHariIni() {
  const now   = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
  const end   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)

  const rows = await prisma.stockMutation.findMany({
    where:   { tanggal: { gte: start, lte: end } },
    include: { user: { select: { name: true, username: true } } },
    orderBy: { createdAt: "desc" },
  })

  return rows.map((m) => ({
    id:           m.id,
    rokok_id:     m.rokok_id,
    jenis:        m.jenis,
    qty:          m.qty,
    source:       m.source,
    keterangan:   m.keterangan,
    user_name:    m.user?.name || m.user?.username || "Sistem",
    createdAt:    new Date(m.createdAt.getTime() + 7 * 60 * 60 * 1000)
                    .toISOString().replace("T", " ").slice(0, 16),
  }))
}

export async function koreksiStok(id, qty, jenis, keterangan) {
  const session = await auth()
  let userId = session?.user?.id
  if (!userId && session?.user?.name) {
    const u = await prisma.user.findFirst({
      where: { OR: [{ name: session.user.name }, { username: session.user.name }] }
    })
    userId = u?.id
  }
  await prisma.$transaction(async (tx) => {
    const rokok = await tx.rokok.findUnique({ where: { id }, select: { nama: true } })
    await mutateStock({
      tx,
      rokok_id: id,
      tanggal: new Date(),
      jenis,
      qty,
      source: MUTATION_SOURCE.KOREKSI,
      reference_id: "manual",
      keterangan: keterangan || "Koreksi manual admin",
      user_id: userId || null,
    })
    await logAudit({
      tx,
      entity_type: AUDIT_ENTITY.ROKOK,
      change_type: "Koreksi Stok",
      entity_id:   id,
      action:      AUDIT_ACTION.UPDATE,
      new_values:  { rokok: rokok?.nama, jenis, qty, keterangan: keterangan || "Koreksi manual admin" },
      user_id:     userId,
      user_name:   session?.user?.name,
    })
  })
  revalidatePath("/rokok")
}
