"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { mutateStock, MUTATION_SOURCE } from "@/lib/stock"
import { auth } from "@/lib/auth"
import { logAudit, AUDIT_ACTION, AUDIT_ENTITY } from "@/lib/audit"
import { nowJakarta, getJakartaToday } from "@/lib/utils"

export async function getRokokList() {
  try {
    const rows = await prisma.rokok.findMany({ orderBy: { urutan: "asc" } })
    return rows.map((r) => ({
      id: r.id,
      nama: r.nama,
      stok: r.stok,
      stok_sample_cukai: r.stok_sample_cukai,
      stok_sample_biasa: r.stok_sample_biasa,
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
      stok_sample_cukai: r.stok_sample_cukai,
      stok_sample_biasa: r.stok_sample_biasa,
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
    const initialStok = Number(data.stok) || 0
    const r = await tx.rokok.create({
      data: {
        nama: data.nama,
        stok: 0,
        harga_beli: Number(data.harga_beli),
        harga_grosir: Number(data.harga_grosir),
        harga_toko: Number(data.harga_toko),
        harga_perorangan: Number(data.harga_perorangan),
        urutan: nextUrutan,
      },
    })
    if (initialStok > 0) {
      const sm = await tx.stokMasuk.create({
        data: {
          rokok_id: r.id,
          qty:      initialStok,
          tanggal:  nowJakarta(),
          keterangan: "Stok Awal",
        },
      })
      await mutateStock({
        tx,
        rokok_id: r.id,
        tanggal: nowJakarta(),
        jenis: 'in',
        qty: initialStok,
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
      new_values:  { nama: r.nama, stok: initialStok, harga_beli: r.harga_beli, harga_grosir: r.harga_grosir, harga_toko: r.harga_toko, harga_perorangan: r.harga_perorangan },
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
        ...(data.aktif !== undefined && { aktif: data.aktif }),
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
        tanggal:      nowJakarta(),
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
      old_values:  { nama: old.nama, stok: old.stok, aktif: old.aktif, harga_beli: old.harga_beli, harga_grosir: old.harga_grosir, harga_toko: old.harga_toko, harga_perorangan: old.harga_perorangan },
      new_values:  { nama: data.nama, stok: newStok ?? old.stok, aktif: data.aktif ?? old.aktif, harga_beli: Number(data.harga_beli), harga_grosir: Number(data.harga_grosir), harga_toko: Number(data.harga_toko), harga_perorangan: Number(data.harga_perorangan) },
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

  const isOut = qty < 0
  const absQty = Math.abs(qty)
  const jenis = isOut ? 'out' : 'in'
  const defaultKet = isOut ? "Pengurangan Stok" : "Stok Masuk"

  await prisma.$transaction(async (tx) => {
    const rokok = await tx.rokok.findUnique({ where: { id }, select: { nama: true } })
    const sm = await tx.stokMasuk.create({
      data: {
        rokok_id: id,
        qty:      qty, // simpan sesuai tanda (+/-) di history stok masuk
        tanggal:  new Date(date),
        keterangan: keterangan || defaultKet,
      },
    })
    await mutateStock({
      tx,
      rokok_id: id,
      tanggal: new Date(date),
      jenis,
      qty: absQty,
      source: MUTATION_SOURCE.SUPPLIER,
      reference_id: sm.id,
      keterangan: keterangan || (isOut ? "Pengurangan Stok / Retur ke Supplier" : "Stok Masuk dari Supplier"),
      user_id: userId || null,
    })
    await logAudit({
      tx,
      entity_type: AUDIT_ENTITY.ROKOK,
      change_type: isOut ? "Kurangi Stok" : "Tambah Stok",
      entity_id:   id,
      action:      AUDIT_ACTION.UPDATE,
      new_values:  { rokok: rokok?.nama, qty, tanggal: date, keterangan: keterangan || defaultKet },
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

export async function getMutasiStok(startDate, endDate, stockType = "utama") {
  const start = new Date(startDate)
  const end   = new Date(endDate)

  const rokokList = await prisma.rokok.findMany({ orderBy: { urutan: "asc" } })

  // Define stock_type filter based on selection
  let typeFilter = {}
  if (stockType === "jual") typeFilter = { stock_type: "jual" }
  else if (stockType === "sample_cukai") typeFilter = { stock_type: "sample_cukai" }
  else if (stockType === "sample_biasa") typeFilter = { stock_type: "sample_biasa" }
  else if (stockType === "utama") typeFilter = { stock_type: { in: ["jual", "sample_cukai"] } }
  // "semua" or null -> no filter

  const preMutations = await prisma.stockMutation.groupBy({
    by: ["rokok_id", "jenis"],
    where: { 
      tanggal: { lt: start },
      ...typeFilter
    },
    _sum: { qty: true }
  })

  const initialBalances = {}
  for (const r of rokokList) {
    const inQty = preMutations.find(m => m.rokok_id === r.id && m.jenis === 'in')?._sum.qty || 0
    const outQty = preMutations.find(m => m.rokok_id === r.id && m.jenis === 'out')?._sum.qty || 0
    initialBalances[r.id] = inQty - outQty
  }

  const inRangeMutations = await prisma.stockMutation.findMany({
    where: { 
      tanggal: { gte: start, lte: end },
      ...typeFilter
    },
    include: {
      user: { select: { name: true, username: true } },
      rokok: { select: { nama: true } }
    },
    orderBy: { createdAt: "desc" }
  })

  // --- Fetch Related Sales Info ---
  const refIds = inRangeMutations.filter(m => m.reference_id).map(m => m.reference_id)
  const salesMap = new Map()

  if (refIds.length > 0) {
    const [sesis, titips, tukars] = await Promise.all([
      prisma.sesiHarian.findMany({
        where: { id: { in: refIds } },
        select: { id: true, sales: { select: { nama: true } } }
      }),
      prisma.titipJual.findMany({
        where: { id: { in: refIds } },
        select: { id: true, sales: { select: { nama: true } } }
      }),
      prisma.tukarBarang.findMany({
        where: { id: { in: refIds } },
        select: { id: true, sesi: { select: { sales: { select: { nama: true } } } } }
      })
    ])

    sesis.forEach(s => salesMap.set(s.id, s.sales?.nama))
    titips.forEach(t => salesMap.set(t.id, t.sales?.nama))
    tukars.forEach(tk => salesMap.set(tk.id, tk.sesi?.sales?.nama))
  }

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
          detail_masuk: todayMuts.filter(m => m.jenis === 'in' && m.source === MUTATION_SOURCE.SUPPLIER).reduce((s, m) => s + m.qty, 0),
          detail_kembali: todayMuts.filter(m => m.jenis === 'in' && m.source === MUTATION_SOURCE.RETUR_SALES).reduce((s, m) => s + m.qty, 0),
          details: todayMuts.map(m => ({
            ...m,
            user_name: m.user?.name || m.user?.username || "Sistem",
            sales_name: salesMap.get(m.reference_id) || null
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
  const now   = nowJakarta()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
  const end   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)

  const rows = await prisma.stockMutation.findMany({
    where:   { tanggal: { gte: start, lte: end } },
    include: { user: { select: { name: true, username: true } } },
    orderBy: { createdAt: "desc" },
  })

  // --- Fetch Related Sales Info ---
  const refIds = rows.filter(m => m.reference_id).map(m => m.reference_id)
  const salesMap = new Map()

  if (refIds.length > 0) {
    const [sesis, titips, tukars] = await Promise.all([
      prisma.sesiHarian.findMany({
        where: { id: { in: refIds } },
        select: { id: true, sales: { select: { nama: true } } }
      }),
      prisma.titipJual.findMany({
        where: { id: { in: refIds } },
        select: { id: true, sales: { select: { nama: true } } }
      }),
      prisma.tukarBarang.findMany({
        where: { id: { in: refIds } },
        select: { id: true, sesi: { select: { sales: { select: { nama: true } } } } }
      })
    ])

    sesis.forEach(s => salesMap.set(s.id, s.sales?.nama))
    titips.forEach(t => salesMap.set(t.id, t.sales?.nama))
    tukars.forEach(tk => salesMap.set(tk.id, tk.sesi?.sales?.nama))
  }

  return rows.map((m) => ({
    id:           m.id,
    rokok_id:     m.rokok_id,
    jenis:        m.jenis,
    qty:          m.qty,
    source:       m.source,
    keterangan:   m.keterangan,
    user_name:    m.user?.name || m.user?.username || "Sistem",
    sales_name:   salesMap.get(m.reference_id) || null,
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
      tanggal: nowJakarta(),
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

// ─── SAMPLE ───────────────────────────────────────────────────────────────────

export async function tambahStokSampleBiasa(rokok_id, qty, date, keterangan) {
  const session = await auth()
  let userId = session?.user?.id
  if (!userId && session?.user?.name) {
    const u = await prisma.user.findFirst({
      where: { OR: [{ name: session.user.name }, { username: session.user.name }] }
    })
    userId = u?.id
  }

  const qtyNum = Number(qty)
  if (!qtyNum) throw new Error("Qty tidak valid.")
  
  const isOut = qtyNum < 0
  const absQty = Math.abs(qtyNum)
  const jenis = isOut ? 'out' : 'in'
  const defaultKet = isOut ? "Pengurangan Sample Biasa" : "Tambah Sample Biasa"

  await prisma.$transaction(async (tx) => {
    const rokok = await tx.rokok.findUnique({ where: { id: rokok_id }, select: { nama: true } })
    const sm = await tx.stokMasuk.create({
      data: {
        rokok_id,
        qty:        qtyNum,
        tanggal:    new Date(date),
        jenis:      "sample_biasa",
        keterangan: keterangan || defaultKet,
      },
    })
    await mutateStock({
      tx,
      rokok_id,
      tanggal:    date,
      jenis,
      qty:        absQty,
      source:     isOut ? "sample_biasa_keluar" : "sample_biasa_masuk",
      stock_type: "sample_biasa",
      reference_id: sm.id,
      keterangan: keterangan || defaultKet,
      user_id:    userId || null,
    })
    await logAudit({
      tx,
      entity_type: AUDIT_ENTITY.ROKOK,
      change_type: isOut ? "Kurangi Sample Biasa" : "Tambah Sample Biasa",
      entity_id:   rokok_id,
      action:      AUDIT_ACTION.UPDATE,
      new_values:  { rokok: rokok?.nama, qty: qtyNum, tanggal: date, keterangan: keterangan || defaultKet },
      user_id:     userId,
      user_name:   session?.user?.name,
    })
  })
  revalidatePath("/rokok")
}

export async function pindahStokSampleCukai(rokok_id, qty, direction, catatan, date) {
  const session = await auth()
  let userId = session?.user?.id
  if (!userId && session?.user?.name) {
    const u = await prisma.user.findFirst({
      where: { OR: [{ name: session.user.name }, { username: session.user.name }] }
    })
    userId = u?.id
  }

  const qtyNum = Number(qty)
  if (!qtyNum || qtyNum <= 0) throw new Error("Qty harus lebih dari 0.")
  const targetDate = date ? date : getJakartaToday()

  const fromPool = direction === "to_sample" ? "stok" : "stok_sample_cukai"
  const toPool = direction === "to_sample" ? "stok_sample_cukai" : "stok"

  await prisma.$transaction(async (tx) => {
    const rokok = await tx.rokok.findUnique({
      where: { id: rokok_id },
      select: { nama: true, [fromPool]: true }
    })
    if (!rokok) throw new Error("Rokok tidak ditemukan.")
    if (rokok[fromPool] < qtyNum) {
      const poolName = direction === "to_sample" ? "Stok Jual" : "Sample Cukai"
      throw new Error(`Stok ${poolName} tidak mencukupi. Stok saat ini: ${rokok[fromPool]}.`)
    }

    // 1. Kurangi dari asal
    await mutateStock({
      tx,
      rokok_id,
      tanggal:    targetDate,
      jenis:      "out",
      qty:        qtyNum,
      source:     MUTATION_SOURCE.SAMPLE_CUKAI_KONVERSI,
      stock_type: direction === "to_sample" ? "jual" : "sample_cukai",
      keterangan: catatan || (direction === "to_sample" ? "Pindah ke sample cukai" : "Kembalikan ke stok jual"),
      user_id:    userId || null,
    })

    // 2. Tambah ke tujuan
    await mutateStock({
      tx,
      rokok_id,
      tanggal:    targetDate,
      jenis:      "in",
      qty:        qtyNum,
      source:     MUTATION_SOURCE.SAMPLE_CUKAI_KONVERSI,
      stock_type: direction === "to_sample" ? "sample_cukai" : "jual",
      keterangan: catatan || (direction === "to_sample" ? "Terima dari stok jual" : "Kembali dari sample cukai"),
      user_id:    userId || null,
    })

    if (direction === "to_sample") {
      await tx.sampleCukaiKonversi.create({
        data: { rokok_id, qty: qtyNum, tanggal: new Date(targetDate), catatan: catatan || null },
      })
    }

    await logAudit({
      tx,
      entity_type: AUDIT_ENTITY.ROKOK,
      change_type: direction === "to_sample" ? "Pindah ke Sample Cukai" : "Pindah ke Stok Jual",
      entity_id:   rokok_id,
      action:      AUDIT_ACTION.UPDATE,
      new_values:  { rokok: rokok?.nama, qty: qtyNum, direction, catatan },
      user_id:     userId,
      user_name:   session?.user?.name,
    })
  })
  revalidatePath("/rokok")
}

export async function konversiKeSampleCukai(rokok_id, qty, catatan) {
  return pindahStokSampleCukai(rokok_id, qty, "to_sample", catatan)
}

export async function tambahStokSampleCukai(rokok_id, qty, date, keterangan) {
  const session = await auth()
  let userId = session?.user?.id
  if (!userId && session?.user?.name) {
    const u = await prisma.user.findFirst({
      where: { OR: [{ name: session.user.name }, { username: session.user.name }] }
    })
    userId = u?.id
  }

  const qtyNum = Number(qty)
  if (!qtyNum) throw new Error("Qty tidak boleh nol.")
  
  const isOut = qtyNum < 0
  const absQty = Math.abs(qtyNum)
  const defaultKet = isOut ? "Pengurangan Stok Sample Cukai" : "Penerimaan Sample Cukai"

  await prisma.$transaction(async (tx) => {
    const rokok = await tx.rokok.findUnique({
      where: { id: rokok_id },
      select: { nama: true }
    })
    if (!rokok) throw new Error("Rokok tidak ditemukan.")

    await mutateStock({
      tx,
      rokok_id,
      tanggal:    date,
      jenis:      isOut ? "out" : "in",
      qty:        absQty,
      source:     MUTATION_SOURCE.KOREKSI,
      stock_type: "sample_cukai",
      keterangan: keterangan || defaultKet,
      user_id:    userId || null,
    })
    await logAudit({
      tx,
      entity_type: AUDIT_ENTITY.ROKOK,
      change_type: isOut ? "Kurangi Sample Cukai" : "Tambah Sample Cukai",
      entity_id:   rokok_id,
      action:      AUDIT_ACTION.UPDATE,
      new_values:  { rokok: rokok?.nama, qty: qtyNum, tanggal: date, keterangan: keterangan || defaultKet },
      user_id:     userId,
      user_name:   session?.user?.name,
    })
  })
  revalidatePath("/rokok")
}
