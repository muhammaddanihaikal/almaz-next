"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { mutateStock, mutateStockBatch, MUTATION_SOURCE } from "@/lib/stock"
import { auth } from "@/lib/auth"
import { logAudit, AUDIT_ACTION, AUDIT_ENTITY } from "@/lib/audit"
import {
  createTukarBarangInSesi,
  selesaikanTukarBarangInSesi,
  revertSelesaiTukarBarangInSesi,
  reverseStockMutationNet,
} from "@/actions/tukar-barang"
import { getAppSetting } from "@/actions/settings"
import { saveSesiSampleKeluar, revertSesiSampleKeluar, saveSesiSampleKembali } from "@/actions/sample"
import { nowJakarta, getJakartaToday } from "@/lib/utils"

const include = {
  sales: true,
  barangKeluar:  { include: { rokok: true } },
  penjualan:     { include: { rokok: true } },
  setoran:       true,
  barangKembali: { include: { rokok: true } },
  titipJual:     { include: { items: { include: { rokok: true } }, setoran: true, toko: true } },
  tukarBarang:   { include: { itemsMasuk: { include: { rokok: true } }, itemsKeluar: { include: { rokok: true } } } },
  tukarBarangSelesai: { include: { itemsMasuk: { include: { rokok: true } }, itemsKeluar: { include: { rokok: true } } } },
  retur:         { include: { items: { include: { rokok: true } } } },
  sample:        { include: { rokok: { select: { nama: true } } } },
}

const DISTRIBUSI_TX_OPTIONS = { maxWait: 10000, timeout: 30000 }
const distribusiTransaction = (fn) => prisma.$transaction(fn, DISTRIBUSI_TX_OPTIONS)

function dateOnly(value) {
  // If it's already a string in YYYY-MM-DD, just return it
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  
  const d = new Date(value)
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d)
}

function shouldMutateKonsinyasiKembali(titipJual, tanggalSelesai, cutoffStr) {
  if (!tanggalSelesai) return !titipJual?.is_historical
  if (!titipJual?.is_historical) return true
  return !cutoffStr || dateOnly(tanggalSelesai) >= cutoffStr
}

function queueRevertKonsinyasiKembali(mutQueue, titipJual, tanggal, cutoffStr, session, keterangan) {
  if (!shouldMutateKonsinyasiKembali(titipJual, tanggal, cutoffStr)) return
  for (const it of (titipJual.items || [])) {
    if (it.qty_kembali > 0) {
      mutQueue.push({
        rokok_id: it.rokok_id,
        tanggal,
        jenis: "out",
        qty: it.qty_kembali,
        source: MUTATION_SOURCE.REVERT,
        reference_id: titipJual.id,
        keterangan,
        user_id: session?.user?.id,
        allowNegative: true,
      })
    }
  }
}

function serializeTukarList(list) {
  return list.map((t) => ({
    id:              t.id,
    tanggal:         t.tanggal.toISOString().split("T")[0],
    tanggal_selesai: t.tanggal_selesai ? t.tanggal_selesai.toISOString().split("T")[0] : null,
    status:          t.status,
    kategori:        t.kategori || "grosir",
    selisih_uang:    t.selisih_uang,
    catatan:         t.catatan || "",
    itemsMasuk: (t.itemsMasuk || []).map((it) => ({
      id: it.id, rokok_id: it.rokok_id, rokok: it.rokok?.nama || "???",
      qty: it.qty, harga_satuan: it.harga_satuan,
    })),
    itemsKeluar: (t.itemsKeluar || []).map((it) => ({
      id: it.id, rokok_id: it.rokok_id, rokok: it.rokok?.nama || "???",
      qty: it.qty, harga_satuan: it.harga_satuan,
    })),
  }))
}

function serialize(s, settledTj = []) {
  const tanggal = s.tanggal.toISOString().split("T")[0]

  const nilaiPenjualanLangsung = s.penjualan.reduce((sum, it) => sum + it.qty * it.harga, 0)
  // Hanya tukar yang selesai di sesi ini (itemsKeluar sudah benar-benar diserahkan)
  const nilaiTukar = (s.tukarBarangSelesai || []).reduce((sum, t) => {
    const totalMasuk = t.itemsMasuk.reduce((ss, it) => ss + it.qty * it.harga_satuan, 0)
    const totalKeluar = t.itemsKeluar.reduce((ss, it) => ss + it.qty * it.harga_satuan, 0)
    return sum + (totalKeluar - totalMasuk)
  }, 0)
  const nilaiPenjualan = nilaiPenjualanLangsung + nilaiTukar
  const totalSetoran   = s.setoran.reduce((sum, it) => sum + it.jumlah, 0)
  const qtyKeluar      = s.barangKeluar.reduce((sum, it) => sum + it.qty, 0)
  const qtyTerjual     = s.penjualan.reduce((sum, it) => sum + it.qty, 0)
  const qtyKonsinyasi  = s.titipJual.reduce((sum, k) => sum + k.items.reduce((ss, it) => ss + it.qty_keluar, 0), 0)
  const qtyKembali     = s.barangKembali.reduce((sum, it) => sum + it.qty, 0)
  // Tukar masuk (dari customer, diciptakan di sesi ini) → tambah pool
  const qtyTukarMasuk = (s.tukarBarang || []).reduce((sum, t) => sum + t.itemsMasuk.reduce((ss, it) => ss + it.qty, 0), 0)
  // Tukar keluar pengganti (diselesaikan di sesi ini) → dari pool barangKeluar
  const qtyTukarSelesaiKeluar = (s.tukarBarangSelesai || []).reduce((sum, t) => sum + t.itemsKeluar.reduce((ss, it) => ss + it.qty, 0), 0)
  const flagSetoran    = nilaiPenjualan > 0 && totalSetoran !== nilaiPenjualan
  const flagQty        = qtyKeluar > 0 && s.status === "selesai" && (qtyTerjual + qtyKonsinyasi + qtyKembali + qtyTukarSelesaiKeluar - qtyTukarMasuk) !== qtyKeluar

  return {
    id:        s.id,
    tanggal,
    sales_id:  s.sales_id,
    sales:     s.sales.nama,
    sales_kategori: s.sales.kategori || "grosir",
    status:    s.status,
    is_historical: s.is_historical,
    catatan:   s.catatan,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    flagSetoran,
    flagQty,
    nilaiPenjualan,
    totalSetoran,
    barangKeluar: s.barangKeluar
      .sort((a, b) => (a.rokok?.urutan ?? 0) - (b.rokok?.urutan ?? 0))
      .map((it) => ({
        id: it.id, rokok_id: it.rokok_id, rokok: it.rokok?.nama || "???", qty: it.qty,
      })),
    penjualan: s.penjualan
      .sort((a, b) => (a.rokok?.urutan ?? 0) - (b.rokok?.urutan ?? 0))
      .map((it) => ({
        id: it.id, rokok_id: it.rokok_id, rokok: it.rokok?.nama || "???",
        kategori: it.kategori, qty: it.qty, harga: it.harga,
      })),
    setoran: s.setoran.map((it) => ({
      id: it.id, metode: it.metode, jumlah: it.jumlah,
    })),
    barangKembali: s.barangKembali
      .sort((a, b) => (a.rokok?.urutan ?? 0) - (b.rokok?.urutan ?? 0))
      .map((it) => ({
        id: it.id, rokok_id: it.rokok_id, rokok: it.rokok?.nama || "???", qty: it.qty,
      })),
    tukarBarang: serializeTukarList(s.tukarBarang || []),
    tukarBarangSelesaiDiSesi: serializeTukarList(s.tukarBarangSelesai || []),
    returDiSesi: (s.retur || []).map((r) => ({
      id:   r.id,
      alasan: r.alasan,
      items: r.items
        .sort((a, b) => (a.rokok?.urutan ?? 0) - (b.rokok?.urutan ?? 0))
        .map((it) => ({ rokok_id: it.rokok_id, rokok: it.rokok?.nama || "???", qty: it.qty })),
    })),
    sample: (s.sample || []).map((sm) => ({
      id:          sm.id,
      rokok_id:    sm.rokok_id,
      rokok:       sm.rokok?.nama || "???",
      type:        sm.type,
      qty_keluar:  sm.qty_keluar,
      qty_kembali: sm.qty_kembali,
    })),
    konsinyasiSelesaiDiSesi: (settledTj || []).map((k) => ({
      id:                  k.id,
      toko_id:             k.toko_id,
      nama_toko:           k.toko?.nama || "???",
      kategori:            k.kategori,
      tanggal_jatuh_tempo: k.tanggal_jatuh_tempo.toISOString().split("T")[0],
      tanggal_selesai:     k.tanggal_selesai ? k.tanggal_selesai.toISOString().split("T")[0] : null,
      status:              k.status,
      items: (k.items || [])
        .sort((a, b) => (a.rokok?.urutan ?? 0) - (b.rokok?.urutan ?? 0))
        .map((it) => ({
          id: it.id, rokok_id: it.rokok_id, rokok: it.rokok?.nama || "???",
          qty_keluar: it.qty_keluar, qty_terjual: it.qty_terjual,
          qty_kembali: it.qty_kembali, harga: it.harga,
        })),
      setoran: (k.setoran || []).map((it) => ({
        id: it.id, metode: it.metode, jumlah: it.jumlah,
        tanggal: it.tanggal.toISOString().split("T")[0],
      })),
    })),
    konsinyasi: s.titipJual.map((k) => ({
      id:                  k.id,
      toko_id:             k.toko_id,
      nama_toko:           k.toko.nama,
      kategori:            k.kategori,
      tanggal_jatuh_tempo: k.tanggal_jatuh_tempo.toISOString().split("T")[0],
      tanggal_selesai:     k.tanggal_selesai ? k.tanggal_selesai.toISOString().split("T")[0] : null,
      status:              k.status,
      items: k.items
        .sort((a, b) => (a.rokok?.urutan ?? 0) - (b.rokok?.urutan ?? 0))
        .map((it) => ({
          id: it.id, rokok_id: it.rokok_id, rokok: it.rokok?.nama || "???",
          qty_keluar: it.qty_keluar, qty_terjual: it.qty_terjual,
          qty_kembali: it.qty_kembali, harga: it.harga,
        })),
      setoran: k.setoran.map((it) => ({
        id: it.id, metode: it.metode, jumlah: it.jumlah,
        tanggal: it.tanggal.toISOString().split("T")[0],
      })),
    })),
  }
}

// Default: hanya muat sesi 30 hari terakhir untuk performa.
// Data lebih lama tetap ada di DB dan bisa diakses via halaman Riwayat
// atau dengan memanggil getSesiList(daysBack) dengan nilai lebih besar.
export async function getSesiList(daysBack = 30) {
  const where = {}
  if (daysBack && Number.isFinite(daysBack)) {
    const since = nowJakarta()
    since.setHours(0, 0, 0, 0)
    since.setDate(since.getDate() - daysBack)
    where.tanggal = { gte: since }
  }
  return _querySesiList(where)
}

/**
 * Fetch sesi dalam rentang tanggal tertentu (YYYY-MM-DD).
 * Dipakai oleh client saat filter berubah ke rentang di luar 30 hari default.
 * Mengembalikan semua sesi dalam range, termasuk data historical.
 */
export async function getSesiListByDateRange(start, end) {
  const where = {}
  if (start) where.tanggal = { ...(where.tanggal || {}), gte: new Date(start) }
  if (end)   where.tanggal = { ...(where.tanggal || {}), lte: new Date(end) }
  return _querySesiList(where)
}

/**
 * Lightweight version of getSesiListByDateRange for fast table rendering.
 * Only fetches fields strictly required by the initial table view and filters.
 */
export async function getSesiListLightweight(start, end) {
  const where = {}
  if (start) where.tanggal = { ...(where.tanggal || {}), gte: new Date(start) }
  if (end)   where.tanggal = { ...(where.tanggal || {}), lte: new Date(end) }

  const rows = await prisma.sesiHarian.findMany({
    where,
    include: {
      sales: { select: { nama: true } },
      barangKeluar: { select: { qty: true, rokok_id: true, rokok: { select: { nama: true } } } },
      penjualan: { select: { rokok_id: true } }, // needed for rokokFilter
      titipJual: { select: { status: true } }, // needed for hasAktifKonsinyasi badge
    },
    orderBy: [{ tanggal: "desc" }, { createdAt: "desc" }],
  })

  return rows.map((r) => ({
    id: r.id,
    tanggal: r.tanggal.toISOString().split("T")[0],
    sales_id: r.sales_id,
    sales: r.sales?.nama || "???",
    status: r.status,
    is_historical: r.is_historical,
    createdAt: r.createdAt.toISOString(),
    barangKeluar: r.barangKeluar.map((bk) => ({
      rokok_id: bk.rokok_id,
      rokok: bk.rokok?.nama || "???",
      qty: bk.qty,
    })),
    penjualan: r.penjualan.map((p) => ({ rokok_id: p.rokok_id })),
    konsinyasi: r.titipJual.map((tj) => ({ status: tj.status })),
  }))
}

async function _querySesiList(where) {
  const rows = await prisma.sesiHarian.findMany({
    where,
    include,
    orderBy: [{ tanggal: "desc" }, { createdAt: "desc" }],
  })

  // Kumpulkan pasangan (tanggal, sales_id) dari semua sesi untuk lookup settled TJ
  // TJ diselesaikan via halaman Konsinyasi TIDAK memiliki sesi_penyelesaian_id,
  // sehingga kita match berdasarkan tanggal_selesai + sales_id.
  const sesiByKey = {} // key: "tanggal|sales_id" → sesi
  for (const row of rows) {
    const key = `${dateOnly(row.tanggal)}|${row.sales_id}`
    if (!sesiByKey[key]) sesiByKey[key] = []
    sesiByKey[key].push(row)
  }

  // Cari semua TJ selesai yang tanggal_selesai-nya masuk dalam rentang sesi
  const tanggalList = [...new Set(rows.map(r => dateOnly(r.tanggal)))]
  const settledTitipJual = tanggalList.length > 0 ? await prisma.titipJual.findMany({
    where: {
      status: "selesai",
      tanggal_selesai: {
        in: tanggalList.map(d => new Date(d))
      }
    },
    include: {
      items: { include: { rokok: true } },
      setoran: true,
      toko: true
    }
  }) : []

  // Map TJ ke sesi berdasarkan tanggal_selesai + sales_id
  const settledTjBySesiId = {}
  for (const tj of settledTitipJual) {
    const tjTanggal = dateOnly(tj.tanggal_selesai)
    const key = `${tjTanggal}|${tj.sales_id}`
    const matchingSesi = sesiByKey[key] || []
    for (const sesi of matchingSesi) {
      // Hindari duplikasi — TJ yang sudah ada di sesi.titipJual (sesi_id === sesi.id) tidak perlu di-include
      if (tj.sesi_id === sesi.id) continue
      if (!settledTjBySesiId[sesi.id]) settledTjBySesiId[sesi.id] = {}
      settledTjBySesiId[sesi.id][tj.id] = tj
    }
  }

  return rows.map(s => serialize(s, Object.values(settledTjBySesiId[s.id] || {})))
}

export async function getSesi(id) {
  const s = await prisma.sesiHarian.findUnique({ where: { id }, include })
  if (!s) return null

  // Cari TJ selesai berdasarkan tanggal_selesai + sales_id (menangkap settlement dari halaman Konsinyasi
  // yang tidak mengisi sesi_penyelesaian_id), lalu exclude TJ yang memang milik sesi ini (sesi_id === id)
  const sesiTanggal = dateOnly(s.tanggal)
  const settledTitipJual = await prisma.titipJual.findMany({
    where: {
      status: "selesai",
      sales_id: s.sales_id,
      tanggal_selesai: new Date(sesiTanggal),
      NOT: { sesi_id: id },
    },
    include: {
      items: { include: { rokok: true } },
      setoran: true,
      toko: true
    }
  })

  return serialize(s, settledTitipJual)
}

export async function createSesi(data) {
  const session = await auth()
  try {
    const cutoffSetting = await getAppSetting("stock_cutoff_date")
    const cutoffStr = cutoffSetting?.value || null
    let is_historical = false
    if (cutoffStr) {
      const cutoffDate = new Date(cutoffStr)
      cutoffDate.setHours(0,0,0,0)
      const sesiDate = new Date(data.tanggal)
      sesiDate.setHours(0,0,0,0)
      if (sesiDate < cutoffDate) {
        is_historical = true
      }
    }

    const createdId = await distribusiTransaction(async (tx) => {
      const sesi = await tx.sesiHarian.create({
        data: {
          tanggal:  new Date(data.tanggal),
          sales_id: data.sales_id,
          status:   "aktif",
          is_historical,
          catatan:  data.catatan || null,
          barangKeluar: {
            create: (data.barangKeluar || []).map((it) => ({
              rokok_id: it.rokok_id,
              qty:      it.qty,
            })),
          },
        },
      })
      if (!is_historical) {
        const keluar = (data.barangKeluar || []).filter(it => Number(it.qty) > 0)
        if (keluar.length > 0) {
          await mutateStockBatch({
            tx,
            mutations: keluar.map(it => ({
              rokok_id: it.rokok_id, tanggal: new Date(data.tanggal), jenis: 'out', qty: Number(it.qty),
              source: MUTATION_SOURCE.DISTRIBUSI, reference_id: sesi.id, user_id: session?.user?.id,
            })),
          })
        }
        if (data.samples?.length > 0) {
          await saveSesiSampleKeluar(sesi.id, data.samples, tx)
        }
      }

      await logAudit({
        tx,
        entity_type: AUDIT_ENTITY.SESI_HARIAN,
        change_type: "Laporan Pagi - Buat Sesi",
        entity_id:   sesi.id,
        action:      AUDIT_ACTION.CREATE,
        new_values:  {
          tanggal:      data.tanggal,
          sales_id:     data.sales_id,
          barangKeluar: (data.barangKeluar || []).map(it => ({ rokok_id: it.rokok_id, qty: it.qty })),
        },
        user_id:   session?.user?.id,
        user_name: session?.user?.name,
      })
      return sesi.id
    })
    revalidatePath("/distribusi")
    revalidatePath("/")
    return { success: true, data: await getSesi(createdId) }
  } catch (error) {
    console.error("[createSesi ERROR]", {
      message: error.message,
      stack: error.stack,
      data: JSON.stringify(data),
    })
    return { success: false, error: error.message || "Gagal membuat sesi distribusi." }
  }
}

export async function updateSesiPagi(id, data, alasan) {
  const session = await auth()
  try {
    // Hitung ulang is_historical jika tanggal berubah
    const cutoffSetting = await getAppSetting("stock_cutoff_date")
    const cutoffStr = cutoffSetting?.value || null
    let is_historical = false
    if (cutoffStr) {
      const cutoffDate = new Date(cutoffStr)
      cutoffDate.setHours(0, 0, 0, 0)
      const sesiDate = new Date(data.tanggal)
      sesiDate.setHours(0, 0, 0, 0)
      if (sesiDate < cutoffDate) is_historical = true
    }

    await distribusiTransaction(async (tx) => {
      const old = await tx.sesiHarian.findUnique({
        where: { id },
        include: { barangKeluar: { include: { rokok: true } } },
      })
      if (!old) throw new Error("Sesi distribusi tidak ditemukan.")

      const oldIsHistorical = old?.is_historical || false

      // Revert old barangKeluar mutations, then apply new ones
      const mutQueue = []
      if (!oldIsHistorical) {
        for (const it of (old?.barangKeluar || [])) {
          if (it.qty > 0) mutQueue.push({
            rokok_id: it.rokok_id, tanggal: old.tanggal, jenis: 'in', qty: it.qty,
            source: MUTATION_SOURCE.REVERT, reference_id: id,
            keterangan: "Revert distribusi sales (update sesi pagi)", user_id: session?.user?.id,
            allowNegative: true,
          })
        }
      }
      if (!is_historical) {
        for (const it of (data.barangKeluar || [])) {
          if (Number(it.qty) > 0) mutQueue.push({
            rokok_id: it.rokok_id, tanggal: new Date(data.tanggal), jenis: 'out', qty: Number(it.qty),
            source: MUTATION_SOURCE.DISTRIBUSI, reference_id: id, user_id: session?.user?.id,
          })
        }
      }
      if (mutQueue.length > 0) await mutateStockBatch({ tx, mutations: mutQueue })

      // Revert sample lama lalu apply sample baru
      if (!oldIsHistorical) await revertSesiSampleKeluar(id, tx)
      await tx.sesiSample.deleteMany({ where: { sesi_id: id } })
      if (!is_historical && data.samples?.length > 0) {
        await saveSesiSampleKeluar(id, data.samples, tx)
      }

      await tx.sesiBarangKeluar.deleteMany({ where: { sesi_id: id } })
      await tx.sesiHarian.update({
        where: { id },
        data: {
          tanggal:      new Date(data.tanggal),
          sales_id:     data.sales_id,
          catatan:      data.catatan || null,
          is_historical,
          barangKeluar: {
            create: (data.barangKeluar || []).map((it) => ({
              rokok_id: it.rokok_id,
              qty:      it.qty,
            })),
          },
        },
      })
      await logAudit({
        tx,
        entity_type: AUDIT_ENTITY.SESI_HARIAN,
        change_type: "Laporan Pagi - Barang Keluar",
        entity_id:   id,
        action:      AUDIT_ACTION.UPDATE,
        old_values:  {
          tanggal:      old.tanggal.toISOString().split("T")[0],
          sales_id:     old.sales_id,
          barangKeluar: old.barangKeluar.map(it => ({ rokok: it.rokok?.nama, qty: it.qty })),
        },
        new_values:  {
          tanggal:      data.tanggal,
          sales_id:     data.sales_id,
          barangKeluar: (data.barangKeluar || []).map(it => ({ rokok_id: it.rokok_id, qty: it.qty })),
        },
        alasan,
        user_id:   session?.user?.id,
        user_name: session?.user?.name,
      })
    })
    revalidatePath("/distribusi")
    revalidatePath("/")
    return { success: true, data: await getSesi(id) }
  } catch (error) {
    console.error(`[updateSesiPagi ERROR] id: ${id}`, {
      message: error.message,
      stack: error.stack,
      data: JSON.stringify(data),
      alasan,
    })
    return { success: false, error: error.message || "Gagal mengubah sesi distribusi." }
  }
}

export async function submitLaporanSore(id, data) {
  const session = await auth()
  try {
    const rokokList = await prisma.rokok.findMany()
    const hargaMap = Object.fromEntries(
      rokokList.map((r) => [
        r.id,
        { grosir: r.harga_grosir, toko: r.harga_toko, perorangan: r.harga_perorangan },
      ])
    )

    await distribusiTransaction(async (tx) => {
      const mutQueue = []
      const sesiHarian = await tx.sesiHarian.findUnique({ where: { id } })
      const is_historical = sesiHarian?.is_historical || false

      // Ambil cutoff date untuk logika settlement titip jual historical
      const cutoffSetting = await tx.appSetting.findUnique({ where: { key: "stock_cutoff_date" } })
      const cutoffStr = cutoffSetting?.value || null

      // Revert old BARANG KEMBALI mutations before recreating (for re-submit)
      const oldKembaliSore = await tx.sesiBarangKembali.findMany({ where: { sesi_id: id } })
      for (const it of oldKembaliSore) {
        if (it.qty > 0 && !is_historical) {
          mutQueue.push({
            rokok_id: it.rokok_id, tanggal: data.tanggal, jenis: 'out', qty: it.qty,
            source: MUTATION_SOURCE.REVERT, reference_id: id,
            keterangan: "Revert barang kembali (re-submit sore)", user_id: session?.user?.id,
            allowNegative: true,
          })
        }
      }

      await tx.sesiPenjualan.deleteMany({ where: { sesi_id: id } })
      await tx.sesiSetoran.deleteMany({   where: { sesi_id: id } })
      await tx.sesiBarangKembali.deleteMany({ where: { sesi_id: id } })

      const oldKonsinyasiSubmit = await tx.titipJual.findMany({
        where: { sesi_id: id },
        include: { items: true },
      })
      for (const k of oldKonsinyasiSubmit) {
        queueRevertKonsinyasiKembali(
          mutQueue,
          k,
          k.tanggal_selesai || data.tanggal,
          cutoffStr,
          session,
          "Revert konsinyasi kembali (re-submit sore)"
        )
      }

      // Delete existing Titip Jual for this session to prevent duplication.
      // Barang keluar konsinyasi sudah dihitung dari barangKeluar sesi.
      await tx.titipJual.deleteMany({ where: { sesi_id: id } })

      // Revert & Delete existing Retur untuk sesi ini (re-submit safety)
      const oldReturSubmit = await tx.retur.findMany({ where: { sesi_id: id }, include: { items: true } })
      for (const r of oldReturSubmit) {
        for (const it of r.items) {
          if (!is_historical) {
            mutQueue.push({
              rokok_id: it.rokok_id, tanggal: data.tanggal, jenis: 'out', qty: it.qty,
              source: MUTATION_SOURCE.REVERT, reference_id: r.id,
              keterangan: "Revert retur (re-submit sore)", user_id: session?.user?.id,
              allowNegative: true,
            })
          }
        }
      }
      await tx.retur.deleteMany({ where: { sesi_id: id } })

      const penjualan = data.penjualan || []
      await tx.sesiPenjualan.createMany({
        data: penjualan.map((it) => ({
          sesi_id:  id,
          rokok_id: it.rokok_id,
          kategori: it.kategori,
          qty:      it.qty,
          harga:    hargaMap[it.rokok_id]?.[it.kategori] || 0,
        })),
      })

      const setoran = data.setoran || []
      await tx.sesiSetoran.createMany({
        data: setoran.map((it) => ({ sesi_id: id, metode: it.metode, jumlah: it.jumlah })),
      })

      const kembali = data.barangKembali || []
      await tx.sesiBarangKembali.createMany({
        data: kembali.map((it) => ({ sesi_id: id, rokok_id: it.rokok_id, qty: it.qty })),
      })
      // Barang kembali menambah stok (physical movement model)
      for (const it of kembali) {
        if (it.qty > 0 && !is_historical) {
          mutQueue.push({
            rokok_id: it.rokok_id, tanggal: data.tanggal, jenis: 'in', qty: it.qty,
            source: MUTATION_SOURCE.RETUR_SALES, reference_id: id, user_id: session?.user?.id,
          })
        }
      }

      const konsinyasiBaru = data.konsinyasiBaru || []
      for (const k of konsinyasiBaru) {
        if (!k.toko_id) continue

        let tokoExists = await tx.toko.findUnique({ where: { id: k.toko_id } })
        if (!tokoExists) {
          // Tunggu 250ms jika ada delay replikasi / pooling serverless
          await new Promise((resolve) => setTimeout(resolve, 250))
          tokoExists = await tx.toko.findUnique({ where: { id: k.toko_id } })
        }
        if (!tokoExists) {
          throw new Error(`Toko tidak ditemukan di database (ID: ${k.toko_id}). Silakan tunggu beberapa detik dan coba submit kembali.`)
        }

        const titipJual = await tx.titipJual.create({
          data: {
            sesi_id:             id,
            sales_id:            data.sales_id,
            toko_id:             k.toko_id,
            kategori:            k.kategori,
            tanggal_jatuh_tempo: new Date(k.tanggal_jatuh_tempo),
            catatan:             k.catatan || null,
            is_historical:       is_historical,
            items: {
              create: k.items
                .filter((it) => it.rokok_id && Number(it.qty ?? it.qty_keluar) > 0)
                .map((it) => ({
                  rokok_id:   it.rokok_id,
                  qty_keluar: Number(it.qty ?? it.qty_keluar),
                  harga:      hargaMap[it.rokok_id]?.[k.kategori] || 0,
                })),
            },
          },
          include: { items: true },
        })
        // No konsinyasi_keluar mutations: items already counted in barangKeluar (physical movement model)
      }

      // Tukar Barang Baru
      const tukarBaru = data.tukarBaru || []
      const sesiObj = { id, tanggal: data.tanggal, is_historical }
      for (const t of tukarBaru) {
        await createTukarBarangInSesi(tx, sesiObj, t, session, !!t.langsungSelesai, mutQueue)
      }

      // Retur dari Tab Tukar Barang (barang return tanpa pengganti)
      const returFromTukar = data.returFromTukar
      if (returFromTukar && Array.isArray(returFromTukar.items) && returFromTukar.items.length > 0) {
        const validReturItems = returFromTukar.items.filter((it) => it.rokok_id && Number(it.qty) > 0)
        if (validReturItems.length > 0) {
          const retur = await tx.retur.create({
            data: {
              tanggal:        new Date(data.tanggal),
              tipe_penjualan: returFromTukar.tipe_penjualan || null,
              sales_id:       data.sales_id,
              sesi_id:        id,
              alasan:         returFromTukar.alasan || "Retur dari sesi (tukar barang tanpa pengganti)",
              items: {
                create: validReturItems.map((it) => ({ rokok_id: it.rokok_id, qty: Number(it.qty) })),
              },
            },
          })
          if (!is_historical) {
            for (const it of validReturItems) {
              mutQueue.push({
                rokok_id: it.rokok_id, tanggal: data.tanggal, jenis: 'in', qty: Number(it.qty),
                source: MUTATION_SOURCE.RETUR, reference_id: retur.id, user_id: session?.user?.id,
              })
            }
          }
        }
      }

      // Penyelesaian Tukar Barang yang masih aktif
      const penyelesaianTukar = data.penyelesaianTukar || []
      for (const tukar_id of penyelesaianTukar) {
        await selesaikanTukarBarangInSesi(tx, sesiObj, tukar_id, session, mutQueue)
      }

      // Penyelesaian Titip Jual (Settlement)
      const penyelesaianKonsinyasi = data.penyelesaianKonsinyasi || []
      for (const p of penyelesaianKonsinyasi) {
        // Ambil data titip jual untuk cek is_historical dari record itu sendiri
        const titipJualRecord = await tx.titipJual.findUnique({ where: { id: p.konsinyasi_id }, select: { is_historical: true } })
        const isTitipJualHistorical = titipJualRecord?.is_historical || false
        await tx.titipJual.update({
          where: { id: p.konsinyasi_id },
          data: { status: "selesai", tanggal_selesai: new Date(data.tanggal) }
        })
        for (const it of (p.items || [])) {
          await tx.titipJualItem.updateMany({
            where: { titip_jual_id: p.konsinyasi_id, rokok_id: it.rokok_id },
            data:  { qty_terjual: it.qty_terjual, qty_kembali: it.qty_kembali },
          })
          // Titip jual historical yang diselesaikan SETELAH cutoff: barang kembali ke gudang secara fisik
          const settlementAfterCutoff = !cutoffStr || dateOnly(data.tanggal) >= cutoffStr
          const shouldAddStock = !isTitipJualHistorical || (isTitipJualHistorical && settlementAfterCutoff)
          if (it.qty_kembali > 0 && shouldAddStock) {
            mutQueue.push({
              rokok_id: it.rokok_id, tanggal: data.tanggal, jenis: 'in', qty: it.qty_kembali,
              source: MUTATION_SOURCE.KONSINYASI_KEMBALI, reference_id: p.konsinyasi_id, user_id: session?.user?.id,
            })
          }
        }
        await tx.titipJualSetoran.createMany({
          data: (p.setoran || []).map((st) => ({
            titip_jual_id:        p.konsinyasi_id,
            metode:               st.metode,
            jumlah:               st.jumlah,
            tanggal:              new Date(data.tanggal),
            sesi_penyelesaian_id: id,
          })),
        })
      }

      // Sample kembali — update qty_kembali per SesiSample
      if (data.sampleKembali?.length > 0) {
        await saveSesiSampleKembali(id, data.sampleKembali, tx)
      }

      // Flush semua mutasi stok dalam batch
      await mutateStockBatch({ tx, mutations: mutQueue })

      await tx.sesiHarian.update({
        where: { id },
        data:  { status: "selesai" },
      })

      await logAudit({
        tx,
        entity_type: AUDIT_ENTITY.SESI_HARIAN,
        change_type: "Laporan Sore - Submit",
        entity_id:   id,
        action:      AUDIT_ACTION.UPDATE,
        new_values:  {
          status:       "selesai",
          penjualan:    penjualan.map(it => ({ rokok_id: it.rokok_id, kategori: it.kategori, qty: it.qty })),
          setoran:      setoran.map(it => ({ metode: it.metode, jumlah: it.jumlah })),
          barangKembali: kembali.map(it => ({ rokok_id: it.rokok_id, qty: it.qty })),
        },
        alasan:    "Submit laporan sore",
        user_id:   session?.user?.id,
        user_name: session?.user?.name,
      })
    })
    revalidatePath("/distribusi")
    revalidatePath("/titip-jual")
    revalidatePath("/")
    return { success: true, data: await getSesi(id) }
  } catch (error) {
    console.error(`[submitLaporanSore ERROR] id: ${id}`, {
      message: error.message,
      stack: error.stack,
      data: JSON.stringify(data),
    })
    return { success: false, error: error.message || "Gagal submit laporan sore." }
  }
}

export async function editLaporanSore(id, data, alasan) {
  const session = await auth()
  try {
    const rokokList = await prisma.rokok.findMany()
    const hargaMap = Object.fromEntries(
      rokokList.map((r) => [
        r.id,
        { grosir: r.harga_grosir, toko: r.harga_toko, perorangan: r.harga_perorangan },
      ])
    )

    await distribusiTransaction(async (tx) => {
      const mutQueue = []
      // 1. Ambil data lama + is_historical
      const sesiHarian      = await tx.sesiHarian.findUnique({ where: { id } })
      if (!sesiHarian) throw new Error("Sesi distribusi tidak ditemukan.")
      const is_historical   = sesiHarian?.is_historical || false
      const cutoffSetting   = await tx.appSetting.findUnique({ where: { key: "stock_cutoff_date" } })
      const cutoffStr       = cutoffSetting?.value || null
      const oldPenjualan    = await tx.sesiPenjualan.findMany({ where: { sesi_id: id }, include: { rokok: true } })
      const oldSetoran      = await tx.sesiSetoran.findMany({ where: { sesi_id: id } })
      const oldKembali      = await tx.sesiBarangKembali.findMany({ where: { sesi_id: id }, include: { rokok: true } })

      // 2. Revert barang kembali lama (hanya jika bukan historical)
      for (const it of oldKembali) {
        if (it.qty > 0 && !is_historical) {
          mutQueue.push({
            rokok_id: it.rokok_id, tanggal: data.tanggal, jenis: 'out', qty: it.qty,
            source: MUTATION_SOURCE.REVERT, reference_id: id,
            keterangan: `Revert barang kembali untuk edit laporan (alasan: ${alasan})`, user_id: session?.user?.id,
            allowNegative: true,
          })
        }
      }

      // Revert tukar barang yang dibuat di sesi ini (revert mutasi tukar_masuk + tukar_keluar + delete record)
      const oldTukarBaru = await tx.tukarBarang.findMany({
        where: { sesi_id: id },
        include: { itemsMasuk: true, itemsKeluar: true },
      })
      for (const t of oldTukarBaru) {
        await reverseStockMutationNet(tx, t.id, {
          keterangan: "Revert net tukar barang (edit sore)",
          session,
          mutQueue,
        })
        await tx.tukarBarang.delete({ where: { id: t.id } })
      }

      // Revert penyelesaian tukar yang diselesaikan di sesi ini (status balik aktif)
      const oldTukarSelesai = await tx.tukarBarang.findMany({
        where: { sesi_selesai_id: id, status: "selesai" },
      })
      for (const t of oldTukarSelesai) {
        // skip kalau tukar dibuat di sesi yang sama (langsung selesai) — sudah dihapus di blok atas
        if (t.sesi_id === id) continue
        await revertSelesaiTukarBarangInSesi(tx, t.id, session, mutQueue)
      }

      const oldSetoranPenyelesaian = await tx.titipJualSetoran.findMany({
        where: { sesi_penyelesaian_id: id },
      })
      const oldCompletedTjIds = [...new Set(oldSetoranPenyelesaian.map((s) => s.titip_jual_id))]
      for (const tjId of oldCompletedTjIds) {
        const tj = await tx.titipJual.findUnique({
          where: { id: tjId },
          include: { items: true },
        })
        if (!tj) continue
        queueRevertKonsinyasiKembali(
          mutQueue,
          tj,
          tj.tanggal_selesai || data.tanggal,
          cutoffStr,
          session,
          "Revert konsinyasi kembali (edit laporan)"
        )
        await tx.titipJualItem.updateMany({
          where: { titip_jual_id: tjId },
          data: { qty_terjual: 0, qty_kembali: 0 },
        })
        await tx.titipJual.update({
          where: { id: tjId },
          data: { status: "aktif", tanggal_selesai: null, flag_selisih_setoran: false },
        })
      }
      await tx.titipJualSetoran.deleteMany({ where: { sesi_penyelesaian_id: id } })

      // 3. Hapus data lama
      await tx.sesiPenjualan.deleteMany({ where: { sesi_id: id } })
      await tx.sesiSetoran.deleteMany({   where: { sesi_id: id } })
      await tx.sesiBarangKembali.deleteMany({ where: { sesi_id: id } })

      const oldKonsinyasiEdit = await tx.titipJual.findMany({
        where: { sesi_id: id },
        include: { items: true },
      })
      for (const k of oldKonsinyasiEdit) {
        if (oldCompletedTjIds.includes(k.id)) continue
        queueRevertKonsinyasiKembali(
          mutQueue,
          k,
          k.tanggal_selesai || data.tanggal,
          cutoffStr,
          session,
          "Revert konsinyasi kembali (edit laporan)"
        )
      }

      // Delete existing Titip Jual for this session to prevent duplication.
      // Barang keluar konsinyasi sudah dihitung dari barangKeluar sesi.
      await tx.titipJual.deleteMany({ where: { sesi_id: id } })

      // Revert & Delete existing Retur untuk sesi ini
      const oldReturEdit = await tx.retur.findMany({ where: { sesi_id: id }, include: { items: true } })
      for (const r of oldReturEdit) {
        for (const it of r.items) {
          if (!is_historical) {
            mutQueue.push({
              rokok_id: it.rokok_id, tanggal: data.tanggal, jenis: 'out', qty: it.qty,
              source: MUTATION_SOURCE.REVERT, reference_id: r.id,
              keterangan: `Revert retur (edit sore - alasan: ${alasan})`, user_id: session?.user?.id,
              allowNegative: true,
            })
          }
        }
      }
      await tx.retur.deleteMany({ where: { sesi_id: id } })

      // 4. Buat data baru
      const penjualan = data.penjualan || []
      await tx.sesiPenjualan.createMany({
        data: penjualan.map((it) => ({
          sesi_id:  id,
          rokok_id: it.rokok_id,
          kategori: it.kategori,
          qty:      it.qty,
          harga:    hargaMap[it.rokok_id]?.[it.kategori] || 0,
        })),
      })

      const setoran = data.setoran || []
      await tx.sesiSetoran.createMany({
        data: setoran.map((it) => ({ sesi_id: id, metode: it.metode, jumlah: it.jumlah })),
      })

      const kembali = data.barangKembali || []
      await tx.sesiBarangKembali.createMany({
        data: kembali.map((it) => ({ sesi_id: id, rokok_id: it.rokok_id, qty: it.qty })),
      })
      // Barang kembali menambah stok (physical movement model)
      for (const it of kembali) {
        if (it.qty > 0 && !is_historical) {
          mutQueue.push({
            rokok_id: it.rokok_id, tanggal: data.tanggal, jenis: 'in', qty: it.qty,
            source: MUTATION_SOURCE.RETUR_SALES, reference_id: id, user_id: session?.user?.id,
          })
        }
      }

      // 5. Konsinyasi Baru
      const konsinyasiBaru = data.konsinyasiBaru || []
      for (const k of konsinyasiBaru) {
        if (!k.toko_id) continue

        let tokoExists = await tx.toko.findUnique({ where: { id: k.toko_id } })
        if (!tokoExists) {
          // Tunggu 250ms jika ada delay replikasi / pooling serverless
          await new Promise((resolve) => setTimeout(resolve, 250))
          tokoExists = await tx.toko.findUnique({ where: { id: k.toko_id } })
        }
        if (!tokoExists) {
          throw new Error(`Toko tidak ditemukan di database (ID: ${k.toko_id}). Silakan tunggu beberapa detik dan coba submit kembali.`)
        }

        const titipJual = await tx.titipJual.create({
          data: {
            sesi_id:             id,
            sales_id:            data.sales_id,
            toko_id:             k.toko_id,
            kategori:            k.kategori,
            tanggal_jatuh_tempo: new Date(k.tanggal_jatuh_tempo),
            catatan:             k.catatan || null,
            is_historical:       is_historical,
            items: {
              create: k.items
                .filter((it) => it.rokok_id && Number(it.qty ?? it.qty_keluar) > 0)
                .map((it) => ({
                  rokok_id:   it.rokok_id,
                  qty_keluar: Number(it.qty ?? it.qty_keluar),
                  harga:      hargaMap[it.rokok_id]?.[k.kategori] || 0,
                })),
            },
          },
          include: { items: true },
        })
        // No konsinyasi_keluar mutations: items already counted in barangKeluar (physical movement model)
      }

      // 6. Tukar Barang
      const sesiObjEdit = { id, tanggal: data.tanggal, is_historical }
      for (const t of (data.tukarBaru || [])) {
        await createTukarBarangInSesi(tx, sesiObjEdit, t, session, !!t.langsungSelesai, mutQueue)
      }
      for (const tukar_id of (data.penyelesaianTukar || [])) {
        await selesaikanTukarBarangInSesi(tx, sesiObjEdit, tukar_id, session, mutQueue)
      }

      // 6b. Retur dari Tab Tukar Barang (barang return tanpa pengganti)
      const returFromTukarEdit = data.returFromTukar
      if (returFromTukarEdit && Array.isArray(returFromTukarEdit.items) && returFromTukarEdit.items.length > 0) {
        const validReturItems = returFromTukarEdit.items.filter((it) => it.rokok_id && Number(it.qty) > 0)
        if (validReturItems.length > 0) {
          const retur = await tx.retur.create({
            data: {
              tanggal:        new Date(data.tanggal),
              tipe_penjualan: returFromTukarEdit.tipe_penjualan || null,
              sales_id:       data.sales_id,
              sesi_id:        id,
              alasan:         returFromTukarEdit.alasan || "Retur dari sesi (tukar barang tanpa pengganti)",
              items: {
                create: validReturItems.map((it) => ({ rokok_id: it.rokok_id, qty: Number(it.qty) })),
              },
            },
          })
          if (!is_historical) {
            for (const it of validReturItems) {
              mutQueue.push({
                rokok_id: it.rokok_id, tanggal: data.tanggal, jenis: 'in', qty: Number(it.qty),
                source: MUTATION_SOURCE.RETUR, reference_id: retur.id, user_id: session?.user?.id,
              })
            }
          }
        }
      }

      const penyelesaianKonsinyasi = data.penyelesaianKonsinyasi || []
      for (const p of penyelesaianKonsinyasi) {
        const titipJualRecord = await tx.titipJual.findUnique({
          where: { id: p.konsinyasi_id },
          select: { is_historical: true },
        })
        const isTitipJualHistorical = titipJualRecord?.is_historical || false
        await tx.titipJual.update({
          where: { id: p.konsinyasi_id },
          data: { status: "selesai", tanggal_selesai: new Date(data.tanggal) },
        })
        for (const it of (p.items || [])) {
          await tx.titipJualItem.updateMany({
            where: { titip_jual_id: p.konsinyasi_id, rokok_id: it.rokok_id },
            data: { qty_terjual: it.qty_terjual, qty_kembali: it.qty_kembali },
          })
          const settlementAfterCutoff = !cutoffStr || dateOnly(data.tanggal) >= cutoffStr
          const shouldAddStock = !isTitipJualHistorical || (isTitipJualHistorical && settlementAfterCutoff)
          if (it.qty_kembali > 0 && shouldAddStock) {
            mutQueue.push({
              rokok_id: it.rokok_id,
              tanggal: data.tanggal,
              jenis: "in",
              qty: it.qty_kembali,
              source: MUTATION_SOURCE.KONSINYASI_KEMBALI,
              reference_id: p.konsinyasi_id,
              user_id: session?.user?.id,
            })
          }
        }
        await tx.titipJualSetoran.createMany({
          data: (p.setoran || []).map((st) => ({
            titip_jual_id: p.konsinyasi_id,
            metode: st.metode,
            jumlah: st.jumlah,
            tanggal: new Date(data.tanggal),
            sesi_penyelesaian_id: id,
          })),
        })
      }

      // Sample kembali — update qty_kembali per SesiSample
      if (data.sampleKembali?.length > 0) {
        await saveSesiSampleKembali(id, data.sampleKembali, tx)
      }

      // Flush semua mutasi stok dalam batch
      await mutateStockBatch({ tx, mutations: mutQueue })

      // 7. Audit Log
      await logAudit({
        tx,
        entity_type: AUDIT_ENTITY.SESI_HARIAN,
        change_type: "Laporan Sore - Edit",
        entity_id:   id,
        action:      AUDIT_ACTION.UPDATE,
        old_values:  {
          penjualan:    oldPenjualan.map(it => ({ rokok: it.rokok?.nama, kategori: it.kategori, qty: it.qty, harga: it.harga })),
          setoran:      oldSetoran.map(it => ({ metode: it.metode, jumlah: it.jumlah })),
          barangKembali: oldKembali.map(it => ({ rokok: it.rokok?.nama, qty: it.qty })),
        },
        new_values:  {
          penjualan:    penjualan.map(it => ({ rokok_id: it.rokok_id, kategori: it.kategori, qty: it.qty })),
          setoran:      setoran.map(it => ({ metode: it.metode, jumlah: it.jumlah })),
          barangKembali: kembali.map(it => ({ rokok_id: it.rokok_id, qty: it.qty })),
        },
        alasan,
        user_id:   session?.user?.id,
        user_name: session?.user?.name,
      })
    })

    revalidatePath("/distribusi")
    revalidatePath("/titip-jual")
    revalidatePath("/")
    return { success: true, data: await getSesi(id) }
  } catch (error) {
    console.error(`[editLaporanSore ERROR] id: ${id}`, {
      message: error.message,
      stack: error.stack,
      data: JSON.stringify(data),
      alasan
    })
    return { success: false, error: error.message || "Gagal edit laporan sore." }
  }
}

export async function deleteSesi(id, alasan) {
  const session = await auth()
  try {
    await distribusiTransaction(async (tx) => {
      const mutQueue = []
      const sesi = await tx.sesiHarian.findUnique({
        where: { id },
        include: {
          barangKeluar:  { include: { rokok: true } },
          barangKembali: { include: { rokok: true } },
          penjualan:     true,
          setoran:       true,
          titipJual:     { include: { items: true } },
        },
      })

      if (!sesi) return
      const is_historical = sesi.is_historical || false
      const cutoffSetting = await tx.appSetting.findUnique({ where: { key: "stock_cutoff_date" } })
      const cutoffStr = cutoffSetting?.value || null

      await logAudit({
        tx,
        entity_type: AUDIT_ENTITY.SESI_HARIAN,
        change_type: "Hapus Sesi",
        entity_id:   id,
        action:      AUDIT_ACTION.DELETE,
        old_values:  {
          tanggal:      sesi.tanggal.toISOString().split("T")[0],
          sales_id:     sesi.sales_id,
          status:       sesi.status,
          barangKeluar: sesi.barangKeluar.map(it => ({ rokok: it.rokok?.nama, qty: it.qty })),
          penjualan:    sesi.penjualan.map(it => ({ rokok_id: it.rokok_id, qty: it.qty, harga: it.harga })),
          setoran:      sesi.setoran.map(it => ({ metode: it.metode, jumlah: it.jumlah })),
          barangKembali: sesi.barangKembali.map(it => ({ rokok: it.rokok?.nama, qty: it.qty })),
        },
        alasan,
        user_id:   session?.user?.id,
        user_name: session?.user?.name,
      })

      // Revert barangKeluar (was OUT → revert with IN)
      for (const it of sesi.barangKeluar) {
        if (it.qty > 0 && !is_historical) {
          mutQueue.push({
            rokok_id: it.rokok_id, tanggal: sesi.tanggal, jenis: 'in', qty: it.qty,
            source: MUTATION_SOURCE.REVERT, reference_id: id,
            keterangan: "Revert distribusi sales (delete sesi)", user_id: session?.user?.id,
            allowNegative: true,
          })
        }
      }
      // Revert barangKembali (was IN → revert with OUT)
      for (const it of sesi.barangKembali) {
        if (it.qty > 0 && !is_historical) {
          mutQueue.push({
            rokok_id: it.rokok_id, tanggal: sesi.tanggal, jenis: 'out', qty: it.qty,
            source: MUTATION_SOURCE.REVERT, reference_id: id,
            keterangan: "Revert barang kembali (delete sesi)", user_id: session?.user?.id,
            allowNegative: true,
          })
        }
      }

      const setoransPenyelesaian = await tx.titipJualSetoran.findMany({
        where: { sesi_penyelesaian_id: id }
      })

      const completedTjIds = [...new Set(setoransPenyelesaian.map(s => s.titip_jual_id))]
      const completedTjIdSet = new Set(completedTjIds)

      for (const tjId of completedTjIds) {
        const tj = await tx.titipJual.findUnique({
          where: { id: tjId },
          include: { items: true }
        })

        if (tj) {
          queueRevertKonsinyasiKembali(
            mutQueue,
            tj,
            tj.tanggal_selesai || sesi.tanggal,
            cutoffStr,
            session,
            "Revert konsinyasi kembali (delete sesi)"
          )
          await tx.titipJualItem.updateMany({
            where: { titip_jual_id: tjId },
            data: { qty_terjual: 0, qty_kembali: 0 }
          })
          await tx.titipJual.update({
            where: { id: tjId },
            data: { status: "aktif", tanggal_selesai: null, flag_selisih_setoran: false }
          })
        }
      }

      await tx.titipJualSetoran.deleteMany({ where: { sesi_penyelesaian_id: id } })

      for (const k of sesi.titipJual) {
        if (completedTjIdSet.has(k.id)) continue
        queueRevertKonsinyasiKembali(
          mutQueue,
          k,
          k.tanggal_selesai || sesi.tanggal,
          cutoffStr,
          session,
          "Revert konsinyasi kembali (delete sesi)"
        )
      }

      await tx.titipJual.deleteMany({ where: { sesi_id: id } })

      // Revert retur yang dibuat di sesi ini (dari tab tukar barang tanpa pengganti)
      const returDiSesi = await tx.retur.findMany({
        where: { sesi_id: id },
        include: { items: true },
      })
      for (const r of returDiSesi) {
        for (const it of r.items) {
          if (!is_historical) {
            mutQueue.push({
              rokok_id: it.rokok_id,
              tanggal: sesi.tanggal,
              jenis: 'out',
              qty: it.qty,
              source: MUTATION_SOURCE.REVERT,
              reference_id: r.id,
              keterangan: "Revert retur (delete sesi)",
              user_id: session?.user?.id,
              allowNegative: true,
            })
          }
        }
      }
      await tx.retur.deleteMany({ where: { sesi_id: id } })

      // Revert tukar barang yang dibuat di sesi ini
      const tukarBaruDiSesi = await tx.tukarBarang.findMany({
        where: { sesi_id: id },
        include: { itemsMasuk: true, itemsKeluar: true },
      })
      for (const t of tukarBaruDiSesi) {
        await reverseStockMutationNet(tx, t.id, {
          keterangan: "Revert net tukar barang (delete sesi)",
          session,
          mutQueue,
        })
        await tx.tukarBarang.delete({ where: { id: t.id } })
      }

      // Revert penyelesaian tukar yang diselesaikan di sesi ini (status balik aktif)
      const tukarSelesaiDiSesi = await tx.tukarBarang.findMany({
        where: { sesi_selesai_id: id, status: "selesai" },
      })
      for (const t of tukarSelesaiDiSesi) {
        if (t.sesi_id === id) continue
        await revertSelesaiTukarBarangInSesi(tx, t.id, session, mutQueue)
      }

      // Revert sample keluar (restore stok_sample_cukai & stok_sample_biasa)
      if (!is_historical) await revertSesiSampleKeluar(id, tx)

      // Flush semua mutasi stok dalam batch
      await mutateStockBatch({ tx, mutations: mutQueue })

      await tx.sesiHarian.delete({ where: { id } })
    })

    revalidatePath("/distribusi")
    revalidatePath("/titip-jual")
    revalidatePath("/")
    return { success: true, id }
  } catch (error) {
    console.error(`[deleteSesi ERROR] id: ${id}`, {
      message: error.message,
      stack: error.stack,
    })
    return { success: false, error: error.message || "Gagal menghapus sesi." }
  }
}
