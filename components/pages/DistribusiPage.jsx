"use client"

import { useEffect, useMemo, useState, Fragment } from "react"
import { Plus, Trash2, AlertCircle, ChevronDown, ChevronUp, Download, X, History, Info } from "lucide-react"
import { fmtIDR, fmtTanggal, filterByDateRange, defaultDateRange, sortByDateDesc, getJakartaToday } from "@/lib/utils"
import { createSesi, updateSesiPagi, submitLaporanSore, editLaporanSore, deleteSesi, getSesiListByDateRange, getSesiListLightweight, getSesi } from "@/actions/distribusi"
import { getTukarBarangAktifBySalesId } from "@/actions/tukar-barang"
import { settleTitipJual, createTitipJual, editSettlement, revertSettlement, editTitipJualDetail, deleteTitipJual } from "@/actions/titip_jual"
import { addToko } from "@/actions/toko"
import SettlementForm from "@/components/SettlementForm"
import {
  Card, PageHeader, DateFilter, PrimaryButton, Field, FormActions,
  MultiSearchableSelect, SearchableSelect, SelectInput, inputCls, MoneyInput, RowActions, IconButton, useConfirm, useConfirmWithReason, Button
} from "@/components/ui"
import DataTable from "@/components/DataTable"
import Modal from "@/components/Modal"
import RokokItemsTooltip from "@/components/RokokItemsTooltip"

const PAGE_SIZE = 10

const KATEGORI_COLOR = {
  grosir:     "bg-violet-100 text-violet-700",
  toko:       "bg-blue-100 text-blue-700",
  perorangan: "bg-amber-100 text-amber-700",
}

const STATUS_COLOR = {
  aktif:   "bg-yellow-100 text-yellow-700",
  selesai: "bg-green-100 text-green-700",
}

function Badge({ label, colorClass }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colorClass}`}>
      {label}
    </span>
  )
}

function SkeletonText({ w = "w-24" }) {
  return <div className={`h-3.5 ${w} animate-pulse rounded bg-neutral-200`} />
}

function SkeletonBadge() {
  return <div className="h-5 w-14 animate-pulse rounded-full bg-neutral-200" />
}

function collectSessionRokokIds(session) {
  const ids = new Set()
  const add = (items = []) => items.forEach((it) => it?.rokok_id && ids.add(String(it.rokok_id)))

  // Kita fokus pada barang yang dibawa (barangKeluar) dan yang terjual (penjualan)
  // karena ini yang paling relevan dengan tampilan di tabel distribusi.
  add(session.barangKeluar)
  add(session.penjualan)

  return ids
}

function addStockDelta(map, rokokId, qty) {
  if (!rokokId || !Number.isFinite(Number(qty))) return
  const key = String(rokokId)
  map.set(key, (map.get(key) || 0) + Number(qty))
}

function getSessionStockEffect(session) {
  const effect = new Map()
  if (!session || session.is_historical) return effect

  for (const it of session.barangKeluar || []) addStockDelta(effect, it.rokok_id, -Number(it.qty || 0))
  for (const it of session.barangKembali || []) addStockDelta(effect, it.rokok_id, Number(it.qty || 0))

  for (const retur of session.returDiSesi || []) {
    for (const it of retur.items || []) addStockDelta(effect, it.rokok_id, Number(it.qty || 0))
  }

  const tukarMap = new Map()
  for (const t of session.tukarBarang || []) tukarMap.set(t.id, t)
  for (const t of session.tukarBarangSelesaiDiSesi || []) tukarMap.set(t.id, t)
  for (const tukar of tukarMap.values()) {
    if (tukar.sesi_id && tukar.sesi_id !== session.id) continue
    for (const it of tukar.itemsMasuk || []) addStockDelta(effect, it.rokok_id, Number(it.qty || 0))
  }

  return effect
}

function getStockDeltaBetweenSessions(beforeSession, afterSession) {
  const before = getSessionStockEffect(beforeSession)
  const after = getSessionStockEffect(afterSession)
  const delta = new Map()
  for (const [rokokId, qty] of after.entries()) addStockDelta(delta, rokokId, qty)
  for (const [rokokId, qty] of before.entries()) addStockDelta(delta, rokokId, -qty)
  return delta
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
        active
          ? "border-blue-600 text-blue-600"
          : "border-transparent text-neutral-500 hover:text-neutral-700"
      }`}
    >
      {children}
    </button>
  )
}

function getFilterSuffix(filters) {
  const { salesFilter, rokokFilter, statusFilter, salesList, rokokList } = filters || {}
  let suffix = ""

  if (salesFilter && salesFilter.length > 0 && salesList) {
    const names = salesFilter
      .map(id => salesList.find(s => String(s.id) === String(id))?.nama || "")
      .filter(Boolean)
      .map(name => name.toLowerCase().replace(/[^a-z0-9]+/g, "_"))
      .filter(Boolean)
    if (names.length > 0) {
      suffix += `_${names.join("_")}`
    }
  }

  if (rokokFilter && rokokFilter.length > 0 && rokokList) {
    const names = rokokFilter
      .map(id => rokokList.find(r => String(r.id) === String(id))?.nama || "")
      .filter(Boolean)
      .map(name => name.toLowerCase().replace(/[^a-z0-9]+/g, "_"))
      .filter(Boolean)
    if (names.length > 0) {
      suffix += `_${names.join("_")}`
    }
  }

  if (statusFilter) {
    const cleanStatus = statusFilter.toLowerCase().replace(/[^a-z0-9]+/g, "_")
    suffix += `_${cleanStatus}`
  }

  return suffix
}

function exportToExcel(rows, rokokList, dateRange, onNoData, filters = {}) {
  const XLSX = require("xlsx-js-style")

  // Kumpulkan semua item penjualan (langsung + konsinyasi selesai + tukar barang)
  const allItems = []
  for (const sesi of rows) {
    for (const it of (sesi.penjualan || [])) {
      allItems.push({ tanggal: sesi.tanggal, rokok_id: it.rokok_id, rokok: it.rokok, qty: it.qty, harga: it.harga, kategori: it.kategori || "toko" })
    }
    const completedKonsinyasi = new Map()
    for (const k of (sesi.konsinyasiSelesaiDiSesi || [])) {
      if (k.status === "selesai") completedKonsinyasi.set(k.id, k)
    }
    for (const k of (sesi.konsinyasi || [])) {
      if (k.status === "selesai" && (!k.tanggal_selesai || !sesi.tanggal || k.tanggal_selesai === sesi.tanggal)) {
        completedKonsinyasi.set(k.id, k)
      }
    }
    for (const k of completedKonsinyasi.values()) {
      const tanggal = k.tanggal_selesai || sesi.tanggal
      for (const it of k.items) {
        if (it.qty_terjual > 0) {
          allItems.push({ tanggal, rokok_id: it.rokok_id, rokok: it.rokok, qty: it.qty_terjual, harga: it.harga, kategori: k.kategori || "toko" })
        }
      }
    }
    // Tukar Barang
    const completedTukar = new Map()
    for (const t of (sesi.tukarBarangSelesaiDiSesi || [])) {
      if (t.status === "selesai") completedTukar.set(t.id, t)
    }
    for (const t of completedTukar.values()) {
      const tanggal = t.tanggal_selesai || sesi.tanggal
      for (const it of t.itemsKeluar || []) {
        const rokokNama = it.rokok?.nama || it.rokok || rokokList.find(r => r.id === it.rokok_id)?.nama || ""
        allItems.push({ tanggal, rokok_id: it.rokok_id, rokok: rokokNama, qty: it.qty, harga: it.harga_satuan, kategori: t.kategori || "grosir" })
      }
      for (const it of t.itemsMasuk || []) {
        const rokokNama = it.rokok?.nama || it.rokok || rokokList.find(r => r.id === it.rokok_id)?.nama || ""
        allItems.push({ tanggal, rokok_id: it.rokok_id, rokok: rokokNama, qty: -it.qty, harga: it.harga_satuan, kategori: t.kategori || "grosir" })
      }
    }
  }
  if (!allItems.length) { onNoData?.(); return }

  // Produk unik (urut berdasarkan urutan rokokList) & tanggal unik (urut asc)
  const rokokOrderMap = Object.fromEntries(rokokList.map((r) => [r.nama, r.urutan ?? 0]))
  const products = [...new Set(allItems.map((it) => it.rokok))].sort((a, b) => (rokokOrderMap[a] ?? 0) - (rokokOrderMap[b] ?? 0))

  const getDatesInRange = (startStr, endStr) => {
    const arr = []
    let current = new Date(startStr)
    const end = new Date(endStr)
    current.setUTCHours(0, 0, 0, 0)
    end.setUTCHours(0, 0, 0, 0)
    while (current <= end) {
      const yyyy = current.getUTCFullYear()
      const mm = String(current.getUTCMonth() + 1).padStart(2, '0')
      const dd = String(current.getUTCDate()).padStart(2, '0')
      arr.push(`${yyyy}-${mm}-${dd}`)
      current.setUTCDate(current.getUTCDate() + 1)
    }
    return arr
  }

  const rawDates = [...new Set(allItems.map((it) => it.tanggal))].sort()
  let dates = []
  if (dateRange?.start && dateRange?.end) {
    dates = getDatesInRange(dateRange.start, dateRange.end)
  } else {
    dates = rawDates
  }

  // Map harga_beli per rokok_id
  const hargaBeli = Object.fromEntries(rokokList.map((r) => [r.id, r.harga_beli || 0]))

  // Agregasi per tanggal
  const dateMap = {}
  for (const it of allItems) {
    if (!dateMap[it.tanggal]) dateMap[it.tanggal] = { byProduct: {}, penjualan: 0, profit: 0 }
    if (!dateMap[it.tanggal].byProduct[it.rokok]) {
      dateMap[it.tanggal].byProduct[it.rokok] = { grosir: 0, toko: 0 }
    }
    const cat = it.kategori === "grosir" ? "grosir" : "toko"
    dateMap[it.tanggal].byProduct[it.rokok][cat] = (dateMap[it.tanggal].byProduct[it.rokok][cat] || 0) + it.qty
    dateMap[it.tanggal].penjualan += it.qty * it.harga
    dateMap[it.tanggal].profit   += it.qty * (it.harga - (hargaBeli[it.rokok_id] || 0))
  }

  // Hitung total
  const totalByProduct = {}
  for (const p of products) {
    totalByProduct[p] = {
      grosir: dates.reduce((s, d) => s + (dateMap[d]?.byProduct?.[p]?.grosir || 0), 0),
      toko: dates.reduce((s, d) => s + (dateMap[d]?.byProduct?.[p]?.toko || 0), 0)
    }
  }
  const totalPenjualan = dates.reduce((s, d) => s + (dateMap[d]?.penjualan || 0), 0)
  const totalProfit    = dates.reduce((s, d) => s + (dateMap[d]?.profit || 0), 0)

  const fmtD = (d) => { const [y, m, day] = d.split("-"); return `${day}/${m}/${y}` }

  const start = dateRange?.start ? fmtD(dateRange.start) : fmtD(dates[0])
  const end   = dateRange?.end   ? fmtD(dateRange.end)   : fmtD(dates[dates.length - 1])
  const title = `LAPORAN PENJUALAN HARIAN ${start} - ${end}`

  const totalCols = 2 + products.length * 2 + 2

  // Border tipis
  const bThin = { style: "thin", color: { rgb: "000000" } }
  const border = { top: bThin, bottom: bThin, left: bThin, right: bThin }
  const ctr = { horizontal: "center", vertical: "center" }

  // Styles (Monochrome / Black & White)
  const sH     = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "1F2937" } }, alignment: ctr, border }
  const sSub   = sH
  const sProdHeader = sH
  const sGR    = sH
  const sTK    = sH
  const sData  = { alignment: ctr, border }
  const sNum   = { alignment: ctr, border }
  const sMoney = { alignment: { horizontal: "left", vertical: "center" }, border }
  const sTotal = { font: { bold: true, color: { rgb: "000000" } }, fill: { fgColor: { rgb: "E5E7EB" } }, alignment: ctr, border }
  const sTotalNum = sTotal
  const sTotalMoney = { ...sTotal, alignment: { horizontal: "left", vertical: "center" } }
  const sTitle = { font: { bold: true, sz: 14 }, alignment: { horizontal: "center", vertical: "center" } }
  
  // Data column styles to flow all the way down
  const sGRData = sData
  const sTKData = sData

  const fmtExcelMoney = (v) => "Rp. " + (v || 0).toLocaleString("id-ID")

  const wsData = [
    // Baris 1: judul
    [{ v: title, s: sTitle }, ...Array(totalCols - 1).fill({ v: "", s: sTitle })],
    // Baris 2: kosong
    Array(totalCols).fill({ v: "" }),
    // Baris 3: header atas
    [
      { v: "NO",             s: sH },
      { v: "TANGGAL",        s: sH },
      { v: "PRODUK",         s: sH },
      ...Array(products.length * 2 - 1).fill({ v: "", s: sH }),
      { v: "PENJUALAN (RP)", s: sH },
      { v: "PROFIT (RP)",    s: sH },
    ],
    // Baris 4: nama produk
    [
      { v: "", s: sSub },
      { v: "", s: sSub },
      ...products.flatMap((p) => [
        { v: p.toUpperCase(), s: sProdHeader },
        { v: "", s: sProdHeader }
      ]),
      { v: "", s: sSub },
      { v: "", s: sSub },
    ],
    // Baris 5: sub-headers (GR & TK)
    [
      { v: "", s: sSub },
      { v: "", s: sSub },
      ...products.flatMap(() => [
        { v: "GR", s: sGR },
        { v: "TK", s: sTK }
      ]),
      { v: "", s: sSub },
      { v: "", s: sSub },
    ],
    // Baris data
    ...dates.map((date, i) => {
      const d = dateMap[date] || { byProduct: {}, penjualan: 0, profit: 0 }
      return [
        { v: i + 1,       t: "n", s: sData },
        { v: fmtD(date),          s: sData },
        ...products.flatMap((p) => {
          const prodData = d.byProduct[p] || { grosir: 0, toko: 0 }
          return [
            { v: prodData.grosir, t: "n", s: sGRData },
            { v: prodData.toko,   t: "n", s: sTKData }
          ]
        }),
        { v: fmtExcelMoney(d.penjualan), t: "s", s: sMoney },
        { v: fmtExcelMoney(d.profit),    t: "s", s: sMoney },
      ]
    }),
    // Baris TOTAL
    [
      { v: "",        s: sTotal },
      { v: "TOTAL",   s: sTotal },
      ...products.flatMap((p) => {
        const prodTotal = totalByProduct[p] || { grosir: 0, toko: 0 }
        return [
          { v: prodTotal.grosir, t: "n", s: sTotal },
          { v: prodTotal.toko,   t: "n", s: sTotal }
        ]
      }),
      { v: fmtExcelMoney(totalPenjualan), t: "s", s: sTotalMoney },
      { v: fmtExcelMoney(totalProfit),    t: "s", s: sTotalMoney },
    ],
  ]

  const ws = XLSX.utils.aoa_to_sheet(wsData)

  // Merge cells
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } },
    { s: { r: 2, c: 0 }, e: { r: 4, c: 0 } },
    { s: { r: 2, c: 1 }, e: { r: 4, c: 1 } },
    { s: { r: 2, c: 2 }, e: { r: 2, c: 1 + products.length * 2 } },
    ...products.map((_, i) => ({
      s: { r: 3, c: 2 + i * 2 },
      e: { r: 3, c: 2 + i * 2 + 1 }
    })),
    { s: { r: 2, c: 2 + products.length * 2 }, e: { r: 4, c: 2 + products.length * 2 } },
    { s: { r: 2, c: 3 + products.length * 2 }, e: { r: 4, c: 3 + products.length * 2 } },
  ]

  // Auto-fit column widths berdasarkan konten terpanjang
  const autoW = (values) => ({ wch: Math.min(Math.max(...values.map((v) => String(v ?? "").length)) + 3, 40) })
  const productCols = products.flatMap((p) => {
    const w = Math.max(6, Math.ceil((p.length + 4) / 2))
    return [
      { wch: w },
      { wch: w }
    ]
  })

  ws["!cols"] = [
    autoW(["NO", ...dates.map((_, i) => i + 1)]),                                            // NO
    autoW(["TANGGAL", ...dates.map(fmtD)]),                                                   // TANGGAL
    ...productCols,                                                                           // per produk (grosir & toko)
    autoW(["PENJUALAN (RP)", fmtExcelMoney(totalPenjualan), ...dates.map((d) => fmtExcelMoney(dateMap[d]?.penjualan || 0))]),     // PENJUALAN
    autoW(["PROFIT (RP)",    fmtExcelMoney(totalProfit),    ...dates.map((d) => fmtExcelMoney(dateMap[d]?.profit || 0))]),        // PROFIT
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Distribusi")
  const startFmt = dateRange?.start ? dateRange.start : (dates[0] || "all")
  const endFmt = dateRange?.end ? dateRange.end : (dates[dates.length - 1] || "all")
  const suffix = getFilterSuffix(filters)
  const filename = `laporan_penjualan_${startFmt}_to_${endFmt}${suffix}.xlsx`
  XLSX.writeFile(wb, filename)
}

function exportToExcelBySales(rows, rokokList, dateRange, onNoData, filters = {}) {
  const XLSX = require("xlsx-js-style")
  const { buildRincianPerSalesData } = require("@/lib/export-rincian-sales")

  const { dataMap, activeSales, sortedRokokIds, rokokMeta } = buildRincianPerSalesData(rows, rokokList)
  if (!sortedRokokIds.length) { onNoData?.(); return }

  const getTotals = (rid) => {
    const t = { langsungQty: 0, langsungUang: 0, titipQty: 0, titipUang: 0, tukarQty: 0, tukarUang: 0 }
    for (const sn of activeSales) {
      const d = dataMap[rid]?.[sn] || {}
      t.langsungQty  += d.langsungQty  || 0; t.langsungUang += d.langsungUang || 0
      t.titipQty     += d.titipQty     || 0; t.titipUang    += d.titipUang    || 0
      t.tukarQty     += d.tukarQty     || 0; t.tukarUang    += d.tukarUang    || 0
    }
    t.totalQty = t.langsungQty + t.titipQty + t.tukarQty
    t.totalUang = t.langsungUang + t.titipUang + t.tukarUang
    return t
  }

  const fmtD  = (d) => { const [y, m, day] = d.split("-"); return `${day}/${m}/${y}` }
  const start = dateRange?.start ? fmtD(dateRange.start) : "-"
  const end   = dateRange?.end   ? fmtD(dateRange.end)   : "-"
  const title = `LAPORAN PENJUALAN PER MOTORIS (${start} - ${end})`
  const fmtRp = (v) => "Rp " + (v || 0).toLocaleString("id-ID")

  const n         = activeSales.length
  const salesCol  = 5
  const qtyCol    = salesCol + 3 * n
  const uangCol   = qtyCol + 1
  const totalCols = uangCol + 4

  const bThin = { style: "thin", color: { rgb: "94A3B8" } }
  const border = { top: bThin, bottom: bThin, left: bThin, right: bThin }
  const ctr  = { horizontal: "center", vertical: "center" }
  
  // Header Styles (Soft slate & pastel palette)
  const sH    = { font: { bold: true, color: { rgb: "334155" } }, fill: { fgColor: { rgb: "F1F5F9" } }, alignment: ctr, border }
  const sHQ   = { font: { bold: true, color: { rgb: "0F766E" } }, fill: { fgColor: { rgb: "CCFBF1" } }, alignment: ctr, border }
  const sHU   = { font: { bold: true, color: { rgb: "1E40AF" } }, fill: { fgColor: { rgb: "DBEAFE" } }, alignment: ctr, border }
  const sHAmb = { font: { bold: true, color: { rgb: "92400E" } }, fill: { fgColor: { rgb: "FEF3C7" } }, alignment: ctr, border }
  const sHGrn = { font: { bold: true, color: { rgb: "166534" } }, fill: { fgColor: { rgb: "DCFCE7" } }, alignment: ctr, border }
  const sHLs  = { font: { bold: true, color: { rgb: "166534" } }, fill: { fgColor: { rgb: "DCFCE7" } }, alignment: ctr, border }
  const sHTp  = { font: { bold: true, color: { rgb: "B45309" } }, fill: { fgColor: { rgb: "FEF9C3" } }, alignment: ctr, border }
  const sHTk  = { font: { bold: true, color: { rgb: "1D4ED8" } }, fill: { fgColor: { rgb: "E0F2FE" } }, alignment: ctr, border }
  const sHTQ  = { font: { bold: true, color: { rgb: "0F766E" } }, fill: { fgColor: { rgb: "CCFBF1" } }, alignment: ctr, border }
  const sHTU  = { font: { bold: true, color: { rgb: "1E40AF" } }, fill: { fgColor: { rgb: "DBEAFE" } }, alignment: ctr, border }
  
  // Data Styles
  const sBase = { border, alignment: ctr, font: { color: { rgb: "475569" } } }
  const sProd = { border, alignment: { horizontal: "left", vertical: "center" }, font: { color: { rgb: "1E293B" } } }
  const sNum  = { border, alignment: ctr, z: "#,##0", font: { color: { rgb: "475569" } } }
  const sLsQ  = { ...sNum, fill: { fgColor: { rgb: "F0FDF4" } }, font: { color: { rgb: "166534" } } }
  const sTpQ  = { ...sNum, fill: { fgColor: { rgb: "FEFCE8" } }, font: { color: { rgb: "854D0E" } } }
  const sTkQ  = { ...sNum, fill: { fgColor: { rgb: "F0F9FF" } }, font: { color: { rgb: "1E40AF" } } }
  const sTtQ  = { font: { bold: true, color: { rgb: "0F766E" } }, fill: { fgColor: { rgb: "F0FDFA" } }, border, alignment: ctr, z: "#,##0" }
  const sMon  = { border, alignment: ctr, font: { color: { rgb: "475569" } } }
  const sLsU  = { border, alignment: ctr, fill: { fgColor: { rgb: "F0FDF4" } }, font: { color: { rgb: "166534" } } }
  const sTpU  = { border, alignment: ctr, fill: { fgColor: { rgb: "FEFCE8" } }, font: { color: { rgb: "854D0E" } } }
  const sTkU  = { border, alignment: ctr, fill: { fgColor: { rgb: "F0F9FF" } }, font: { color: { rgb: "1E40AF" } } }
  const sTtU  = { font: { bold: true, color: { rgb: "1E40AF" } }, fill: { fgColor: { rgb: "EFF6FF" } }, border, alignment: ctr }
  const sMonG = { border, alignment: ctr, fill: { fgColor: { rgb: "FEF3C7" } }, font: { color: { rgb: "92400E" } } }
  const sMonT = { border, alignment: ctr, fill: { fgColor: { rgb: "DCFCE7" } }, font: { color: { rgb: "166534" } } }
  const sTitle = { font: { bold: true, sz: 13 }, alignment: ctr, border }
  const sFoot = { font: { bold: true, color: { rgb: "1E293B" } }, fill: { fgColor: { rgb: "E2E8F0" } }, border, alignment: ctr }
  const sFtQ  = { ...sFoot, z: "#,##0" }

  const wsData = [
    // Row 0: Title
    [{ v: title, s: sTitle }, ...Array(totalCols - 1).fill({ v: "", s: sTitle })],
    // Row 1: Empty
    Array(totalCols).fill(""),
    // Row 2: Group headers
    [
      { v: "NO", s: sH }, { v: "PRODUK", s: sH },
      { v: "HARGA", s: sH }, { v: "", s: sH }, { v: "", s: sH },
      { v: "MOTORIS", s: sH }, ...Array(3 * n - 1).fill({ v: "", s: sH }),
      { v: "TOTAL QTY", s: sHQ },
      { v: "RINCIAN UANG", s: sHU }, { v: "", s: sHU }, { v: "", s: sHU }, { v: "", s: sHU },
    ],
    // Row 3: Sub-headers 1 (Sales names & money labels)
    [
      { v: "", s: sH }, { v: "", s: sH },
      { v: "BELI", s: sH }, { v: "GROSIR", s: sHAmb }, { v: "TOKO", s: sHGrn },
      ...activeSales.flatMap(nm => [
        { v: nm.toUpperCase(), s: sH }, { v: "", s: sH }, { v: "", s: sH }
      ]),
      { v: "", s: sHQ },
      { v: "Langsung", s: sHLs }, { v: "Titip Jual", s: sHTp }, { v: "Tukar Brg", s: sHTk }, { v: "TOTAL UANG", s: sHTU },
    ],
    // Row 4: Sub-headers 2 (LG, TJ, TB)
    [
      { v: "", s: sH }, { v: "", s: sH },
      { v: "", s: sH }, { v: "", s: sH }, { v: "", s: sH },
      ...activeSales.flatMap(() => [
        { v: "LG", s: sHLs }, { v: "TJ", s: sHTp }, { v: "TB", s: sHTk }
      ]),
      { v: "", s: sHQ },
      { v: "", s: sHU }, { v: "", s: sHU }, { v: "", s: sHU }, { v: "", s: sHU },
    ],
    // Data Rows
    ...sortedRokokIds.map((rid, i) => {
      const meta = rokokMeta[rid] || {}
      const tot  = getTotals(rid)
      return [
        { v: i + 1, s: sBase },
        { v: meta.nama || rid, s: sProd },
        { v: fmtRp(meta.harga_beli), t: "s", s: sMon },
        { v: fmtRp(meta.harga_grosir), t: "s", s: sMonG },
        { v: fmtRp(meta.harga_toko), t: "s", s: sMonT },
        ...activeSales.flatMap(sn => {
          const d = dataMap[rid]?.[sn] || {}
          return [
            { v: d.langsungQty || 0, s: sLsQ },
            { v: d.titipQty || 0, s: sTpQ },
            { v: d.tukarQty || 0, s: sTkQ }
          ]
        }),
        { v: tot.totalQty, s: sTtQ },
        { v: fmtRp(tot.langsungUang), t: "s", s: sLsU },
        { v: fmtRp(tot.titipUang),    t: "s", s: sTpU },
        { v: fmtRp(tot.tukarUang),    t: "s", s: sTkU },
        { v: fmtRp(tot.totalUang),    t: "s", s: sTtU },
      ]
    }),
    // Footer Row
    [
      { v: "", s: sFoot }, { v: "TOTAL KESELURUHAN", s: sFoot },
      { v: "", s: sFoot }, { v: "", s: sFoot }, { v: "", s: sFoot },
      ...activeSales.flatMap(sn => [
        { v: sortedRokokIds.reduce((sum, rid) => sum + (dataMap[rid]?.[sn]?.langsungQty || 0), 0), s: sFtQ },
        { v: sortedRokokIds.reduce((sum, rid) => sum + (dataMap[rid]?.[sn]?.titipQty || 0), 0), s: sFtQ },
        { v: sortedRokokIds.reduce((sum, rid) => sum + (dataMap[rid]?.[sn]?.tukarQty || 0), 0), s: sFtQ }
      ]),
      { v: sortedRokokIds.reduce((s, rid) => s + getTotals(rid).totalQty, 0), s: sFtQ },
      { v: fmtRp(sortedRokokIds.reduce((s, rid) => s + getTotals(rid).langsungUang, 0)), t: "s", s: sFoot },
      { v: fmtRp(sortedRokokIds.reduce((s, rid) => s + getTotals(rid).titipUang,    0)), t: "s", s: sFoot },
      { v: fmtRp(sortedRokokIds.reduce((s, rid) => s + getTotals(rid).tukarUang,    0)), t: "s", s: sFoot },
      { v: fmtRp(sortedRokokIds.reduce((s, rid) => s + getTotals(rid).totalUang,    0)), t: "s", s: sFoot },
    ],
  ]

  const ws     = XLSX.utils.aoa_to_sheet(wsData)
  const lastR  = wsData.length - 1
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } },             // Title
    { s: { r: 2, c: 0 }, e: { r: 4, c: 0 } },                         // NO
    { s: { r: 2, c: 1 }, e: { r: 4, c: 1 } },                         // PRODUK
    { s: { r: 2, c: 2 }, e: { r: 2, c: 4 } },                         // HARGA Group
    { s: { r: 3, c: 2 }, e: { r: 4, c: 2 } },                         // BELI Sub-header
    { s: { r: 3, c: 3 }, e: { r: 4, c: 3 } },                         // GROSIR Sub-header
    { s: { r: 3, c: 4 }, e: { r: 4, c: 4 } },                         // TOKO Sub-header
    { s: { r: 2, c: salesCol }, e: { r: 2, c: salesCol + 3 * n - 1 } }, // MOTORIS Group
    ...activeSales.map((_, i) => ({
      s: { r: 3, c: salesCol + 3 * i }, e: { r: 3, c: salesCol + 3 * i + 2 } // Individual Sales Name merge
    })),
    { s: { r: 2, c: qtyCol }, e: { r: 4, c: qtyCol } },               // TOTAL QTY
    { s: { r: 2, c: uangCol }, e: { r: 2, c: uangCol + 3 } },         // RINCIAN UANG Group
    { s: { r: 3, c: uangCol },     e: { r: 4, c: uangCol } },         // Langsung Uang Sub-header
    { s: { r: 3, c: uangCol + 1 }, e: { r: 4, c: uangCol + 1 } },     // Titip Jual Uang Sub-header
    { s: { r: 3, c: uangCol + 2 }, e: { r: 4, c: uangCol + 2 } },     // Tukar Brg Uang Sub-header
    { s: { r: 3, c: uangCol + 3 }, e: { r: 4, c: uangCol + 3 } },     // TOTAL UANG Sub-header
    { s: { r: lastR, c: 1 }, e: { r: lastR, c: 4 } },                 // Footer label merge
  ]

  const autoW  = (vals) => ({ wch: Math.min(Math.max(...vals.map(v => String(v ?? "").length)) + 4, 40) })
  ws["!cols"]  = [
    { wch: 5 },                                                       // NO
    autoW(["PRODUK", ...sortedRokokIds.map(rid => rokokMeta[rid]?.nama || rid), "TOTAL KESELURUHAN"]), // PRODUK
    { wch: 14 }, { wch: 14 }, { wch: 14 },                            // Harga Beli/Grosir/Toko
    ...Array(3 * n).fill({ wch: 6 }),                                 // LG, TJ, TB columns per sales (compact)
    { wch: 13 },                                                      // TOTAL QTY
    { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 18 },              // Rincian Uang
  ]
  ws["!rows"]  = [{ hpt: 25 }, { hpt: 8 }, { hpt: 22 }, { hpt: 22 }, { hpt: 20 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Per Motoris")
  const startFmt = dateRange?.start ? dateRange.start : "all"
  const endFmt = dateRange?.end ? dateRange.end : "all"
  const suffix = getFilterSuffix(filters)
  const filename = `laporan_motoris_${startFmt}_to_${endFmt}${suffix}.xlsx`
  XLSX.writeFile(wb, filename)
}
export default function DistribusiPage({ role, rokokList, salesList, tokoList, stockCutoffSetting }) {
  const stockCutoffDate = stockCutoffSetting?.value
  const { confirm, ConfirmModal } = useConfirm()
  const { confirmWithReason, ConfirmWithReasonModal } = useConfirmWithReason()

  const [mode,      setMode]      = useState(null)
  const [editing,   setEditing]   = useState(null)
  const [detail,    setDetail]    = useState(null)
  const [laporanSesi, setLaporanSesi] = useState(null)
  const [editLaporan, setEditLaporan] = useState(null)
  const [dateRange,   setDateRange]   = useState(defaultDateRange("minggu_ini"))
  const [salesFilter, setSalesFilter] = useState([])
  const [rokokFilter, setRokokFilter] = useState([])
  const [statusFilter, setStatusFilter] = useState("")
  const [showExportMenu, setShowExportMenu] = useState(false)
  // Dimulai kosong — diisi oleh useEffect saat dateRange mount pertama kali
  const [localSesiList, setLocalSesiList] = useState([])
  const [localRokokList, setLocalRokokList] = useState(rokokList)
  const [pendingIds, setPendingIds] = useState(new Set())
  const [isFetchingRange, setIsFetchingRange] = useState(false)
  // tukarBarang aktif per-sales, di-fetch lazy saat form laporan sore dibuka
  const [tukarBarangAktif, setTukarBarangAktif] = useState([])

  useEffect(() => {
    setLocalRokokList(rokokList)
  }, [rokokList])

  // Setiap kali filter tanggal berubah (termasuk mount pertama), fetch sesi dari server.
  // Data sesi tidak lagi di-load di server — halaman render dulu, data nyusul di sini.
  useEffect(() => {
    if (!dateRange?.start || !dateRange?.end) return
    setIsFetchingRange(true)
    getSesiListLightweight(dateRange.start, dateRange.end)
      .then((fresh) => {
        // Gabungkan dengan localSesiList yang sudah ada:
        // – Pertahankan semua sesi di luar range (agar operasi CRUD di range lain tidak hilang)
        // – Timpa/tambah sesi di dalam range dengan data segar dari server
        setLocalSesiList((prev) => {
          const outside = prev.filter(
            (s) => s.tanggal < dateRange.start || s.tanggal > dateRange.end
          )
          return [...outside, ...fresh].sort((a, b) => {
            const byTanggal = b.tanggal.localeCompare(a.tanggal)
            return byTanggal !== 0 ? byTanggal : (b.createdAt || "").localeCompare(a.createdAt || "")
          })
        })
      })
      .catch((err) => console.error("[DistribusiPage] fetch range error", err))
      .finally(() => setIsFetchingRange(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange?.start, dateRange?.end])

  const applyLocalStockDelta = (deltaMap) => {
    if (!deltaMap || deltaMap.size === 0) return
    setLocalRokokList((prev) => prev.map((rokok) => {
      const delta = deltaMap.get(String(rokok.id)) || 0
      return delta === 0 ? rokok : { ...rokok, stok: (Number(rokok.stok) || 0) + delta }
    }))
  }

  const syncLocalStockFromSessionChange = (beforeSession, afterSession) => {
    applyLocalStockDelta(getStockDeltaBetweenSessions(beforeSession, afterSession))
  }

  const upsertLocalSesi = (record) => {
    if (!record?.id) return
    setLocalSesiList((prev) => {
      const exists = prev.some((s) => s.id === record.id)
      const next = exists ? prev.map((s) => (s.id === record.id ? record : s)) : [record, ...prev]
      return next.sort((a, b) => {
        const byTanggal = b.tanggal.localeCompare(a.tanggal)
        if (byTanggal !== 0) return byTanggal
        return (b.createdAt || "").localeCompare(a.createdAt || "")
      })
    })
  }

  const removeLocalSesi = (id) => {
    setLocalSesiList((prev) => prev.filter((s) => s.id !== id))
  }

  const rows = useMemo(() => {
    let temp = [...localSesiList]

    // 1. Filter by Date
    if (dateRange?.start && dateRange?.end) {
      temp = temp.filter(s => s.tanggal >= dateRange.start && s.tanggal <= dateRange.end)
    }

    // 2. Filter by Sales (OR Logic)
    if (salesFilter.length > 0) {
      const selectedSales = new Set(salesFilter.map(String))
      temp = temp.filter(s => selectedSales.has(String(s.sales_id)))
    }

    // 3. Filter by Multiple Products (AND Logic - session must have ALL selected products)
    if (rokokFilter.length > 0) {
      const selectedRokok = rokokFilter.filter(v => v !== "" && v !== null && v !== undefined).map(String)
      if (selectedRokok.length > 0) {
        temp = temp.filter(s => {
          const sessionRokokIds = collectSessionRokokIds(s)
          return selectedRokok.every(id => sessionRokokIds.has(id))
        })
      }
    }

    // 4. Filter by Status
    if (statusFilter) {
      if (statusFilter === "titip_jual_aktif") {
        temp = temp.filter(s => s.konsinyasi?.some(k => k.status === "aktif"))
      } else {
        temp = temp.filter(s => s.status === statusFilter)
      }
    }

    return temp.sort((a, b) => b.tanggal.localeCompare(a.tanggal))
  }, [localSesiList, dateRange, salesFilter, rokokFilter, statusFilter])

  const close = () => { setMode(null); setEditing(null) }

  const handleDelete = async (r) => {
    const alasan = await confirmWithReason(`Hapus sesi ${r.sales} — ${fmtTanggal(r.tanggal)}?`, {
      title: "Hapus Sesi",
      variant: "danger",
      confirmLabel: "Ya, Hapus"
    })
    if (!alasan) return
    syncLocalStockFromSessionChange(r, null)
    upsertLocalSesi({ ...r, _pending: true, _deleting: true })
    deleteSesi(r.id, alasan)
      .then((result) => {
        if (result && result.success === false) throw new Error(result.error || "Gagal menghapus sesi.")
        removeLocalSesi(r.id)
      })
      .catch(async (error) => {
        syncLocalStockFromSessionChange(null, r)
        upsertLocalSesi({ ...r, _pending: false, _deleting: false })
        await confirm(error?.message || "Gagal menghapus sesi.", { title: "Gagal Hapus Sesi", hideCancel: true })
      })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Distribusi"
        subtitle={
          <div className="flex items-center flex-wrap gap-x-2 gap-y-1">
            <span className="text-neutral-500">
              Sesi harian sales — barang keluar pagi & laporan sore.
            </span>
            {stockCutoffDate && (
              <span className="inline-flex items-center gap-1.5 bg-indigo-50/50 text-indigo-400 px-2 py-0.5 rounded-full border border-indigo-100/50 text-[10px] font-semibold tracking-wide transition-colors hover:bg-indigo-50">
                <History className="h-3 w-3" />
                MULAI SISTEM: {fmtTanggal(stockCutoffDate)}
              </span>
            )}
          </div>
        }
        action={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Button
                variant="secondary"
                onClick={() => setShowExportMenu(!showExportMenu)}
                icon={Download}
                iconRight={ChevronDown}
                iconRightClassName={`ml-auto transition-transform ${showExportMenu ? "rotate-180" : ""}`}
                className="w-44 justify-start"
              >
                Export Excel
              </Button>
              
              {showExportMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowExportMenu(false)} />
                  <div className="absolute right-0 z-20 mt-1.5 w-56 origin-top-right rounded-xl border border-neutral-200 bg-white p-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                    <Button
                      variant="ghost"
                      className="w-full justify-start gap-3 h-auto py-3 px-3"
                      onClick={async () => {
                        setShowExportMenu(false)
                        try {
                          const fullSesiList = await getSesiListByDateRange(dateRange.start, dateRange.end)
                          let temp = fullSesiList
                          if (salesFilter.length > 0) {
                            const selectedSales = new Set(salesFilter.map(String))
                            temp = temp.filter(s => selectedSales.has(String(s.sales_id)))
                          }
                          if (rokokFilter.length > 0) {
                            const selectedRokok = rokokFilter.filter(v => v !== "" && v !== null && v !== undefined).map(String)
                            if (selectedRokok.length > 0) {
                              temp = temp.filter(s => {
                                const ids = new Set()
                                const add = (items = []) => items.forEach((it) => it?.rokok_id && ids.add(String(it.rokok_id)))
                                add(s.barangKeluar)
                                add(s.penjualan)
                                return selectedRokok.every(id => ids.has(id))
                              })
                            }
                          }
                          if (statusFilter === "aktif") temp = temp.filter((s) => s.status === "aktif")
                          if (statusFilter === "selesai") temp = temp.filter((s) => s.status === "selesai")
                          if (statusFilter === "titip_jual_aktif") temp = temp.filter((s) => s.konsinyasi?.some((k) => k.status === "aktif"))
                          
                          exportToExcel(temp, rokokList, dateRange, () => confirm("Tidak ada data untuk diekspor.", { title: "Export Excel", hideCancel: true }), { salesFilter, rokokFilter, statusFilter, salesList, rokokList })
                        } catch (err) {
                          await confirm("Gagal mengambil data lengkap untuk export.", { title: "Gagal Export", hideCancel: true })
                        }
                      }}
                    >
                      <Download className="h-4 w-4 shrink-0 text-blue-600" />
                      <div className="text-left">
                         <p className="text-sm font-semibold text-neutral-900">Rekap Harian</p>
                         <p className="text-xs text-neutral-500">Ringkasan per tanggal</p>
                      </div>
                    </Button>
                    <Button
                      variant="ghost"
                      className="w-full justify-start gap-3 h-auto py-3 px-3 mt-0.5"
                      onClick={async () => {
                        setShowExportMenu(false)
                        try {
                          const fullSesiList = await getSesiListByDateRange(dateRange.start, dateRange.end)
                          let temp = fullSesiList
                          if (salesFilter.length > 0) {
                            const selectedSales = new Set(salesFilter.map(String))
                            temp = temp.filter(s => selectedSales.has(String(s.sales_id)))
                          }
                          if (rokokFilter.length > 0) {
                            const selectedRokok = rokokFilter.filter(v => v !== "" && v !== null && v !== undefined).map(String)
                            if (selectedRokok.length > 0) {
                              temp = temp.filter(s => {
                                const ids = new Set()
                                const add = (items = []) => items.forEach((it) => it?.rokok_id && ids.add(String(it.rokok_id)))
                                add(s.barangKeluar)
                                add(s.penjualan)
                                return selectedRokok.every(id => ids.has(id))
                              })
                            }
                          }
                          if (statusFilter === "aktif") temp = temp.filter((s) => s.status === "aktif")
                          if (statusFilter === "selesai") temp = temp.filter((s) => s.status === "selesai")
                          if (statusFilter === "titip_jual_aktif") temp = temp.filter((s) => s.konsinyasi?.some((k) => k.status === "aktif"))
                          
                          exportToExcelBySales(temp, rokokList, dateRange, () => confirm("Tidak ada data untuk diekspor.", { title: "Export Excel", hideCancel: true }), { salesFilter, rokokFilter, statusFilter, salesList, rokokList })
                        } catch (err) {
                          await confirm("Gagal mengambil data lengkap untuk export.", { title: "Gagal Export", hideCancel: true })
                        }
                      }}
                    >
                      <Download className="h-4 w-4 shrink-0 text-green-600" />
                      <div className="text-left">
                        <p className="text-sm font-semibold text-neutral-900">Rincian per Sales</p>
                        <p className="text-xs text-neutral-500">Detail per produk & motoris</p>
                      </div>
                    </Button>
                  </div>
                </>
              )}
            </div>
            {role !== "staff" && (
              <PrimaryButton onClick={() => { setEditing(null); setMode("add") }} icon={Plus}>
                Buat Sesi
              </PrimaryButton>
            )}
          </div>
        }
      />


      <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:gap-4">
          <Field label="Rentang Waktu" className="flex-1">
            <div className="w-full">
              <DateFilter value={dateRange} onChange={setDateRange} />
            </div>
          </Field>
          
          <Field label="Sales" className="flex-1">
            <MultiSearchableSelect
              value={salesFilter}
              onChange={(e) => setSalesFilter(e.target.value)}
              placeholder="Semua Sales"
              options={[{ value: "", label: "Semua Sales" }, ...salesList.map((s) => ({ value: s.id, label: s.nama }))]}
            />
          </Field>

          <Field label="Status" className="flex-1">
            <SelectInput value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">Semua Status</option>
              <option value="aktif">Aktif</option>
              <option value="selesai">Selesai</option>
              <option value="titip_jual_aktif">Titip Jual Aktif</option>
            </SelectInput>
          </Field>
        </div>

        <Field label="Produk" className="w-full">
          <MultiSearchableSelect
            value={rokokFilter}
            onChange={(e) => setRokokFilter(e.target.value)}
            placeholder="Semua Produk"
            options={[{ value: "", label: "Semua Produk" }, ...rokokList.map((r) => ({ value: r.id, label: r.nama }))]}
          />
        </Field>
      </div>

      <Card>
        {isFetchingRange ? (
          <div className="divide-y divide-neutral-100">
            {/* Header skeleton */}
            <div className="grid grid-cols-[2rem_1fr_1fr_1fr_1fr_6rem] gap-4 px-4 py-3 bg-neutral-50">
              {["w-4","w-16","w-20","w-14","w-24","w-10"].map((w, i) => (
                <div key={i} className={`h-3 ${w} animate-pulse rounded bg-neutral-200`} />
              ))}
            </div>
            {/* Row skeletons */}
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="grid grid-cols-[2rem_1fr_1fr_1fr_1fr_6rem] gap-4 px-4 py-3.5 items-center" style={{ opacity: 1 - i * 0.13 }}>
                <div className="h-3 w-5 animate-pulse rounded bg-neutral-150" />
                <div className="h-3 w-20 animate-pulse rounded bg-neutral-200" />
                <div className="h-3 w-24 animate-pulse rounded bg-neutral-200" />
                <div className="h-5 w-16 animate-pulse rounded-full bg-neutral-200" />
                <div className="h-3 w-20 animate-pulse rounded bg-neutral-200" />
                <div className="ml-auto h-6 w-16 animate-pulse rounded bg-neutral-100" />
              </div>
            ))}
          </div>
        ) : (
        <DataTable
          key={`${dateRange?.start}-${dateRange?.end}-${salesFilter}-${rokokFilter}-${statusFilter}`}
          pageSize={PAGE_SIZE}
          rows={rows}
          empty="Belum ada sesi distribusi."
          columns={[
            { key: "no",      label: "No",      render: (_, idx) => idx + 1 },
            { key: "tanggal", label: "Tanggal", render: (r) => r._pending ? <SkeletonText w="w-20" /> : fmtTanggal(r.tanggal) },
            { key: "sales",   label: "Sales",   render: (r) => r._pending ? <SkeletonText w="w-24" /> : r.sales },
            {
              key: "status", label: "Status",
              render: (r) => {
                if (r._pending) return <SkeletonBadge />
                const hasAktifKonsinyasi = r.konsinyasi?.some((k) => k.status === "aktif")
                const tukarAktifSales = tukarBarangAktif.filter((t) => t.sales_id === r.sales_id).length
                return (
                  <div className="flex flex-col gap-1 items-start">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge label={r.status === "selesai" ? "Selesai" : "Aktif"} colorClass={STATUS_COLOR[r.status]} />
                      {r.is_historical && <Badge label="Data Lama" colorClass="bg-indigo-100 text-indigo-700 justify-center" />}
                    </div>
                    {hasAktifKonsinyasi && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
                        <AlertCircle className="h-3 w-3" /> Titip jual aktif
                      </span>
                    )}
                    {tukarAktifSales > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                        <AlertCircle className="h-3 w-3" /> {tukarAktifSales} tukar aktif
                      </span>
                    )}
                  </div>
                )
              },
            },
            {
              key: "keluar", label: "Barang Keluar",
              render: (r) => r._pending ? <SkeletonText w="w-40" /> : <RokokItemsTooltip items={r.barangKeluar} />
            },
            {
              key: "actions", label: "", align: "right",
              render: (r) => {
                if (r._pending) return (
                  <div className="flex items-center justify-end gap-2 pr-1">
                    <svg className="h-4 w-4 animate-spin text-neutral-400" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    <span className="text-xs text-neutral-400">{r._deleting ? "Menghapus..." : "Menyimpan..."}</span>
                  </div>
                )
                return (
                  <div className="flex items-center justify-end gap-1">
                    {role !== "staff" && r.status === "aktif" && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={async () => {
                          upsertLocalSesi({ ...r, _pending: true })
                          try {
                            const [list, fullSesi] = await Promise.all([
                              getTukarBarangAktifBySalesId(r.sales_id),
                              getSesi(r.id)
                            ])
                            setTukarBarangAktif(list)
                            setLaporanSesi(fullSesi)
                          } finally {
                            upsertLocalSesi({ ...r, _pending: false })
                          }
                        }}
                      >
                        Input Laporan
                      </Button>
                    )}
                    {role !== "staff" && r.status === "selesai" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                        onClick={async () => {
                          upsertLocalSesi({ ...r, _pending: true })
                          try {
                            const [list, fullSesi] = await Promise.all([
                              getTukarBarangAktifBySalesId(r.sales_id),
                              getSesi(r.id)
                            ])
                            setTukarBarangAktif(list)
                            setEditLaporan(fullSesi)
                          } finally {
                            upsertLocalSesi({ ...r, _pending: false })
                          }
                        }}
                      >
                        Edit Laporan
                      </Button>
                    )}
                    <RowActions
                      onDetail={async () => {
                        upsertLocalSesi({ ...r, _pending: true })
                        try {
                          const fullSesi = await getSesi(r.id)
                          setDetail(fullSesi)
                        } finally {
                          upsertLocalSesi({ ...r, _pending: false })
                        }
                      }}
                      onEdit={role !== "staff" && r.status === "aktif" ? async () => { 
                        upsertLocalSesi({ ...r, _pending: true })
                        try {
                          const fullSesi = await getSesi(r.id)
                          setEditing(fullSesi); setMode("edit") 
                        } finally {
                          upsertLocalSesi({ ...r, _pending: false })
                        }
                      } : null}
                      onDelete={role !== "staff" ? () => { handleDelete(r) } : null}
                    />
                  </div>
                )
              },
            },
          ]}
        />
        )}
      </Card>

      {detail && (
        <Modal title="Detail Sesi" onClose={() => setDetail(null)} width="max-w-5xl" hideHeader>
          <SesiDetailRedesign record={detail} onClose={() => setDetail(null)} />
        </Modal>
      )}

      {mode && (
        <Modal title={mode === "add" ? "Buat Sesi Pagi" : "Edit Sesi Pagi"} onClose={close} width="max-w-2xl">
          <SesiPagiForm
            initial={editing}
            rokokList={localRokokList}
            salesList={salesList}
            sesiList={localSesiList.filter((s) => !s._pending)}
            stockCutoffDate={stockCutoffDate}
            onSubmit={async (data) => {
              if (mode === "add") {
                const tempId = `__pending__${Date.now()}`
                const salesName = salesList.find((s) => s.id === data.sales_id)?.nama || ""
                const optimisticRow = {
                  id: tempId,
                  tanggal: data.tanggal,
                  sales_id: data.sales_id,
                  sales: salesName,
                  status: "aktif",
                  is_historical: false,
                  catatan: data.catatan || null,
                  createdAt: new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }),
                  updatedAt: new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }),
                  barangKeluar: (data.barangKeluar || []).map((it) => ({
                    rokok_id: it.rokok_id,
                    rokok: rokokList.find((r) => r.id === it.rokok_id)?.nama || "???",
                    qty: it.qty,
                  })),
                  penjualan: [], setoran: [], barangKembali: [],
                  konsinyasi: [], tukarBarang: [], tukarBarangSelesaiDiSesi: [],
                  flagSetoran: false, flagQty: false,
                  nilaiPenjualan: 0, totalSetoran: 0,
                  _pending: true,
                }
                setPendingIds((prev) => new Set([...prev, tempId]))
                upsertLocalSesi(optimisticRow)
                close()
                try {
                  const result = await createSesi(data)
                  if (result && result.success === false) {
                    throw new Error(result.error || "Gagal membuat sesi distribusi.")
                  }
                  setLocalSesiList((prev) => {
                    const withoutTemp = prev.filter((s) => s.id !== tempId)
                    const exists = withoutTemp.some((s) => s.id === result.data.id)
                    const next = exists ? withoutTemp.map((s) => s.id === result.data.id ? result.data : s) : [result.data, ...withoutTemp]
                    return next.sort((a, b) => {
                      const byTanggal = b.tanggal.localeCompare(a.tanggal)
                      if (byTanggal !== 0) return byTanggal
                      return (b.createdAt || "").localeCompare(a.createdAt || "")
                    })
                  })
                  syncLocalStockFromSessionChange(null, result.data)
                } catch (error) {
                  removeLocalSesi(tempId)
                  await confirm(error?.message || "Gagal membuat sesi distribusi.", { title: "Gagal Buat Sesi", hideCancel: true })
                } finally {
                  setPendingIds((prev) => { const next = new Set(prev); next.delete(tempId); return next })
                }
              } else {
                const captured = editing
                const alasan = await confirmWithReason(`Edit distribusi pagi ${captured.sales}?`, { title: "Edit Distribusi Pagi", confirmLabel: "Ya, Simpan" })
                if (!alasan) return
                upsertLocalSesi({ ...captured, _pending: true })
                close()
                updateSesiPagi(captured.id, data, alasan)
                  .then((result) => {
                    if (result && result.success === false) throw new Error(result.error || "Gagal mengubah sesi distribusi.")
                    upsertLocalSesi(result.data)
                    syncLocalStockFromSessionChange(captured, result.data)
                  })
                  .catch(async (error) => {
                    upsertLocalSesi({ ...captured, _pending: false })
                    await confirm(error?.message || "Gagal mengubah sesi distribusi.", { title: "Gagal Edit Sesi", hideCancel: true })
                  })
              }
            }}
            onCancel={close}
          />
        </Modal>
      )}

      {laporanSesi && (
        <Modal title={`Laporan Sore — ${laporanSesi.sales} (${fmtTanggal(laporanSesi.tanggal)})`} onClose={() => setLaporanSesi(null)} width="max-w-4xl">
          <LaporanSoreForm
            sesi={laporanSesi}
            rokokList={localRokokList}
            tokoList={tokoList}
            tukarBarangAktif={tukarBarangAktif}
            onSessionChange={upsertLocalSesi}
            onSubmit={(data) => {
              const captured = laporanSesi
              upsertLocalSesi({ ...captured, _pending: true })
              setLaporanSesi(null)
              submitLaporanSore(captured.id, { ...data, sales_id: captured.sales_id, tanggal: captured.tanggal })
                .then((result) => {
                  if (result && result.success === false) throw new Error(result.error || "Gagal submit laporan sore.")
                  upsertLocalSesi(result.data)
                  syncLocalStockFromSessionChange(captured, result.data)
                })
                .catch(async (error) => {
                  upsertLocalSesi({ ...captured, _pending: false })
                  await confirm(error?.message || "Gagal submit laporan sore.", { title: "Gagal Input Laporan", hideCancel: true })
                })
            }}
            onCancel={() => setLaporanSesi(null)}
          />
        </Modal>
      )}

      {editLaporan && (
        <Modal title={`Edit Laporan — ${editLaporan.sales} (${fmtTanggal(editLaporan.tanggal)})`} onClose={() => setEditLaporan(null)} width="max-w-4xl">
          <LaporanSoreForm
            sesi={editLaporan}
            rokokList={localRokokList}
            tokoList={tokoList}
            tukarBarangAktif={tukarBarangAktif}
            isEdit
            onSessionChange={upsertLocalSesi}
            onSubmit={async (data, alasan) => {
              const captured = editLaporan
              upsertLocalSesi({ ...captured, _pending: true })
              setEditLaporan(null)
              editLaporanSore(captured.id, { ...data, sales_id: captured.sales_id, tanggal: captured.tanggal }, alasan)
                .then((result) => {
                  if (result && result.success === false) throw new Error(result.error || "Gagal edit laporan sore.")
                  upsertLocalSesi(result.data)
                  syncLocalStockFromSessionChange(captured, result.data)
                })
                .catch(async (error) => {
                  upsertLocalSesi({ ...captured, _pending: false })
                  await confirm(error?.message || "Gagal edit laporan sore.", { title: "Gagal Edit Laporan", hideCancel: true })
                })
            }}
            onCancel={() => setEditLaporan(null)}
          />
        </Modal>
      )}
      {ConfirmModal}
      {ConfirmWithReasonModal}
    </div>
  )
}

// ─── Detail Sesi ─────────────────────────────────────────────────────────────

function SesiDetail({ record }) {
  const [activeTab, setActiveTab] = useState("penjualan")

  const totalQtyTerjual = record.penjualan.reduce((sum, it) => sum + it.qty, 0)
  const kembaliMap = Object.fromEntries(record.barangKembali.map((it) => [it.rokok_id, it.qty]))

  return (
    <div className="space-y-5 text-sm">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div><p className="text-xs text-neutral-500">Tanggal</p><p className="font-medium">{fmtTanggal(record.tanggal)}</p></div>
        <div><p className="text-xs text-neutral-500">Sales</p><p className="font-medium">{record.sales}</p></div>
        <div>
          <p className="text-xs text-neutral-500">Status</p>
          <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
            <Badge label={record.status === "selesai" ? "Selesai" : "Aktif"} colorClass={STATUS_COLOR[record.status]} />
            {record.is_historical && <Badge label="Data Lama" colorClass="bg-indigo-100 text-indigo-700 justify-center" />}
          </div>
        </div>
        {record.status === "selesai" && (
          <div><p className="text-xs text-neutral-500">Total Terjual</p><p className="font-medium">{totalQtyTerjual} bungkus</p></div>
        )}
        {record.flagSetoran && <div className="flex items-center gap-1 text-red-600 text-xs col-span-2"><AlertCircle className="h-3 w-3" /> Selisih setoran: {fmtIDR(record.nilaiPenjualan)} vs {fmtIDR(record.totalSetoran)}</div>}
      </div>

      <Section title="Barang Keluar (Pagi)">
        <SimpleTable rows={record.barangKeluar} cols={["rokok", "qty"]} labels={["Rokok", "Qty"]} />
      </Section>

      {/* Tabs */}
      <div className="flex border-b border-neutral-200">
        <TabButton active={activeTab === "penjualan"} onClick={() => setActiveTab("penjualan")}>
          Penjualan Langsung
        </TabButton>
        <TabButton active={activeTab === "konsinyasi"} onClick={() => setActiveTab("konsinyasi")}>
          Titip Jual {record.konsinyasi.length > 0 && `(${record.konsinyasi.length})`}
        </TabButton>
        <TabButton active={activeTab === "tukar"} onClick={() => setActiveTab("tukar")}>
          Tukar Barang {record.tukarBarang?.length > 0 && `(${record.tukarBarang.length})`}
        </TabButton>
        {record.returDiSesi?.length > 0 && (
          <TabButton active={activeTab === "retur"} onClick={() => setActiveTab("retur")}>
            Retur ({record.returDiSesi.length})
          </TabButton>
        )}
      </div>

      {activeTab === "penjualan" && (
        <div className="space-y-5">
          {record.penjualan.length > 0 ? (
            <div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-neutral-200 text-neutral-500">
                    <th className="pb-1.5 text-left">Rokok</th>
                    <th className="pb-1.5 text-left">Kategori</th>
                    <th className="pb-1.5 text-right">Terjual</th>
                    <th className="pb-1.5 text-right">Kembali</th>
                    <th className="pb-1.5 text-right">Harga</th>
                    <th className="pb-1.5 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {record.penjualan.map((it, i) => {
                    const isFirstOfRokok = i === 0 || record.penjualan[i - 1].rokok_id !== it.rokok_id
                    const kembali = isFirstOfRokok ? kembaliMap[it.rokok_id] : null
                    return (
                      <tr key={i} className="border-b border-neutral-100">
                        <td className="py-1.5">{isFirstOfRokok ? it.rokok : ""}</td>
                        <td className="py-1.5">
                          <Badge label={it.kategori} colorClass={KATEGORI_COLOR[it.kategori] || "bg-neutral-100 text-neutral-600"} />
                        </td>
                        <td className="py-1.5 text-right tabular-nums">{it.qty}</td>
                        <td className="py-1.5 text-right tabular-nums text-neutral-400">
                          {isFirstOfRokok ? (kembali ?? "—") : ""}
                        </td>
                        <td className="py-1.5 text-right tabular-nums">{fmtIDR(it.harga)}</td>
                        <td className="py-1.5 text-right tabular-nums">{fmtIDR(it.qty * it.harga)}</td>
                      </tr>
                    )
                  })}
                  <tr className="border-t-2 border-neutral-200 font-semibold">
                    <td colSpan={5} className="py-1.5">Total</td>
                    <td className="py-1.5 text-right tabular-nums">{fmtIDR(record.nilaiPenjualan)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-neutral-400 italic">Tidak ada penjualan langsung.</p>
          )}

          {record.setoran.length > 0 && (
            <Section title="Setoran">
              <div className="space-y-1">
                {record.setoran.map((it, i) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span className="font-medium capitalize">{it.metode}</span>
                    <span className="tabular-nums">{fmtIDR(it.jumlah)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-xs font-semibold border-t border-neutral-200 pt-1">
                  <span>Total Setoran</span>
                  <span className={`tabular-nums ${record.flagSetoran ? "text-red-600" : "text-green-700"}`}>{fmtIDR(record.totalSetoran)}</span>
                </div>
              </div>
            </Section>
          )}
        </div>
      )}

      {activeTab === "konsinyasi" && (
        <div className="space-y-3">
          {record.konsinyasi.length > 0 ? (
            record.konsinyasi.map((k, i) => (
              <div key={i} className="rounded-lg border border-neutral-200 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{k.nama_toko}</span>
                  <div className="flex items-center gap-2">
                    <Badge label={k.kategori} colorClass={KATEGORI_COLOR[k.kategori] || "bg-neutral-100 text-neutral-600"} />
                    <Badge label={k.status === "selesai" ? "Selesai" : "Aktif"} colorClass={STATUS_COLOR[k.status]} />
                  </div>
                </div>
                <p className="text-xs text-neutral-500">Jatuh Tempo: {fmtTanggal(k.tanggal_jatuh_tempo)}</p>
                {k.status === "selesai" && k.tanggal_selesai && (
                  <p className="text-xs text-green-600">Diselesaikan: {fmtTanggal(k.tanggal_selesai)}</p>
                )}
                <SimpleTable rows={k.items} cols={["rokok", "qty_keluar", "qty_terjual", "qty_kembali"]} labels={["Rokok", "Keluar", "Terjual", "Kembali"]} />
              </div>
            ))
          ) : (
            <p className="text-xs text-neutral-400 italic">Tidak ada titip jual pada sesi ini.</p>
          )}
        </div>
      )}

      {activeTab === "tukar" && (
        <div className="space-y-3">
          {record.tukarBarang?.length > 0 ? (
            record.tukarBarang.map((t, i) => (
              <div key={i} className="rounded-lg border border-neutral-200 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{t.toko}</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-semibold text-neutral-500 mb-1">Rokok dari Toko</p>
                    <SimpleTable rows={t.itemsMasuk} cols={["rokok", "qty"]} labels={["Rokok", "Qty"]} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-neutral-500 mb-1">Rokok Pengganti</p>
                    <SimpleTable rows={t.itemsKeluar} cols={["rokok", "qty"]} labels={["Rokok", "Qty"]} />
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="text-xs text-neutral-400 italic">Tidak ada tukar barang pada sesi ini.</p>
          )}
        </div>
      )}

      {activeTab === "retur" && (
        <div className="space-y-3">
          {(record.returDiSesi || []).map((r, i) => (
            <div key={i} className="rounded-lg border border-teal-200 bg-teal-50/40 p-3 space-y-2">
              {r.alasan && <p className="text-xs text-neutral-500 italic">Alasan: {r.alasan}</p>}
              <SimpleTable rows={r.items} cols={["rokok", "qty"]} labels={["Rokok", "Qty"]} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">{title}</p>
      {children}
    </div>
  )
}

function SimpleTable({ rows, cols, labels }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-neutral-200 text-neutral-500">
          {labels.map((l, i) => <th key={i} className={`pb-1.5 ${i > 0 ? "text-right" : "text-left"}`}>{l}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className="border-b border-neutral-100">
            {cols.map((c, ci) => (
              <td key={ci} className={`py-1.5 ${ci > 0 ? "text-right tabular-nums" : ""}`}>{row[c]}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ─── Form Sesi Pagi ───────────────────────────────────────────────────────────

// Detail Sesi Redesign
function SesiDetailRedesign({ record, onClose }) {
  const [activeTab, setActiveTab] = useState("penjualan")

  const penjualan = record.penjualan || []
  const konsinyasi = record.konsinyasi || []
  const barangKeluar = record.barangKeluar || []
  const barangKembali = record.barangKembali || []
  const setoran = record.setoran || []
  const tukarBarang = useMemo(() => mergeTukarBarang(record), [record])

  const kembaliMap = Object.fromEntries(barangKembali.map((it) => [it.rokok_id, it.qty]))
  const totalBarangKeluar = barangKeluar.reduce((sum, it) => sum + Number(it.qty || 0), 0)
  const totalQtyTerjual = penjualan.reduce((sum, it) => sum + Number(it.qty || 0), 0)
    + konsinyasi.reduce((sum, k) => sum + (k.items || []).reduce((ss, it) => ss + Number(it.qty_terjual || 0), 0), 0)

  const directTotals = penjualan.reduce((acc, it) => {
    const kategori = it.kategori || "lainnya"
    acc[kategori] = (acc[kategori] || 0) + Number(it.qty || 0) * Number(it.harga || 0)
    return acc
  }, {})
  const totalPenjualanLangsung = Object.values(directTotals).reduce((sum, value) => sum + value, 0)
  const totalTitipJual = konsinyasi.reduce((sum, k) => (
    sum + (k.items || []).reduce((ss, it) => ss + Number(it.qty_keluar || 0) * Number(it.harga || 0), 0)
  ), 0)
  const totalTitipTerjual = konsinyasi.reduce((sum, k) => (
    sum + (k.items || []).reduce((ss, it) => ss + Number(it.qty_terjual || 0) * Number(it.harga || 0), 0)
  ), 0)
  const totalTukarMasuk = tukarBarang.reduce((sum, t) => sum + totalTukarItems(t.itemsMasuk), 0)
  const totalTukarKeluar = tukarBarang.reduce((sum, t) => sum + totalTukarItems(t.itemsKeluar), 0)
  const selisihTukar = totalTukarKeluar - totalTukarMasuk
  // Titip jual tidak masuk total penjualan — uang diterima saat diselesaikan, bukan saat dititipkan
  const totalKeseluruhan = totalPenjualanLangsung + selisihTukar

  const setoranByMethod = setoran.reduce((acc, it) => {
    const metode = (it.metode || "lainnya").toLowerCase()
    acc[metode] = (acc[metode] || 0) + Number(it.jumlah || 0)
    return acc
  }, {})
  const totalSetoran = Object.values(setoranByMethod).reduce((sum, value) => sum + value, 0)
  const selisihSetoran = totalSetoran - totalKeseluruhan
  const jamSesi = formatJamSesi(record)
  const statusTone = record.status === "selesai" ? "green" : "amber"

  return (
    <div className="-m-6 overflow-hidden rounded-xl bg-white text-sm">
      <div className="flex items-start justify-between border-b border-neutral-100 px-5 py-5 sm:px-7">
        <div>
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className="rounded bg-neutral-100 px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider text-neutral-500">
              Sesi #{record.tanggal}
            </span>
            <DetailStatusPill tone={statusTone}>{record.status === "selesai" ? "Selesai" : "Aktif"}</DetailStatusPill>
            {record.is_historical && <DetailStatusPill tone="blue">Data Lama</DetailStatusPill>}
          </div>
          <h2 className="text-xl font-semibold tracking-tight text-neutral-900 sm:text-2xl">Detail Sesi Distribusi</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup detail sesi"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900"
        >
          <X className="h-4 w-4" strokeWidth={2.25} />
        </button>
      </div>

      <div className="border-b border-neutral-100 bg-gradient-to-b from-neutral-50/80 to-white px-5 py-5 sm:px-7">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <DetailSummaryItem label="Tanggal" value={fmtTanggal(record.tanggal)} sub={formatHari(record.tanggal)} />
          <DetailSummaryItem label="Jam" value={jamSesi} sub={record.status === "selesai" ? "Pagi sampai sore" : "Sesi berjalan"} />
          <DetailSummaryItem label="Sales" value={record.sales} sub={record.sales_kategori ? `Kategori ${record.sales_kategori}` : "Tim operasional"} />
          <DetailSummaryItem label="Total Terjual" value={`${totalQtyTerjual} bungkus`} sub={`${penjualan.length} transaksi langsung`} />
        </div>
      </div>

      <div className="border-b border-neutral-100 px-5 py-5 sm:px-7">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="rounded bg-neutral-100 px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider text-neutral-500">Pagi</span>
            <h3 className="text-sm font-semibold text-neutral-800">Barang Keluar</h3>
          </div>
          <span className="text-xs tabular-nums text-neutral-500">{totalBarangKeluar} bungkus total</span>
        </div>
        {barangKeluar.length > 0 ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {barangKeluar.map((it) => (
              <div key={it.id || it.rokok_id} className="flex items-center justify-between gap-3 rounded-lg border border-neutral-100 bg-neutral-50 px-3 py-2.5 shadow-sm">
                <span className="truncate text-sm font-medium text-neutral-700">{it.rokok}</span>
                <span className="shrink-0 text-sm font-bold tabular-nums text-neutral-900">{it.qty}</span>
              </div>
            ))}
          </div>
        ) : (
          <DetailEmpty text="Belum ada barang keluar." />
        )}

        {/* Section Sample Keluar */}
        {(record.sample || []).length > 0 && (
          <div className="mt-6">
            <div className="mb-3 flex items-center gap-2">
              <span className="rounded bg-neutral-100 px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider text-neutral-500">Sample</span>
              <h3 className="text-sm font-semibold text-neutral-800">Barang Sample</h3>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {record.sample.map((sm) => {
                const isCukai = sm.type === "cukai"
                return (
                  <div key={sm.id} className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 shadow-sm transition-colors ${isCukai ? "border-orange-100 bg-orange-50/50" : "border-blue-100 bg-blue-50/50"}`}>
                    <div className="flex min-w-0 flex-col">
                      <span className={`text-[10px] font-bold uppercase tracking-wider ${isCukai ? "text-orange-600" : "text-blue-600"}`}>
                        Sample {sm.type}
                      </span>
                      <span className="truncate text-sm font-medium text-neutral-800">{sm.rokok}</span>
                    </div>
                    <span className={`shrink-0 text-sm font-bold tabular-nums ${isCukai ? "text-orange-700" : "text-blue-700"}`}>
                      {sm.qty_keluar}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <div className="px-5 pt-5 sm:px-7">
        <div className="flex gap-1 overflow-x-auto border-b border-neutral-200">
          <DetailTabButton id="penjualan" active={activeTab} onClick={setActiveTab} count={penjualan.length}>Penjualan Langsung</DetailTabButton>
          <DetailTabButton id="konsinyasi" active={activeTab} onClick={setActiveTab} count={konsinyasi.length}>Titip Jual</DetailTabButton>
          <DetailTabButton id="tukar" active={activeTab} onClick={setActiveTab} count={tukarBarang.length}>Tukar Barang</DetailTabButton>
          {(record.returDiSesi?.length || 0) > 0 && (
            <DetailTabButton id="retur" active={activeTab} onClick={setActiveTab} count={record.returDiSesi.length}>Retur</DetailTabButton>
          )}
        </div>
      </div>

      <div className="px-5 py-5 sm:px-7">
        {activeTab === "penjualan" && (
          penjualan.length > 0 ? (
            <div className="overflow-x-auto rounded-lg ring-1 ring-neutral-200">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-neutral-50 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                  <tr>
                    <th className="px-3 py-2.5 text-left">Rokok</th>
                    <th className="px-3 py-2.5 text-left">Kategori</th>
                    <th className="px-3 py-2.5 text-right">Terjual</th>
                    <th className="px-3 py-2.5 text-right">Kembali</th>
                    <th className="px-3 py-2.5 text-right">Harga</th>
                    <th className="px-3 py-2.5 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {penjualan.map((it, i) => {
                    const isFirstOfRokok = i === 0 || penjualan[i - 1].rokok_id !== it.rokok_id
                    const kembali = isFirstOfRokok ? kembaliMap[it.rokok_id] : null
                    const total = Number(it.qty || 0) * Number(it.harga || 0)
                    return (
                      <tr key={it.id || i} className="bg-white">
                        <td className="px-3 py-2.5 text-neutral-800">{isFirstOfRokok ? it.rokok : ""}</td>
                        <td className="px-3 py-2.5"><DetailCategoryChip kategori={it.kategori} /></td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-neutral-800">{it.qty}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-neutral-400">{isFirstOfRokok ? (kembali ?? "-") : ""}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-neutral-700">{fmtIDR(it.harga)}</td>
                        <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-neutral-900">{fmtIDR(total)}</td>
                      </tr>
                    )
                  })}
                  <tr className="bg-neutral-50">
                    <td colSpan={5} className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-neutral-600">Total</td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-neutral-900">{fmtIDR(totalPenjualanLangsung)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <DetailEmpty text="Tidak ada penjualan langsung pada sesi ini." />
          )
        )}

        {activeTab === "konsinyasi" && (
          <div className="space-y-3">
            {konsinyasi.length > 0 ? (
              konsinyasi.map((k) => {
                const nilaiTitip = (k.items || []).reduce((sum, it) => sum + Number(it.qty_keluar || 0) * Number(it.harga || 0), 0)
                return (
                  <div key={k.id} className="overflow-hidden rounded-lg ring-1 ring-neutral-200">
                    <div className="flex flex-col gap-2 border-b border-neutral-200 bg-neutral-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-neutral-900">{k.nama_toko}</div>
                        <div className="mt-0.5 text-xs text-neutral-500">Jatuh Tempo: {fmtTanggal(k.tanggal_jatuh_tempo)}</div>
                        {k.status === "selesai" && k.tanggal_selesai && (
                          <div className="mt-0.5 text-xs text-green-600">Diselesaikan: {fmtTanggal(k.tanggal_selesai)}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <DetailCategoryChip kategori={k.kategori} />
                        <DetailStatusPill tone={k.status === "selesai" ? "green" : "amber"}>{k.status === "selesai" ? "Selesai" : "Aktif"}</DetailStatusPill>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[720px] text-sm">
                        <thead className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                          <tr className="border-b border-neutral-100">
                            <th className="px-4 py-2 text-left">Rokok</th>
                            <th className="px-4 py-2 text-right">Harga</th>
                            <th className="px-4 py-2 text-right">Keluar</th>
                            <th className="px-4 py-2 text-right">Terjual</th>
                            <th className="px-4 py-2 text-right">Kembali</th>
                            <th className="px-4 py-2 text-right">Nilai Titip</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100">
                          {(k.items || []).map((it) => (
                            <tr key={it.id}>
                              <td className="px-4 py-2.5 text-neutral-800">{it.rokok}</td>
                              <td className="px-4 py-2.5 text-right tabular-nums text-neutral-700">{fmtIDR(it.harga)}</td>
                              <td className="px-4 py-2.5 text-right tabular-nums text-neutral-700">{it.qty_keluar}</td>
                              <td className="px-4 py-2.5 text-right tabular-nums text-neutral-700">{it.qty_terjual}</td>
                              <td className="px-4 py-2.5 text-right tabular-nums text-neutral-400">{it.qty_kembali}</td>
                              <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-neutral-900">{fmtIDR(Number(it.qty_keluar || 0) * Number(it.harga || 0))}</td>
                            </tr>
                          ))}
                          <tr className="bg-neutral-50">
                            <td colSpan={5} className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-neutral-600">Total Nilai Dititipkan</td>
                            <td className="px-4 py-2 text-right font-semibold tabular-nums text-neutral-900">{fmtIDR(nilaiTitip)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })
            ) : (
              <DetailEmpty text="Tidak ada titip jual pada sesi ini." />
            )}
          </div>
        )}

        {activeTab === "retur" && (
          <div className="space-y-3">
            {(record.returDiSesi || []).map((r, i) => (
              <div key={i} className="overflow-hidden rounded-lg ring-1 ring-teal-200 bg-teal-50/40">
                {r.alasan && <p className="px-4 pt-3 text-xs text-neutral-500 italic">Alasan: {r.alasan}</p>}
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-teal-100 text-neutral-500">
                    <th className="px-4 py-2 text-left">Rokok</th>
                    <th className="px-4 py-2 text-right">Qty</th>
                  </tr></thead>
                  <tbody>
                    {r.items.map((it, j) => (
                      <tr key={j} className="border-b border-teal-100/60 last:border-0">
                        <td className="px-4 py-2 text-neutral-800">{it.rokok}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-neutral-700">{it.qty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}

        {activeTab === "tukar" && (
          tukarBarang.length > 0 ? (
            <div className="overflow-hidden rounded-lg ring-1 ring-neutral-200">
              <div className="grid grid-cols-[1fr_auto_1fr] bg-neutral-50 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                <div className="px-4 py-2.5">Rokok dari Toko</div>
                <div className="px-3 py-2.5"></div>
                <div className="px-4 py-2.5">Rokok Pengganti</div>
              </div>
              <div className="divide-y divide-neutral-100">
                {tukarBarang.map((t, i) => {
                  const totalMasuk = totalTukarItems(t.itemsMasuk)
                  const totalKeluar = totalTukarItems(t.itemsKeluar)
                  const diff = totalMasuk - totalKeluar
                  return (
                    <div key={t.id || i} className="grid grid-cols-1 bg-white sm:grid-cols-[1fr_auto_1fr]">
                      <div className="px-4 py-3">
                        <TukarItems items={t.itemsMasuk} empty="Belum ada barang dari toko." />
                      </div>
                      <div className="hidden items-center justify-center px-3 text-neutral-300 sm:flex">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-100">-&gt;</div>
                      </div>
                      <div className="border-t border-neutral-100 px-4 py-3 sm:border-l sm:border-t-0">
                        <TukarItems items={t.itemsKeluar} empty="Belum ada barang pengganti." />
                        <div className={`mt-2 flex items-center justify-end gap-1.5 border-t border-dashed border-neutral-200 pt-2 text-[11px] tabular-nums ${diff > 0 ? "text-emerald-700" : diff < 0 ? "text-rose-700" : "text-neutral-500"}`}>
                          <span className="text-neutral-500">selisih nilai</span>
                          <span className="font-semibold">{fmtSignedIDR(diff)}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <DetailEmpty text="Tidak ada tukar barang pada sesi ini." />
          )
        )}
      </div>

      <div className="border-t border-neutral-100 bg-neutral-50 px-5 py-5 sm:px-7">
        <div className="mb-4 flex items-center gap-2">
          <h3 className="text-sm font-semibold text-neutral-800">Ringkasan Keuangan & Setoran</h3>
          <span className="font-mono text-[11px] uppercase tracking-wider text-neutral-500">A vs B</span>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <div className="mb-2 px-1 font-mono text-[10px] uppercase tracking-wider text-neutral-500">A · Penjualan</div>
            <div className="overflow-hidden rounded-xl bg-white ring-1 ring-neutral-200">
              <div className="divide-y divide-neutral-100">
                <DetailMoneyRow label="Penjualan Grosir" value={directTotals.grosir || 0} sub={`${countPenjualanByKategori(penjualan, "grosir")} item`} />
                <DetailMoneyRow label="Penjualan Toko" value={directTotals.toko || 0} sub={`${countPenjualanByKategori(penjualan, "toko")} item`} />
                {(directTotals.perorangan || 0) > 0 && <DetailMoneyRow label="Penjualan Perorangan" value={directTotals.perorangan} sub={`${countPenjualanByKategori(penjualan, "perorangan")} item`} />}
                <DetailMoneyRow label="Titip Jual" value={totalTitipJual} sub={`${konsinyasi.length} toko, terjual ${fmtIDR(totalTitipTerjual)} · tidak termasuk total`} muted />
                <DetailMoneyRow label="Tukar Barang" value={selisihTukar} sub={`${fmtIDR(totalTukarKeluar)} keluar - ${fmtIDR(totalTukarMasuk)} masuk`} signed />
              </div>
              <div className="flex items-center justify-between bg-neutral-900 px-4 py-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-white/70">Total Penjualan</span>
                <span className="text-lg font-bold tabular-nums tracking-tight text-white">{fmtIDR(totalKeseluruhan)}</span>
              </div>
            </div>
          </div>

          <div>
            <div className="mb-2 px-1 font-mono text-[10px] uppercase tracking-wider text-neutral-500">B · Setoran · Sore</div>
            <div className="overflow-hidden rounded-xl bg-white ring-1 ring-neutral-200">
              <div className="divide-y divide-neutral-100">
                <SetoranSummaryRow label="Cash" sub="Tunai" value={setoranByMethod.cash || 0} tone="emerald" />
                <SetoranSummaryRow label="Transfer" sub="Bank / e-wallet" value={setoranByMethod.transfer || 0} tone="sky" />
              </div>
              <div className="flex items-center justify-between bg-neutral-900 px-4 py-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-white/70">Total Setoran</span>
                <span className="text-lg font-bold tabular-nums tracking-tight text-white">{fmtIDR(totalSetoran)}</span>
              </div>
            </div>
          </div>
        </div>

        <SelisihSetoranRow selisih={selisihSetoran} totalPenjualan={totalKeseluruhan} totalSetoran={totalSetoran} />
      </div>
    </div>
  )
}

function mergeTukarBarang(record) {
  const map = new Map()
  for (const item of [...(record.tukarBarang || []), ...(record.tukarBarangSelesaiDiSesi || [])]) {
    if (!item) continue
    map.set(item.id || `${item.tanggal}-${map.size}`, item)
  }
  return [...map.values()]
}

function totalTukarItems(items = []) {
  return items.reduce((sum, it) => sum + Number(it.qty || 0) * Number(it.harga_satuan || 0), 0)
}

function countPenjualanByKategori(items, kategori) {
  return items.filter((it) => it.kategori === kategori).length
}

function fmtSignedIDR(value) {
  if (!value) return fmtIDR(0)
  return `${value > 0 ? "+" : "-"}${fmtIDR(Math.abs(value))}`
}

function formatHari(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleDateString("id-ID", { weekday: "long" })
}

function formatJam(value) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
}

function formatJamSesi(record) {
  const mulai = formatJam(record.createdAt)
  const selesai = record.status === "selesai" ? formatJam(record.updatedAt) : null
  if (mulai && selesai && mulai !== selesai) return `${mulai} - ${selesai}`
  return mulai || selesai || "-"
}

function DetailSummaryItem({ label, value, sub }) {
  return (
    <div className="min-w-0 px-1 py-1">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-0.5 truncate text-base font-semibold text-neutral-900">{value}</div>
      {sub && <div className="mt-0.5 truncate text-[11px] tabular-nums text-neutral-500">{sub}</div>}
    </div>
  )
}

function DetailTabButton({ id, active, onClick, count, children }) {
  const isActive = active === id
  return (
    <button
      type="button"
      onClick={() => onClick(id)}
      className={`relative shrink-0 px-4 py-2.5 text-sm font-medium transition-colors ${
        isActive ? "text-neutral-900" : "text-neutral-500 hover:text-neutral-700"
      }`}
    >
      <span className="flex items-center gap-1.5">
        {children}
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${isActive ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-500"}`}>{count || 0}</span>
      </span>
      {isActive && <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t bg-neutral-900" />}
    </button>
  )
}

function DetailCategoryChip({ kategori }) {
  const styles = {
    grosir: "bg-violet-50 text-violet-700 ring-violet-200",
    toko: "bg-sky-50 text-sky-700 ring-sky-200",
    perorangan: "bg-amber-50 text-amber-700 ring-amber-200",
  }
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ${styles[kategori] || "bg-neutral-100 text-neutral-700 ring-neutral-200"}`}>
      {kategori || "-"}
    </span>
  )
}

function DetailStatusPill({ children, tone = "green" }) {
  const tones = {
    green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    blue: "bg-sky-50 text-sky-700 ring-sky-200",
    amber: "bg-amber-50 text-amber-700 ring-amber-200",
    neutral: "bg-neutral-100 text-neutral-700 ring-neutral-200",
  }
  const dots = {
    green: "bg-emerald-500",
    blue: "bg-sky-500",
    amber: "bg-amber-500",
    neutral: "bg-neutral-500",
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${tones[tone] || tones.neutral}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dots[tone] || dots.neutral}`} />
      {children}
    </span>
  )
}

function DetailMoneyRow({ label, value, sub, signed = false, muted = false }) {
  const valueClass = signed && value !== 0
    ? (value > 0 ? "text-emerald-700" : "text-rose-700")
    : muted ? "text-neutral-400" : "text-neutral-900"
  return (
    <div className="flex items-center justify-between gap-4 bg-white px-4 py-3">
      <div>
        <div className="text-sm font-medium text-neutral-800">{label}</div>
        {sub && <div className="mt-0.5 text-[11px] tabular-nums text-neutral-500">{sub}</div>}
      </div>
      <div className={`shrink-0 text-sm font-semibold tabular-nums ${valueClass}`}>{signed ? fmtSignedIDR(value) : fmtIDR(value)}</div>
    </div>
  )
}

function DetailEmpty({ text }) {
  return (
    <div className="rounded-lg border border-dashed border-neutral-200 bg-neutral-50 px-4 py-6 text-center text-xs text-neutral-400">
      {text}
    </div>
  )
}

function SetoranSummaryRow({ label, sub, value, tone }) {
  const toneCls = tone === "sky"
    ? "bg-sky-50 text-sky-600 ring-sky-100"
    : "bg-emerald-50 text-emerald-600 ring-emerald-100"
  return (
    <div className="flex items-center justify-between gap-4 bg-white px-4 py-3">
      <div className="flex items-center gap-2.5">
        <div className={`flex h-7 w-7 items-center justify-center rounded-md ring-1 ${toneCls}`}>
          <span className="text-[11px] font-bold">{label.charAt(0)}</span>
        </div>
        <div>
          <div className="text-sm font-medium text-neutral-800">{label}</div>
          {sub && <div className="mt-0.5 text-[11px] text-neutral-500">{sub}</div>}
        </div>
      </div>
      <span className="shrink-0 text-base font-semibold tabular-nums text-neutral-900">{fmtIDR(value)}</span>
    </div>
  )
}

function SelisihSetoranRow({ selisih, totalPenjualan, totalSetoran }) {
  const isSesuai = selisih === 0
  const isKurang = selisih < 0
  const tone = isSesuai
    ? {
        box: "bg-emerald-50 ring-1 ring-emerald-200",
        icon: "bg-emerald-100 text-emerald-600",
        title: "text-emerald-900",
        text: "text-emerald-700/80",
        value: "text-emerald-700",
        label: "Setoran Sesuai",
      }
    : isKurang
      ? {
          box: "bg-rose-50 ring-1 ring-rose-200",
          icon: "bg-rose-100 text-rose-600",
          title: "text-rose-900",
          text: "text-rose-700/80",
          value: "text-rose-700",
          label: "Setoran Kurang",
        }
      : {
          box: "bg-amber-50 ring-1 ring-amber-200",
          icon: "bg-amber-100 text-amber-600",
          title: "text-amber-900",
          text: "text-amber-700/80",
          value: "text-amber-700",
          label: "Setoran Lebih",
        }

  return (
    <div className={`mt-4 flex items-center justify-between gap-4 rounded-xl p-4 ${tone.box}`}>
      <div className="flex items-center gap-3">
        <div className={`flex h-9 w-9 items-center justify-center rounded-full ${tone.icon}`}>
          <AlertCircle className="h-4 w-4" strokeWidth={2.25} />
        </div>
        <div>
          <div className={`text-sm font-bold ${tone.title}`}>{tone.label}</div>
          <div className={`mt-0.5 text-[11px] tabular-nums ${tone.text}`}>
            Setoran {fmtIDR(totalSetoran)} - Penjualan {fmtIDR(totalPenjualan)}
          </div>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className={`text-[10px] font-semibold uppercase tracking-wide ${tone.value}`}>Selisih (B - A)</div>
        <div className={`text-xl font-bold tabular-nums tracking-tight ${tone.value}`}>{fmtSignedIDR(selisih)}</div>
      </div>
    </div>
  )
}

function TukarItems({ items = [], empty }) {
  if (!items.length) return <div className="text-xs italic text-neutral-400">{empty}</div>
  return (
    <div className="space-y-1.5">
      {items.map((it, i) => (
        <div key={it.id || i} className="flex items-center justify-between gap-3 text-sm">
          <div className="min-w-0">
            <div className="truncate text-neutral-800">{it.rokok}</div>
            <div className="text-[11px] tabular-nums text-neutral-500">{it.qty} x {fmtIDR(it.harga_satuan)}</div>
          </div>
          <span className="shrink-0 font-semibold tabular-nums text-neutral-900">{fmtIDR(Number(it.qty || 0) * Number(it.harga_satuan || 0))}</span>
        </div>
      ))}
    </div>
  )
}

function SetoranCard({ label, value, tone }) {
  const toneCls = tone === "sky"
    ? "bg-sky-50 text-sky-600 ring-sky-100"
    : "bg-emerald-50 text-emerald-600 ring-emerald-100"
  return (
    <div className="rounded-lg bg-white p-3 ring-1 ring-neutral-200">
      <div className="mb-1 flex items-center gap-1.5">
        <div className={`flex h-6 w-6 items-center justify-center rounded-md ring-1 ${toneCls}`}>
          <span className="text-[11px] font-bold">{label.charAt(0)}</span>
        </div>
        <span className="text-xs text-neutral-500">{label}</span>
      </div>
      <div className="text-xl font-semibold tabular-nums tracking-tight text-neutral-900">{fmtIDR(value)}</div>
    </div>
  )
}

// Form Sesi Pagi
function SesiPagiForm({ initial, rokokList, salesList, sesiList, stockCutoffDate, onSubmit, onCancel }) {
  const today = getJakartaToday()
  const [tanggal,  setTanggal]  = useState(initial?.tanggal || today)
  const [salesId,  setSalesId]  = useState(initial?.sales_id || "")
  const [catatan,  setCatatan]  = useState(initial?.catatan || "")
  const [items, setItems] = useState(() => {
    const aktif = rokokList.filter((r) => r.aktif !== false)
    return aktif.map((r) => {
      const existing    = initial?.barangKeluar?.find((it) => it.rokok_id === r.id)
      const existingQty = existing ? existing.qty : 0
      return {
        rokok_id:          r.id,
        nama:              r.nama,
        stok:              (r.stok ?? 0) + existingQty,
        qty:               existing?.qty || "",
      }
    })
  })
  const [error, setError] = useState("")

  const updateQty        = (idx, val) => setItems(items.map((it, i) => i === idx ? { ...it, qty: val } : it))

  const is_historical_computed = stockCutoffDate ? tanggal < stockCutoffDate : false

  const validItems = items.filter((it) => Number(it.qty) > 0)
  const hasStokError       = !is_historical_computed && validItems.some((it) => Number(it.qty) > it.stok)
  const valid = tanggal && salesId && validItems.length >= 1 && !hasStokError

  const [loading, setLoading] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    if (!valid || loading) return
    setLoading(true)
    try {
      setError("")
      await onSubmit({ tanggal, sales_id: salesId, catatan, barangKeluar: validItems.map((it) => ({ rokok_id: it.rokok_id, qty: Number(it.qty) })), samples: [] })
    } catch (err) {
      if (err.message?.includes("Unique constraint failed")) {
        setError(`Sales ini sudah punya sesi pada tanggal ${tanggal}. Edit sesi yang ada atau pilih tanggal/sales lain.`)
      } else {
        setError(err.message || "Terjadi kesalahan")
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {is_historical_computed && (
          <div className="col-span-full">
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 flex items-start gap-3 text-amber-800 text-sm">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div>
                <p className="font-semibold">Mode Data Lama (Historical)</p>
                <p className="text-amber-700/90 text-xs mt-0.5">Sesi pada tanggal ini tidak akan memotong stok gudang dan tidak divalidasi ketersediaan stok.</p>
              </div>
            </div>
          </div>
        )}
        <Field label="Tanggal">
          <input
            type="date"
            value={tanggal}
            max={today}
            onChange={(e) => {
              setTanggal(e.target.value)
              setSalesId("")
            }}
            className={inputCls}
            required
          />
        </Field>
        <Field label="Sales">
          <SearchableSelect
            value={salesId}
            onChange={(e) => setSalesId(e.target.value)}
            placeholder="Pilih sales"
            options={[{ value: "", label: "Pilih sales" }, ...salesList.filter((s) => {
                if (s.aktif === false) return false
                if (initial?.sales_id && String(initial.sales_id) === String(s.id)) return true
                return !sesiList.some((sesi) => String(sesi.sales_id) === String(s.id) && sesi.tanggal === tanggal)
              }).map((s) => ({ value: s.id, label: s.nama }))]}
          />
        </Field>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Barang Dibawa</p>
        <p className="text-xs text-neutral-400">
          {salesId ? "Isi qty untuk rokok yang dibawa, kosongkan jika tidak dibawa." : "Silakan pilih sales terlebih dahulu untuk mengisi data barang dibawa."}
        </p>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-neutral-200 text-[10px] uppercase tracking-wider text-neutral-400">
              <th className="pb-2 text-left font-semibold">Produk</th>
              {!is_historical_computed && <th className="pb-2 text-center px-2 font-semibold">Stok Rokok</th>}
              <th className="pb-2 text-center px-2 font-semibold">Qty Bawa</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {items.map((item, idx) => {
              const qty        = Number(item.qty)
              const sisaStok   = item.stok - (qty > 0 ? qty : 0)
              const melebihi   = !is_historical_computed && qty > 0 && qty > item.stok
              
              return (
                <Fragment key={item.rokok_id}>
                  <tr className="hover:bg-neutral-50/50 transition-colors">
                    <td className="py-2.5 font-medium text-neutral-900">{item.nama}</td>
                    {!is_historical_computed && (
                      <td className={`py-2.5 text-center px-2 text-xs tabular-nums font-medium ${melebihi ? "text-red-500" : qty > 0 ? "text-blue-600" : "text-neutral-400"}`}>
                        {qty > 0 ? sisaStok : item.stok}
                      </td>
                    )}
                    <td className="py-2.5 text-center px-2">
                      <div className="flex justify-center">
                        <input
                          type="number" min="0"
                          value={item.qty}
                          onChange={(e) => updateQty(idx, e.target.value)}
                          placeholder="—"
                          disabled={!salesId}
                          style={{ width: '120px' }}
                          className={inputCls + " text-center px-3 py-1.5 font-semibold text-sm" + (melebihi ? " border-red-400 focus:ring-red-500" : "") + (!salesId ? " opacity-40 cursor-not-allowed bg-neutral-50" : "")}
                        />
                      </div>
                    </td>
                  </tr>
                  {melebihi && (
                    <tr>
                      <td colSpan={3} className="pb-2 pt-0">
                        <div className="flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] text-red-700">
                          <AlertCircle className="h-3 w-3 shrink-0" />
                          Stok Utama habis (tersedia {item.stok}).
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      <Field label="Catatan (opsional)">
        <input type="text" value={catatan} onChange={(e) => setCatatan(e.target.value)} className={inputCls} placeholder="Opsional" />
      </Field>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <FormActions onCancel={onCancel} disabled={!valid} loading={loading} submitLabel={initial ? "Simpan Perubahan" : "Buat Sesi"} />
    </form>
  )
}

// ─── Form Laporan Sore ────────────────────────────────────────────────────────

function LaporanSoreForm({ sesi, rokokList, tokoList: tokoListProp, tukarBarangAktif = [], isEdit = false, onSessionChange, onSubmit, onCancel }) {
  const { confirmWithReason, ConfirmWithReasonModal: LaporanConfirmModal } = useConfirmWithReason()
  const [step, setStep] = useState(1)
  const [activeTab, setActiveTab] = useState("penjualan")
  const [tokoList, setTokoList]   = useState(tokoListProp ?? [])

  // ─── Tukar Barang ──────────────────────────────────────────────────────
  // tukarBarangAktif sudah di-filter untuk sales ini sebelum form dibuka
  const tukarAktifSales = tukarBarangAktif
  // Form input tukar baru di sesi ini
  const emptyItems = () => [{ rokok_id: "", qty: "", harga_satuan: "" }]
  const mapItems   = (items, kategori = "grosir") => items.length > 0
    ? items.map(it => {
        const rokok = rokokList.find(r => r.id === it.rokok_id)
        const harga = rokok
          ? (kategori === "grosir" ? (rokok.harga_grosir || rokok.harga_toko) : (rokok.harga_toko || rokok.harga_perorangan))
          : it.harga_satuan
        return { rokok_id: it.rokok_id, qty: String(it.qty), harga_satuan: String(harga) }
      })
    : emptyItems()

  // Aggregate items with same rokok_id (sum qty) when pre-filling from multiple DB records
  const aggregateItems = (items) => {
    const map = {}
    for (const it of items) {
      if (!it.rokok_id) continue
      if (!map[it.rokok_id]) map[it.rokok_id] = { ...it, qty: 0 }
      map[it.rokok_id] = { ...map[it.rokok_id], qty: map[it.rokok_id].qty + Number(it.qty) }
    }
    return Object.values(map)
  }

  // Pre-fill dari data existing saat edit — split by kategori (now stored in DB)
  const existingSelesai = isEdit ? (sesi.tukarBarang || []).filter(t => t.status === "selesai") : []
  const existingBelum   = isEdit ? (sesi.tukarBarang || []).filter(t => t.status === "aktif")   : []
  // Retur-only dari tab tukar (tidak punya TukarBarang record, hanya Retur record)
  const existingReturItems = isEdit && existingSelesai.length === 0
    ? (sesi.returDiSesi || []).flatMap(r => r.items || [])
    : []

  const defaultKategori = existingSelesai[0]?.kategori || sesi.sales_kategori || "grosir"
  const existingReturAlasan = isEdit && existingReturItems.length > 0
    ? (sesi.returDiSesi || [])[0]?.alasan || null
    : null
  const [tukarSelesai, setTukarSelesai] = useState({
    kategori: defaultKategori,
    catatan: existingSelesai[0]?.catatan || existingReturAlasan || "",
    itemsMasuk:  existingSelesai.length > 0
      ? mapItems(aggregateItems(existingSelesai.flatMap(t => t.itemsMasuk  || [])), defaultKategori)
      : mapItems(aggregateItems(existingReturItems), defaultKategori),
    itemsKeluar: mapItems(aggregateItems(existingSelesai.flatMap(t => t.itemsKeluar || [])), defaultKategori),
  })

  // Set ID tukar yang dicentang untuk diselesaikan di sesi ini
  const initialPenyelesaian = isEdit
    ? new Set((sesi.tukarBarangSelesaiDiSesi || []).filter((t) => t.tanggal !== sesi.tanggal).map((t) => t.id))
    : new Set()
  const [penyelesaianTukar, setPenyelesaianTukar] = useState(initialPenyelesaian)

  const [penjualan,    setPenjualan]    = useState(
    isEdit && sesi.penjualan?.length
      ? buildPenjualanFromExisting(sesi.barangKeluar, sesi.penjualan)
      : buildDefaultPenjualan(sesi.barangKeluar)
  )
  const [setoran,      setSetoran]      = useState(
    isEdit && sesi.setoran?.length
      ? sesi.setoran.map((s) => ({ metode: s.metode, jumlah: String(s.jumlah) }))
      : [{ metode: "cash", jumlah: "" }]
  )
  const [konsinyasiBaru, setKonsinyasiBaru] = useState(() => {
    const active = (sesi.konsinyasi || []).filter(k => k.status === "aktif")
    if (active.length > 0) {
      return active.map(k => ({
        toko_id: k.toko_id,
        kategori: k.kategori,
        tanggal_jatuh_tempo: k.tanggal_jatuh_tempo,
        catatan: k.catatan || "",
        items: k.items.map(it => ({ rokok_id: it.rokok_id, qty: String(it.qty_keluar) }))
      }))
    }
    return [{ toko_id: "", kategori: sesi.sales_kategori || "toko", tanggal_jatuh_tempo: "", catatan: "", items: [{ rokok_id: "", qty: "" }] }]
  })

  const [sampleKembali, setSampleKembali] = useState([])

  const [loading, setLoading] = useState(false)
  const [showPerorangan,    setShowPerorangan]    = useState(false)
  const [setoranAuto,       setSetoranAuto]       = useState(false)

  const nilaiPenjualanLangsung = penjualan.reduce((s, it) => {
    const r = rokokList.find((r) => r.id === it.rokok_id)
    if (!r || !it.qty) return s
    return s + Number(it.qty) * r[`harga_${it.kategori}`]
  }, 0)

  const totalTitipJual = konsinyasiBaru.reduce((acc, k) => {
    return acc + k.items.reduce((sum, it) => {
      if (!it.rokok_id || !(Number(it.qty) > 0)) return sum
      const r = rokokList.find(x => x.id === it.rokok_id)
      const harga = r ? r[`harga_${k.kategori || "toko"}`] : 0
      return sum + (Number(it.qty) * harga)
    }, 0)
  }, 0)

  const totalTukarMasuk = tukarSelesai.itemsMasuk.reduce((sum, it) => sum + (Number(it.qty) * Number(it.harga_satuan || 0)), 0)
  const totalTukarKeluar = tukarSelesai.itemsKeluar.reduce((sum, it) => sum + (Number(it.qty) * Number(it.harga_satuan || 0)), 0)
  // Return-only mode: hanya barang masuk tanpa pengganti -> tidak ada selisih uang (akan disimpan sbg Retur biasa)
  const selisihTukar  = totalTukarKeluar - totalTukarMasuk

  const nilaiPenjualan = nilaiPenjualanLangsung + selisihTukar
  const totalSetoran = setoran.reduce((s, it) => s + (Number(it.jumlah) || 0), 0)
  const flagSetoran  = nilaiPenjualan > 0 && totalSetoran !== nilaiPenjualan
  const setoranEmpty = nilaiPenjualan > 0 && totalSetoran === 0

  // Auto-update setoran ketika nilai penjualan berubah jika setoranAuto diaktifkan
  useEffect(() => {
    if (setoranAuto) {
      if (nilaiPenjualan > 0) {
        setSetoran((prev) => [{ metode: prev[0]?.metode || "cash", jumlah: String(nilaiPenjualan) }])
      } else {
        setSetoran([{ metode: "cash", jumlah: "" }])
        setSetoranAuto(false)
      }
    }
  }, [nilaiPenjualan, setoranAuto])

  const [submitError, setSubmitError] = useState("")
  const preventFormSubmit = (e) => {
    e.preventDefault()
  }
  const goToSummary = (e) => {
    e?.preventDefault?.()
    e?.stopPropagation?.()
    setStep(2)
  }
  const submitFinal = async (e) => {
    e?.preventDefault?.()
    e?.stopPropagation?.()
    if (step !== 2) {
      setStep(2)
      return
    }
    if (setoranEmpty || loading) return
    setSubmitError("")
    try {
      const validPenjualan  = penjualan.filter((it) => it.rokok_id && Number(it.qty) > 0)
      const validSetoran    = setoran.filter((it) => Number(it.jumlah) > 0)
      // Titip jual yang setengah isi (toko dipilih tapi data lain kurang) — lempar error, jangan diskip diam-diam
      const konsinyasiSetengahIsi = konsinyasiBaru.filter((k) => {
        if (!k.toko_id) return false // kosong semua = boleh diskip
        const hasRokok = k.items.some((it) => it.rokok_id && Number(it.qty) > 0)
        return !k.tanggal_jatuh_tempo || !hasRokok
      })
      if (konsinyasiSetengahIsi.length > 0) {
        const nama = konsinyasiSetengahIsi.map((k) => tokoList.find((t) => t.id === k.toko_id)?.nama || "Toko").join(", ")
        throw new Error(`Titip Jual untuk ${nama}: lengkapi jatuh tempo dan pilih rokok sebelum menyimpan.`)
      }
      const validKonsinyasi = konsinyasiBaru.filter((k) => k.toko_id && k.kategori && k.tanggal_jatuh_tempo && k.items.some((it) => it.rokok_id && Number(it.qty) > 0))
      const validTukarBaru = []

      const inItems  = tukarSelesai.itemsMasuk.filter(i => i.rokok_id && Number(i.qty) > 0)
      const outItems = tukarSelesai.itemsKeluar.filter(i => i.rokok_id && Number(i.qty) > 0)
      let returFromTukar = null
      if (inItems.length > 0 && outItems.length > 0) {
        validTukarBaru.push({ ...tukarSelesai, langsungSelesai: true })
      } else if (inItems.length > 0 && outItems.length === 0) {
        returFromTukar = {
          tipe_penjualan: tukarSelesai.kategori || "grosir",
          alasan:         tukarSelesai.catatan || null,
          items:          inItems.map((it) => ({ rokok_id: it.rokok_id, qty: Number(it.qty) || 0 })),
        }
      } else if (inItems.length === 0 && outItems.length > 0) {
        throw new Error(`Tukar Barang: Barang pengganti tidak bisa diisi tanpa barang return.`)
      }



      const barangKembaliAuto = {}
      for (const keluar of sesi.barangKeluar) {
        barangKembaliAuto[keluar.rokok_id] = keluar.qty
      }
      for (const pj of validPenjualan) {
        barangKembaliAuto[pj.rokok_id] = (barangKembaliAuto[pj.rokok_id] || 0) - pj.qty
      }
      for (const k of validKonsinyasi) {
        for (const it of k.items.filter((i) => i.rokok_id && Number(i.qty) > 0)) {
          barangKembaliAuto[it.rokok_id] = (barangKembaliAuto[it.rokok_id] || 0) - Number(it.qty)
        }
      }

      // Tukar yang langsung selesai hari ini: A diserahkan ke toko, kurangi dari barangKembali
      for (const t of validTukarBaru) {
        if (t.langsungSelesai) {
          for (const it of t.itemsKeluar.filter((i) => i.rokok_id && Number(i.qty) > 0)) {
            barangKembaliAuto[it.rokok_id] = (barangKembaliAuto[it.rokok_id] || 0) - Number(it.qty)
          }
        }
      }
      // Tukar aktif yang diselesaikan di sesi ini: A diserahkan, kurangi dari barangKembali
      for (const t of tukarAktifSales) {
        if (penyelesaianTukar.has(t.id)) {
          for (const it of t.itemsKeluar) {
            barangKembaliAuto[it.rokok_id] = (barangKembaliAuto[it.rokok_id] || 0) - it.qty
          }
        }
      }
      const validKembali = Object.entries(barangKembaliAuto)
        .filter(([_, qty]) => qty > 0)
        .map(([rokok_id, qty]) => ({ rokok_id, qty }))

      const payload = {
        penjualan:      validPenjualan.map((it) => ({ 
          rokok_id: it.rokok_id, 
          kategori: it.kategori, 
          qty: Number(it.qty) || 0 
        })),
        setoran:        validSetoran.map((it) => ({ 
          metode: it.metode, 
          jumlah: Number(it.jumlah) || 0 
        })),
        barangKembali:  validKembali.map(it => ({
          rokok_id: it.rokok_id,
          qty: Number(it.qty) || 0
        })),
        konsinyasiBaru: validKonsinyasi.map(k => ({
          ...k,
          items: k.items.map(it => ({
            rokok_id: it.rokok_id,
            qty: Number(it.qty) || 0
          }))
        })),
        tukarBaru: validTukarBaru.map((t) => ({
          kategori:    t.kategori || "grosir",
          itemsMasuk:  t.itemsMasuk.filter((it) => it.rokok_id && Number(it.qty) > 0)
            .map((it) => ({ 
              rokok_id: it.rokok_id, 
              qty: Number(it.qty) || 0, 
              harga_satuan: Number(it.harga_satuan) || 0 
            })),
          itemsKeluar: (t.itemsKeluar || []).filter((it) => it.rokok_id && Number(it.qty) > 0)
            .map((it) => ({ 
              rokok_id: it.rokok_id, 
              qty: Number(it.qty) || 0, 
              harga_satuan: Number(it.harga_satuan) || 0 
            })),
          catatan: t.catatan || null,
          langsungSelesai: !!t.langsungSelesai,
        })),
        penyelesaianTukar: Array.from(penyelesaianTukar),
        returFromTukar,
        sampleKembali: sampleKembali
          .filter((sm) => Number(sm.qty_kembali) >= 0)
          .map((sm) => ({ rokok_id: sm.rokok_id, type: sm.type, qty_kembali: Number(sm.qty_kembali) || 0 })),
      }

      // Final validation to prevent NaN in production
      const hasNaN = (obj) => {
        for (const key in obj) {
          if (typeof obj[key] === 'number' && isNaN(obj[key])) return true;
          if (obj[key] && typeof obj[key] === 'object') {
            if (hasNaN(obj[key])) return true;
          }
        }
        return false;
      }

      if (hasNaN(payload)) {
        throw new Error("Terdapat input angka yang tidak valid (NaN). Silakan cek kembali data Anda.")
      }

      if (isEdit) {
        const alasan = await confirmWithReason("Simpan perubahan laporan sore?", { title: "Konfirmasi Edit", confirmLabel: "Ya, Simpan" })
        if (!alasan) { setLoading(false); return }
        setLoading(true)
        await onSubmit(payload, alasan)
      } else {
        setLoading(true)
        await onSubmit(payload)
      }
    } catch (err) {
      setSubmitError(err?.message || "Terjadi kesalahan saat menyimpan laporan sore.")
    } finally {
      setLoading(false)
    }
  }



  const handleHapusKonsinyasi = async (k) => {
    const alasan = await confirmWithReason(`Hapus titip jual "${k.nama_toko}"? Stok akan dikembalikan.`, { title: "Hapus Titip Jual", variant: "danger", confirmLabel: "Ya, Hapus" })
    if (!alasan) return
    await deleteTitipJual(k.id, alasan)
    setNewlyCreatedKonsinyasi((prev) => {
      const next = prev.filter((x) => x.id !== k.id)
      onSessionChange?.({
        ...sesi,
        konsinyasi: [
          ...(sesi.konsinyasi || []).filter((x) => x.id !== k.id),
          ...next,
        ],
      })
      return next
    })
  }

  const activeKonsinyasi = konsinyasiBaru.filter(k => k.toko_id && k.items.some(it => it.rokok_id && Number(it.qty) > 0))

  // Qty tersedia per rokok untuk konsinyasi: dibawa - penjualan langsung
  const qtyDibawa = useMemo(
    () => Object.fromEntries(sesi.barangKeluar.map((it) => [it.rokok_id, it.qty])),
    [sesi.barangKeluar]
  )
  const qtyTerjualLangsung = useMemo(() => {
    const map = {}
    for (const it of penjualan) {
      if (it.rokok_id && Number(it.qty) > 0) {
        map[it.rokok_id] = (map[it.rokok_id] || 0) + Number(it.qty)
      }
    }
    return map
  }, [penjualan])



  const savedTokoIds = useMemo(() => 
    konsinyasiBaru.map(k => k.toko_id).filter(Boolean),
    [konsinyasiBaru]
  )

  const qtyTitipBaru = useMemo(() => {
    const map = {}
    for (const k of konsinyasiBaru) {
      for (const it of k.items) {
        if (it.rokok_id && Number(it.qty) > 0) {
          map[it.rokok_id] = (map[it.rokok_id] || 0) + Number(it.qty)
        }
      }
    }
    return map
  }, [konsinyasiBaru])

  // Qty tukar selesai keluar (barang pengganti dari sales) — dikurangi dari sisa semua tab
  const qtyTukarSelesaiKeluar = useMemo(() => {
    const map = {}
    for (const it of (tukarSelesai.itemsKeluar || [])) {
      if (it.rokok_id && Number(it.qty) > 0)
        map[it.rokok_id] = (map[it.rokok_id] || 0) + Number(it.qty)
    }
    return map
  }, [tukarSelesai])

  // Rokok yang dibawa sales hari ini (sudah terfilter)
  const rokokDibawa = useMemo(
    () => rokokList.filter((r) => sesi.barangKeluar.some((bk) => bk.rokok_id === r.id)),
    [rokokList, sesi.barangKeluar]
  )

  const hasSample = sampleKembali.length > 0
  const SUBTABS = ["penjualan", "konsinyasi", "tukar", ...(hasSample ? ["sample"] : [])]
  const subIdx = SUBTABS.indexOf(activeTab)
  const isFirstSub = subIdx === 0
  const isLastSub = subIdx === SUBTABS.length - 1
  const goPrevSub = () => setActiveTab(SUBTABS[subIdx - 1])
  const goNextSub = () => setActiveTab(SUBTABS[subIdx + 1])

  return (
    <form onSubmit={preventFormSubmit} className="-mx-6 -mb-6 flex flex-col" style={{ maxHeight: 'calc(100vh - 8rem)' }}>
      {/* ── Stepper Header ── */}
      <div className="flex items-center gap-2 border-b border-neutral-200 bg-white px-6 py-3 shrink-0">
        {[
          { n: 1, label: "Isi Data Laporan" },
          { n: 2, label: "Ringkasan & Submit" },
        ].map((it, i) => {
          const state = step === it.n ? "active" : step > it.n ? "done" : "pending"
          return (
            <div key={it.n} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setStep(it.n)}
                className="flex items-center gap-2"
              >
                <span className={[
                    "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold",
                    state === "active" && "bg-blue-700 text-white",
                    state === "done" && "bg-green-600 text-white",
                    state === "pending" && "bg-neutral-200 text-neutral-500",
                  ].filter(Boolean).join(" ")}
                >
                  {state === "done" ? "✓" : it.n}
                </span>
                <span className={[
                    "text-xs font-medium",
                    state === "active" && "font-semibold text-neutral-900",
                    state === "done" && "text-neutral-900",
                    state === "pending" && "text-neutral-500",
                  ].filter(Boolean).join(" ")}
                >
                  {it.label}
                </span>
              </button>
              {i < 1 && <span className="mx-2 text-neutral-300">→</span>}
            </div>
          )
        })}
      </div>

      {/* ── Tabs Navigasi (Fixed di bawah Stepper) ── */}
      {step === 1 && (
        <div className="bg-white border-b border-neutral-200 px-6 shrink-0">
          <div className="flex max-w-4xl mx-auto">
            <TabButton active={activeTab === "penjualan"} onClick={() => setActiveTab("penjualan")}>
              Penjualan Langsung
            </TabButton>
            <TabButton active={activeTab === "konsinyasi"} onClick={() => setActiveTab("konsinyasi")}>
              Titip Jual {activeKonsinyasi.length > 0 && <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-yellow-500 text-xs text-white">{activeKonsinyasi.length}</span>}
            </TabButton>
            <TabButton active={activeTab === "tukar"} onClick={() => setActiveTab("tukar")}>
              Tukar Barang {(() => {
                const n = tukarSelesai.itemsMasuk.some(i => i.rokok_id && Number(i.qty) > 0) ? 1 : 0
                return n > 0 && <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-xs text-white">{n}</span>
              })()}
            </TabButton>
            {hasSample && (
              <TabButton active={activeTab === "sample"} onClick={() => setActiveTab("sample")}>
                Sample Kembali
                <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-orange-500 text-xs text-white">{sampleKembali.length}</span>
              </TabButton>
            )}
          </div>
        </div>
      )}

      {/* ── Content Area ── */}
      <div className="overflow-y-auto flex-1 p-6 pb-10 bg-neutral-50/50">
        {step === 1 && (
          <div className="space-y-6 max-w-4xl mx-auto">
              {activeTab === "penjualan" && (
                <SectionCard 
                  title="Penjualan Langsung"
                  rightAction={
                    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-neutral-600 select-none">
                      <input
                        type="checkbox"
                        checked={showPerorangan}
                        onChange={(e) => setShowPerorangan(e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-neutral-300 text-blue-600 focus:ring-blue-500"
                      />
                      Tampilkan Perorangan
                    </label>
                  }
                >
                  <PenjualanLangsungInput
                    penjualan={penjualan}
                    setPenjualan={setPenjualan}
                    barangKeluar={sesi.barangKeluar}
                    qtyTitipBaru={qtyTitipBaru}
                    qtyTukarKeluar={qtyTukarSelesaiKeluar}
                    showPerorangan={showPerorangan}
                    setShowPerorangan={setShowPerorangan}
                    isHistorical={sesi.is_historical}
                  />
                </SectionCard>
              )}

              {activeTab === "konsinyasi" && (
                <SectionCard title="Titip Jual Baru (Opsional)" className="space-y-2">
                  {konsinyasiBaru.map((k, idx) => (
                    <KonsinyasiBaruInput
                      key={idx}
                      data={k}
                      currentIdx={idx}
                      rokokDibawa={rokokDibawa}
                      qtyDibawa={qtyDibawa}
                      qtyTerjualLangsung={qtyTerjualLangsung}
                      qtyTukarKeluar={qtyTukarSelesaiKeluar}
                      konsinyasiBaru={konsinyasiBaru}
                      tokoList={tokoList}
                      tanggalSesi={sesi.tanggal}
                      onChange={(updated) => setKonsinyasiBaru(konsinyasiBaru.map((x, i) => i === idx ? updated : x))}
                      onRemove={() => setKonsinyasiBaru(konsinyasiBaru.filter((_, i) => i !== idx))}
                      isEdit={isEdit}
                      onTokoCreated={(newToko) => setTokoList((prev) => [...prev, newToko].sort((a, b) => a.nama.localeCompare(b.nama, "id")))}
                      extraUsedTokoIds={savedTokoIds}
                      isHistorical={sesi.is_historical}
                    />
                  ))}
                  <Button
                    variant="secondary"
                    className="w-full border-dashed"
                    onClick={() => setKonsinyasiBaru([...konsinyasiBaru, { toko_id: "", kategori: "toko", tanggal_jatuh_tempo: "", catatan: "", items: [{ rokok_id: "", qty: "" }] }])}
                  >
                    + Tambah Titip Jual
                  </Button>
                </SectionCard>
              )}

              {activeTab === "tukar" && (
                <TukarBarangTab
                  tukarSelesai={tukarSelesai}
                  setTukarSelesai={setTukarSelesai}
                  rokokDibawa={rokokDibawa}
                  rokokList={rokokList}
                  qtyDibawa={qtyDibawa}
                  qtyTerjualLangsung={qtyTerjualLangsung}
                  qtyTitipBaru={qtyTitipBaru}
                  isHistorical={sesi.is_historical}
                />
              )}

              {activeTab === "sample" && hasSample && (
                <SectionCard title="Sample Kembali">
                  <p className="mb-3 text-xs text-neutral-500">Isi qty sample yang kembali dari sales. Kosongkan atau isi 0 jika tidak ada yang kembali.</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-neutral-200 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                          <th className="pb-2 text-left pr-4">Rokok</th>
                          <th className="pb-2 text-center px-4">Tipe</th>
                          <th className="pb-2 text-center px-4">Keluar</th>
                          <th className="pb-2 text-center">Kembali</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sampleKembali.map((sm, idx) => {
                          const isExceeding = Number(sm.qty_kembali) > sm.qty_keluar
                          return (
                            <tr key={idx} className="border-b border-neutral-100 last:border-0">
                              <td className="py-2 pr-4 font-medium text-neutral-800">{sm.rokok}</td>
                              <td className="py-2 px-4 text-center">
                                <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${sm.type === "cukai" ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"}`}>
                                  {sm.type === "cukai" ? "Cukai" : "Biasa"}
                                </span>
                              </td>
                              <td className="py-2 px-4 text-center tabular-nums text-neutral-600">{sm.qty_keluar}</td>
                              <td className="py-2 text-center">
                                <div className="flex flex-col items-center justify-center gap-1">
                                  <input
                                    type="number"
                                    min="0"
                                    value={sm.qty_kembali}
                                    onChange={(e) => setSampleKembali((prev) =>
                                      prev.map((x, i) => i === idx ? { ...x, qty_kembali: e.target.value } : x)
                                    )}
                                    className={`w-16 rounded border px-2 py-1 text-center text-xs focus:outline-none focus:ring-1 transition-colors ${
                                      isExceeding 
                                        ? "border-red-400 bg-red-50 text-red-900 focus:border-red-500 focus:ring-red-400" 
                                        : "border-neutral-300 focus:border-orange-400 focus:ring-orange-300"
                                    }`}
                                  />
                                  {isExceeding && (
                                    <span className="text-[10px] font-medium text-red-600">Melebihi bawa</span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </SectionCard>
              )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6 max-w-4xl mx-auto">
            {/* Ringkasan Penjualan */}
            {/* Ringkasan Penjualan & Lainnya */}
            <div className="rounded-lg border border-neutral-200 bg-white p-4">
              <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                Ringkasan Penjualan
              </div>
              
              {["grosir", "toko", "perorangan"].map((cat) => {
                const items = penjualan.filter(p => p.kategori === cat && Number(p.qty) > 0)
                if (items.length === 0) return null
                
                const KATEGORI_LABEL = { grosir: "Grosir", toko: "Toko", perorangan: "Perorangan" }
                const KATEGORI_COLOR = { grosir: "text-violet-600", toko: "text-blue-600", perorangan: "text-emerald-600" }

                return (
                  <div key={cat} className="border-t border-neutral-100 py-3 first:border-t-0 first:pt-0">
                    <div className={`mb-1.5 text-[11px] font-bold tracking-wide ${KATEGORI_COLOR[cat]}`}>
                      {KATEGORI_LABEL[cat].toUpperCase()}
                    </div>
                    {items.map((it, idx) => {
                      const h = rokokList.find(r => r.id === it.rokok_id)?.[`harga_${cat}`] || 0
                      const subtotal = Number(it.qty) * h
                      return (
                        <div key={idx} className="flex justify-between border-l-2 border-neutral-100 py-1 pl-3 text-xs text-neutral-700">
                          <span>
                            {it.rokok} <span className="text-neutral-400">× {it.qty}</span>
                          </span>
                          <span className="tabular-nums text-neutral-900">{fmtIDR(subtotal)}</span>
                        </div>
                      )
                    })}
                  </div>
                )
              })}

              {/* Titip Jual */}
              {konsinyasiBaru.some(k => k.items.some(it => it.rokok_id && Number(it.qty) > 0)) && (
                <div className="border-t border-neutral-100 py-3 first:border-t-0 first:pt-0">
                  <div className="mb-1.5 text-[11px] font-bold tracking-wide text-yellow-600">TITIP JUAL BARU</div>
                  {konsinyasiBaru.map((k, kIdx) => {
                    const items = k.items.filter(it => it.rokok_id && Number(it.qty) > 0)
                    if (items.length === 0) return null
                    const t = tokoList.find(x => x.id === k.toko_id)
                    const tName = t ? t.nama : k.toko_id?.startsWith("NEW-") ? k.toko_id.substring(4) : "Toko Baru"
                    return items.map((it, idx) => {
                      const r = rokokList.find(x => x.id === it.rokok_id)
                      const harga = r ? r[`harga_${k.kategori || "toko"}`] : 0
                      const subtotal = Number(it.qty) * harga
                      return (
                        <div key={`${kIdx}-${idx}`} className="flex justify-between border-l-2 border-neutral-100 py-1 pl-3 text-xs text-neutral-700">
                          <span>
                            {tName} — {r?.nama || "Barang"} <span className="text-neutral-400">× {it.qty}</span>
                          </span>
                          <span className="tabular-nums text-neutral-900">{fmtIDR(subtotal)}</span>
                        </div>
                      )
                    })
                  })}
                </div>
              )}

              {/* Tukar Barang Masuk */}
              {tukarSelesai.itemsMasuk.some(i => i.rokok_id && Number(i.qty) > 0) && (
                <div className="border-t border-neutral-100 py-3 first:border-t-0 first:pt-0">
                  <div className="mb-1.5 text-[11px] font-bold tracking-wide text-blue-600">TUKAR BARANG (MASUK / RETURN)</div>
                  {tukarSelesai.itemsMasuk.filter(i => i.rokok_id && Number(i.qty) > 0).map((it, idx) => {
                    const subtotal = Number(it.qty) * Number(it.harga_satuan || 0)
                    return (
                      <div key={idx} className="flex justify-between border-l-2 border-neutral-100 py-1 pl-3 text-xs text-neutral-700">
                        <span>
                          {rokokList.find(r => r.id === it.rokok_id)?.nama || "Barang"} <span className="text-neutral-400">× {it.qty}</span>
                        </span>
                        <span className="tabular-nums text-neutral-900">{fmtIDR(subtotal)}</span>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Tukar Barang Keluar */}
              {tukarSelesai.itemsKeluar.some(i => i.rokok_id && Number(i.qty) > 0) && (
                <div className="border-t border-neutral-100 py-3 first:border-t-0 first:pt-0">
                  <div className="mb-1.5 text-[11px] font-bold tracking-wide text-blue-600">TUKAR BARANG (KELUAR / PENGGANTI)</div>
                  {tukarSelesai.itemsKeluar.filter(i => i.rokok_id && Number(i.qty) > 0).map((it, idx) => {
                    const subtotal = Number(it.qty) * Number(it.harga_satuan || 0)
                    return (
                      <div key={idx} className="flex justify-between border-l-2 border-neutral-100 py-1 pl-3 text-xs text-neutral-700">
                        <span>
                          {rokokList.find(r => r.id === it.rokok_id)?.nama || "Barang"} <span className="text-neutral-400">× {it.qty}</span>
                        </span>
                        <span className="tabular-nums text-neutral-900">{fmtIDR(subtotal)}</span>
                      </div>
                    )
                  })}
                </div>
              )}

              <div className="mt-3 space-y-1 border-t border-neutral-100 pt-3">
                {/* Grosir & Toko & Perorangan Totals */}
                {["grosir", "toko", "perorangan"].map((cat) => {
                  const items = penjualan.filter(p => p.kategori === cat && Number(p.qty) > 0)
                  if (items.length === 0) return null
                  const catTotal = items.reduce((sum, it) => {
                    const h = rokokList.find(r => r.id === it.rokok_id)?.[`harga_${cat}`] || 0
                    return sum + (Number(it.qty) * h)
                  }, 0)
                  const KATEGORI_LABEL = { grosir: "Grosir", toko: "Toko", perorangan: "Perorangan" }
                  return (
                    <div key={cat} className="flex items-center justify-between text-sm text-neutral-600">
                      <span>Total {KATEGORI_LABEL[cat]}</span>
                      <span className="tabular-nums">{fmtIDR(catTotal)}</span>
                    </div>
                  )
                })}

                {/* Titip Jual Total */}
                {totalTitipJual > 0 && (
                  <div className="flex items-center justify-between text-sm text-neutral-600">
                    <span>Total Titip Jual</span>
                    <span className="tabular-nums text-yellow-600">{fmtIDR(totalTitipJual)}</span>
                  </div>
                )}

                {/* Tukar Barang Total */}
                {(totalTukarMasuk > 0 || totalTukarKeluar > 0) && (
                  <div className="flex items-center justify-between text-sm text-neutral-600">
                    <span>Total Tukar Barang (Selisih)</span>
                    <span className="tabular-nums text-blue-600">{fmtIDR(selisihTukar)}</span>
                  </div>
                )}

                <div className="mt-2 flex items-center justify-between border-t border-neutral-200 pt-2.5 text-sm font-semibold">
                  <span className="text-neutral-900">Total Nilai Penjualan</span>
                  <span className="text-blue-700 tabular-nums">{fmtIDR(nilaiPenjualan)}</span>
                </div>
              </div>
            </div>

            {/* Sample Kembali Summary */}
            {hasSample && (
              <div className="rounded-lg border border-neutral-200 bg-white p-4">
                <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                  Sample Kembali
                </div>
                {sampleKembali.map((sm, idx) => (
                  <div key={idx} className="flex items-center justify-between border-b border-neutral-100 py-1.5 last:border-0 text-xs">
                    <span className="text-neutral-700">
                      {sm.rokok} <span className={`ml-1 rounded px-1 py-0.5 text-[10px] font-semibold ${sm.type === "cukai" ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"}`}>{sm.type === "cukai" ? "Cukai" : "Biasa"}</span>
                    </span>
                    <span className="tabular-nums text-neutral-600">
                      {Number(sm.qty_kembali) || 0} <span className="text-neutral-400">/ {sm.qty_keluar}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Setoran */}
            <div className="rounded-lg border border-neutral-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                  Setoran
                </span>
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-neutral-600 select-none">
                  <input
                    type="checkbox"
                    checked={setoranAuto}
                    onChange={(e) => setSetoranAuto(e.target.checked)}
                    disabled={nilaiPenjualan === 0}
                    className="h-3.5 w-3.5 rounded border-neutral-300 text-blue-600 focus:ring-blue-500"
                  />
                  Sesuai nilai penjualan
                </label>
              </div>

              {setoran.map((it, idx) => (
                <div key={idx} className="flex items-end gap-3 mt-3">
                  <div className="w-36">
                    <Field label={idx === 0 ? "Metode" : ""}>
                      <SelectInput value={it.metode} onChange={(e) => setSetoran(setoran.map((s, i) => i === idx ? { ...s, metode: e.target.value } : s))} disabled={setoranAuto}>
                        <option value="cash">Cash</option>
                        <option value="transfer">Transfer</option>
                      </SelectInput>
                    </Field>
                  </div>
                  <div className="flex-1">
                    <Field label={idx === 0 ? "Jumlah" : ""}>
                      <MoneyInput
                        value={it.jumlah}
                        onChange={(raw) => setSetoran(setoran.map((s, i) => i === idx ? { ...s, jumlah: raw } : s))}
                        placeholder="0"
                        className={inputCls + (setoranAuto ? " bg-neutral-50 opacity-70" : "")}
                        disabled={setoranAuto}
                      />
                    </Field>
                  </div>
                  {setoran.length > 1 && !setoranAuto && (
                    <div className="pb-1">
                      <IconButton icon={Trash2} onClick={() => setSetoran(setoran.filter((_, i) => i !== idx))} variant="danger" label="Hapus" />
                    </div>
                  )}
                </div>
              ))}
              
              {setoran.length < 2 && !setoranAuto && (
                <div className="mt-3">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setSetoran([...setoran, { metode: "transfer", jumlah: "" }])}
                    className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                    disabled={nilaiPenjualan === 0}
                  >
                    + Tambah metode setoran
                  </Button>
                </div>
              )}
              
              {step === 2 && setoranEmpty && (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 mt-3">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  Setoran wajib diisi jika ada penjualan
                </div>
              )}
              {step === 2 && flagSetoran && totalSetoran > 0 && (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 mt-3">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  Selisih setoran: nilai penjualan {fmtIDR(nilaiPenjualan)} vs setoran {fmtIDR(totalSetoran)}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {LaporanConfirmModal}
      
      {/* ── Footer ── */}
      <div className="sticky bottom-0 z-10 flex items-center justify-between border-t border-neutral-200 bg-white px-6 py-4 shrink-0 rounded-b-xl shadow-[0_-4px_10px_-2px_rgba(0,0,0,0.05)]">
        {step === 1 ? (
          <>
            <Button type="button" variant="secondary" onClick={onCancel}>Batal</Button>
            <div className="flex gap-2">
              {!isFirstSub && (
                <Button type="button" variant="secondary" onClick={goPrevSub}>← Sebelumnya</Button>
              )}
              {!isLastSub ? (
                <Button type="button" className="bg-blue-700 text-white hover:bg-blue-800" onClick={goNextSub}>Lanjut →</Button>
              ) : (
                <Button type="button" className="bg-blue-700 text-white hover:bg-blue-800" onClick={goToSummary}>Lanjut ke Ringkasan →</Button>
              )}
            </div>
          </>
        ) : (
          <>
            <Button type="button" variant="secondary" onClick={() => setStep(1)}>← Kembali Edit</Button>
            <div className="flex items-center gap-3">
              {submitError && (
                <div className="flex items-center gap-1 text-xs text-red-600">
                  <AlertCircle className="h-4 w-4 shrink-0" /> {submitError}
                </div>
              )}
              <Button type="button" className="bg-green-600 text-white hover:bg-green-700" disabled={setoranEmpty || loading} loading={loading} onClick={submitFinal}>
                {isEdit ? "Simpan Perubahan" : "Submit Laporan"}
              </Button>
            </div>
          </>
        )}
      </div>
    </form>
  )
}

function buildDefaultPenjualan(barangKeluar) {
  const result = []
  for (const it of barangKeluar) {
    result.push({ rokok_id: it.rokok_id, rokok: it.rokok, kategori: "grosir",  qty: "" })
    result.push({ rokok_id: it.rokok_id, rokok: it.rokok, kategori: "toko",    qty: "" })
  }
  return result
}

function buildPenjualanFromExisting(barangKeluar, penjualanLama) {
  const result = buildDefaultPenjualan(barangKeluar)
  return result.map((item) => {
    const existing = penjualanLama.find(
      (p) => p.rokok_id === item.rokok_id && p.kategori === item.kategori
    )
    return existing ? { ...item, qty: String(existing.qty) } : item
  })
}

function SectionCard({ title, children, rightAction }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{title}</p>
        {rightAction}
      </div>
      {children}
    </div>
  )
}

function PenjualanLangsungInput({ penjualan, setPenjualan, barangKeluar = [], qtyTitipBaru = {}, qtyTukarKeluar = {}, showPerorangan, setShowPerorangan, isHistorical = false }) {
  const categories = showPerorangan ? ["grosir", "toko", "perorangan"] : ["grosir", "toko"]
  const rokok_ids  = [...new Set(penjualan.map((it) => it.rokok_id))]

  const qtyDibawa = Object.fromEntries(barangKeluar.map((it) => [it.rokok_id, it.qty]))

  const updateQty = (rokok_id, kategori, val) => {
    setPenjualan(penjualan.map((it) =>
      it.rokok_id === rokok_id && it.kategori === kategori ? { ...it, qty: val } : it
    ))
  }

  const totalTerjualPerRokok = (rokok_id) =>
    penjualan
      .filter((it) => it.rokok_id === rokok_id)
      .reduce((sum, it) => sum + (Number(it.qty) || 0), 0)

  return (
    <div className="space-y-3">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-xs text-neutral-500">
            <th className="pb-2 text-left">Rokok</th>
            {categories.map((cat) => (
              <th key={cat} className="pb-2 text-left capitalize pl-2">{cat}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rokok_ids.map((rokok_id) => {
            const sample  = penjualan.find((it) => it.rokok_id === rokok_id)
            const dibawa  = qtyDibawa[rokok_id] ?? 0
            const terjual = totalTerjualPerRokok(rokok_id)
            const dititip = qtyTitipBaru[rokok_id] ?? 0
            const ditukar = qtyTukarKeluar[rokok_id] ?? 0
            const sisa    = dibawa - terjual - dititip - ditukar
            const melebihi = terjual + dititip + ditukar > dibawa
            return (
              <Fragment key={rokok_id}>
                <tr className="border-b border-neutral-100">
                  <td className="py-2 pr-3 font-medium">
                    {sample?.rokok}
                    {!isHistorical && (
                      <div className={`text-[10px] font-medium transition-colors ${melebihi ? "text-red-500" : terjual + dititip > 0 ? "text-blue-600" : "text-neutral-400"}`}>
                        Sisa: {sisa} / {dibawa}
                      </div>
                    )}
                  </td>
                  {categories.map((cat) => {
                    const entry = penjualan.find((it) => it.rokok_id === rokok_id && it.kategori === cat)
                    return (
                      <td key={cat} className="py-2 px-1">
                        <input
                          type="number"
                          min="0"
                          value={entry?.qty || ""}
                          onChange={(e) => updateQty(rokok_id, cat, e.target.value)}
                          placeholder="0"
                          className={inputCls + " w-24" + (melebihi && !isHistorical ? " border-orange-400 focus:border-orange-500" : "")}
                        />
                      </td>
                    )
                  })}
                </tr>
                {melebihi && !isHistorical && (
                  <tr>
                    <td colSpan={1 + categories.length} className="pb-1.5 pt-0">
                      <div className="flex items-center gap-1.5 rounded-md border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs text-orange-700">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        Total terjual & dititip ({terjual + dititip}) melebihi yang dibawa ({dibawa}) — selisih {terjual + dititip - dibawa} bungkus
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function KonsinyasiDetailEditForm({ record, onSubmit, onCancel }) {
  const [tanggalJatuhTempo, setTanggalJatuhTempo] = useState(record.tanggal_jatuh_tempo)
  const [catatan, setCatatan] = useState(record.catatan || "")
  const [loading, setLoading] = useState(false)
  const valid = !!tanggalJatuhTempo
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!valid) return
    setLoading(true)
    try { await onSubmit({ tanggal_jatuh_tempo: tanggalJatuhTempo, catatan }) }
    finally { setLoading(false) }
  }
  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-sm">
      <div className="grid grid-cols-2 gap-3 text-xs pb-2 border-b border-neutral-100">
        <div><p className="text-neutral-500">Toko</p><p className="font-medium">{record.nama_toko}</p></div>
        <div><p className="text-neutral-500">Kategori</p><p className="font-medium capitalize">{record.kategori}</p></div>
      </div>
      <Field label="Jatuh Tempo">
        <input type="date" value={tanggalJatuhTempo} onChange={(e) => setTanggalJatuhTempo(e.target.value)} className={inputCls} required />
      </Field>
      <Field label="Catatan (opsional)">
        <input type="text" value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="Opsional" className={inputCls} />
      </Field>
      <FormActions onCancel={onCancel} disabled={!valid || loading} loading={loading} submitLabel={initial ? "Simpan Perubahan" : "Simpan Perubahan"} />
    </form>
  )
}

function PenyelesaianDetail({ record }) {
  const nilaiTerjual = record.items?.reduce((s, it) => s + (it.qty_terjual || 0) * (it.harga || 0), 0) ?? 0
  const totalSetoran = record.setoran?.reduce((s, it) => s + it.jumlah, 0) ?? 0
  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div><p className="text-neutral-500">Toko</p><p className="font-medium">{record.nama_toko}</p></div>
        <div><p className="text-neutral-500">Kategori</p><p className="font-medium capitalize">{record.kategori}</p></div>
        <div><p className="text-neutral-500">Jatuh Tempo</p><p className="font-medium">{fmtTanggal(record.tanggal_jatuh_tempo)}</p></div>
        <div><p className="text-neutral-500">Status</p><p className={`font-medium capitalize ${record.status === "selesai" ? "text-green-600" : "text-yellow-600"}`}>{record.status}</p></div>
        {record.tanggal_selesai && <div><p className="text-neutral-500">Tgl Selesai</p><p className="font-medium text-green-700">{fmtTanggal(record.tanggal_selesai)}</p></div>}
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">Barang</p>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-neutral-200 text-neutral-500">
              <th className="pb-1.5 text-left">Rokok</th>
              <th className="pb-1.5 text-right">Keluar</th>
              {record.status === "selesai" && <><th className="pb-1.5 text-right">Terjual</th><th className="pb-1.5 text-right">Kembali</th><th className="pb-1.5 text-right">Nilai</th></>}
            </tr>
          </thead>
          <tbody>
            {record.items?.map((it, i) => (
              <tr key={i} className="border-b border-neutral-100">
                <td className="py-1.5">{it.rokok}</td>
                <td className="py-1.5 text-right tabular-nums">{it.qty_keluar}</td>
                {record.status === "selesai" && (
                  <>
                    <td className="py-1.5 text-right tabular-nums">{it.qty_terjual}</td>
                    <td className="py-1.5 text-right tabular-nums">{it.qty_kembali}</td>
                    <td className="py-1.5 text-right tabular-nums">{fmtIDR((it.qty_terjual || 0) * (it.harga || 0))}</td>
                  </>
                )}
              </tr>
            ))}
            {record.status === "selesai" && (
              <tr className="border-t-2 border-neutral-200 font-semibold">
                <td colSpan={4} className="py-1.5">Total Nilai Terjual</td>
                <td className="py-1.5 text-right tabular-nums">{fmtIDR(nilaiTerjual)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {record.setoran?.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">Setoran</p>
          <div className="space-y-1">
            {record.setoran.map((it, i) => (
              <div key={i} className="flex justify-between text-xs">
                <span className="capitalize font-medium">{it.metode}{it.tanggal ? ` — ${fmtTanggal(it.tanggal)}` : ""}</span>
                <span className="tabular-nums">{fmtIDR(it.jumlah)}</span>
              </div>
            ))}
            <div className="flex justify-between text-xs font-semibold border-t border-neutral-200 pt-1">
              <span>Total Setoran</span>
              <span className="tabular-nums">{fmtIDR(totalSetoran)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function KonsinyasiBaruInput({ data, currentIdx, rokokDibawa, qtyDibawa, qtyTerjualLangsung, qtyTukarKeluar = {}, konsinyasiBaru, tokoList, tanggalSesi, onChange, onRemove, onTokoCreated, extraUsedTokoIds = [], isEdit = false, isHistorical = false }) {
  const [open,           setOpen]          = useState(!(isEdit && data.toko_id))
  const [showAddToko,    setShowAddToko]    = useState(false)
  const [newTokoNama,    setNewTokoNama]    = useState("")
  const [newTokoAlamat,  setNewTokoAlamat]  = useState("")
  const [newTokoKategori,setNewTokoKategori]= useState("toko")
  const [savingToko,     setSavingToko]     = useState(false)
  const [tokoQuery,      setTokoQuery]      = useState("")

  useEffect(() => {
    const t = setTimeout(() => setTokoQuery(newTokoNama.trim()), 300)
    return () => clearTimeout(t)
  }, [newTokoNama])

  const selectedToko  = tokoList.find((t) => t.id === data.toko_id)
  const usedTokoIds   = [...konsinyasiBaru.filter((_, i) => i !== currentIdx).map((k) => k.toko_id).filter(Boolean), ...extraUsedTokoIds]

  const hasTokoSelected  = !!data.toko_id
  const missingJatuhTempo = hasTokoSelected && !data.tanggal_jatuh_tempo
  const missingRokok     = hasTokoSelected && !data.items.some((it) => it.rokok_id && Number(it.qty) > 0)


  // Qty tersedia per rokok: dibawa - terjual langsung - item di konsinyasi lain (bukan ini)
  const getAvailableQty = (rokok_id, excludeItemIdx = -1) => {
    const dibawa  = qtyDibawa[rokok_id] || 0
    const terjual = qtyTerjualLangsung[rokok_id] || 0
    const ditukar = qtyTukarKeluar[rokok_id] || 0

    // Qty dari konsinyasi baru lainnya (accordion lain)
    const otherAccordions = konsinyasiBaru
      .filter((_, i) => i !== currentIdx)
      .flatMap((k) => k.items)
      .filter((it) => it.rokok_id === rokok_id)
      .reduce((s, it) => s + (Number(it.qty) || 0), 0)

    // Qty dari item lain dalam accordion yang sama
    const currentAccordionOthers = data.items
      .filter((_, i) => i !== excludeItemIdx)
      .filter((it) => it.rokok_id === rokok_id)
      .reduce((s, it) => s + (Number(it.qty) || 0), 0)

    return Math.max(0, dibawa - terjual - ditukar - otherAccordions - currentAccordionOthers)
  }

  const updateItem = (idx, field, val) =>
    onChange({ ...data, items: data.items.map((it, i) => i === idx ? { ...it, [field]: val } : it) })

  const handleSaveToko = async () => {
    if (!newTokoNama.trim()) return
    setSavingToko(true)
    try {
      const newToko = await addToko({ nama: newTokoNama.trim(), alamat: newTokoAlamat.trim(), kategori: newTokoKategori })
      const realToko = { id: newToko.id, nama: newTokoNama.trim(), alamat: newTokoAlamat.trim(), kategori: newTokoKategori, aktif: true }
      onTokoCreated(realToko)
      onChange({ ...data, toko_id: realToko.id, kategori: newTokoKategori })
      setShowAddToko(false)
      setNewTokoNama("")
      setNewTokoAlamat("")
      setNewTokoKategori("toko")
    } finally {
      setSavingToko(false)
    }
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-2 space-y-2">
      <div 
        className="flex items-center justify-between cursor-pointer hover:bg-neutral-50/80 -m-1 p-1 rounded transition-colors group select-none"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-2 text-sm font-medium text-neutral-700">
          {open ? <ChevronUp className="h-4 w-4 text-neutral-400" /> : <ChevronDown className="h-4 w-4 text-neutral-400" />}
          <span className="group-hover:text-blue-600 transition-colors">
            {`${currentIdx + 1}. ${selectedToko?.nama || "Titip Jual Baru"}`}
          </span>
          {!open && (missingJatuhTempo || missingRokok) && (
            <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-600">
              <AlertCircle className="h-3 w-3" /> Data belum lengkap
            </span>
          )}
        </div>
        <IconButton 
          icon={Trash2} 
          onClick={(e) => { e.stopPropagation(); onRemove(); }} 
          variant="danger" 
          label="Hapus" 
        />
      </div>
      {open && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs font-medium text-neutral-600">Toko</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto p-0 text-blue-500 hover:text-blue-700 hover:bg-transparent"
                  onClick={() => setShowAddToko(true)}
                >
                  + toko baru
                </Button>
              </div>
              <SearchableSelect
                value={data.toko_id}
                onChange={(e) => {
                  const t = tokoList.find((x) => x.id === e.target.value)
                  onChange({ ...data, toko_id: e.target.value, kategori: t?.kategori || data.kategori })
                }}
                placeholder="Pilih toko"
                options={[
                  { value: "", label: "Pilih toko" },
                  ...tokoList
                    .filter((t) => t.aktif !== false && (t.id === data.toko_id || !usedTokoIds.includes(t.id)))
                    .map((t) => ({ value: t.id, label: `${t.nama} (${t.kategori})` })),
                ]}
              />
            </div>
            <Field label="Jatuh Tempo">
              <input
                type="date"
                value={data.tanggal_jatuh_tempo}
                min={tanggalSesi}
                onChange={(e) => onChange({ ...data, tanggal_jatuh_tempo: e.target.value })}
                className={inputCls}
              />
              {missingJatuhTempo && (
                <p className="mt-1 text-xs text-amber-600 font-medium">Isi jatuh tempo sebelum menyimpan</p>
              )}
            </Field>
            <Field label="Catatan (opsional)" className="sm:col-span-2">
              <input type="text" value={data.catatan} onChange={(e) => onChange({ ...data, catatan: e.target.value })} className={inputCls} placeholder="Opsional" />
            </Field>
          </div>

          {/* Modal tambah toko baru */}
          {showAddToko && (
            <Modal title="Tambah Toko Baru" onClose={() => setShowAddToko(false)} width="max-w-md">
              <div className="space-y-4">
                <Field label="Nama Toko">
                  <input type="text" value={newTokoNama} onChange={(e) => setNewTokoNama(e.target.value)} placeholder="Nama toko" className={inputCls} autoFocus />
                  {(() => {
                    const q = tokoQuery.toLowerCase()
                    if (!q) return null
                    const matches = tokoList.filter((t) => t.nama.toLowerCase().includes(q))
                    if (!matches.length) return null
                    const exact    = matches.some((t) => t.nama.toLowerCase() === q)
                    const visible  = matches.slice(0, 3)
                    const hidden   = matches.slice(4)
                    return (
                      <div className={`mt-1.5 rounded-md border text-xs ${exact ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
                        <p className={`px-2.5 pt-2 pb-1 font-semibold ${exact ? "text-red-600" : "text-amber-700"}`}>
                          {exact ? "Toko dengan nama ini sudah ada." : "Toko serupa sudah ada:"}
                        </p>
                        <ul className="px-2.5 pb-2 space-y-0.5">
                          {visible.map((t) => (
                            <li key={t.id} className="flex items-center gap-1.5 text-neutral-700">
                              <span className="font-medium">{t.nama}</span>
                              {t.alamat && <span className="text-neutral-400 truncate">— {t.alamat}</span>}
                              <span className={`ml-auto shrink-0 capitalize rounded px-1.5 py-0.5 font-medium ${t.kategori === "grosir" ? "bg-blue-100 text-blue-700" : "bg-neutral-100 text-neutral-500"}`}>{t.kategori}</span>
                            </li>
                          ))}
                        </ul>
                        {hidden.length > 0 && (
                          <div className="px-2.5 pb-2">
                            <span
                              className="relative group cursor-default text-neutral-400 hover:text-neutral-600 transition-colors"
                            >
                              +{hidden.length} lainnya
                              <span className="pointer-events-none absolute bottom-full left-0 mb-1.5 w-max max-w-[200px] rounded-md bg-neutral-800 px-2 py-1.5 text-white opacity-0 group-hover:opacity-100 transition-opacity z-50 leading-snug">
                                {hidden.map((t) => t.nama).join(", ")}
                              </span>
                            </span>
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </Field>
                <Field label="Kategori Default">
                  <SelectInput value={newTokoKategori} onChange={(e) => setNewTokoKategori(e.target.value)}>
                    <option value="toko">Toko</option>
                    <option value="grosir">Grosir</option>
                  </SelectInput>
                </Field>
                <Field label="Alamat (opsional)">
                  <input type="text" value={newTokoAlamat} onChange={(e) => setNewTokoAlamat(e.target.value)} placeholder="Alamat toko" className={inputCls} />
                </Field>
                <div className="flex justify-end gap-3">
                <div className="flex justify-end gap-3">
                  <Button variant="secondary" onClick={() => setShowAddToko(false)}>
                    Batal
                  </Button>
                  <Button onClick={handleSaveToko} disabled={!newTokoNama.trim()} loading={savingToko}>
                    Simpan Toko
                  </Button>
                </div>
                </div>
              </div>
            </Modal>
          )}

          {data.items.map((item, idx) => {
            const usedByOthers = getAvailableQty(item.rokok_id, idx)
            const available    = Math.max(0, usedByOthers - (Number(item.qty) || 0))
            const totalDibawa  = qtyDibawa[item.rokok_id] || 0
            const melebihi     = !isHistorical && item.rokok_id && Number(item.qty) > usedByOthers
            return (
              <div key={idx}>
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-neutral-600">{idx === 0 ? "Rokok" : ""}</span>
                      {!isHistorical && item.rokok_id && (
                        <span className={`text-[10px] font-bold tabular-nums ${melebihi ? "text-red-500" : (Number(item.qty) || 0) > 0 ? "text-blue-600" : "text-neutral-400"}`}>
                          Sisa: {available} / {totalDibawa}
                        </span>
                      )}
                    </div>
                    <SelectInput value={item.rokok_id} onChange={(e) => updateItem(idx, "rokok_id", e.target.value)}>
                        <option value="">Pilih rokok</option>
                        {rokokDibawa.filter((r) => r.aktif !== false && (r.id === item.rokok_id || !data.items.some((it, i) => i !== idx && it.rokok_id === r.id))).map((r) => {
                          const avail = getAvailableQty(r.id)
                          return (
                            <option key={r.id} value={r.id}>{r.nama}</option>
                          )
                        })}
                      </SelectInput>
                    </div>
                    <div className="w-24">
                    <Field label={idx === 0 ? "Qty" : ""}>
                      <input
                        type="number" min="1"
                        max={!isHistorical && item.rokok_id ? available + (Number(item.qty) || 0) : undefined}
                        value={item.qty}
                        onChange={(e) => updateItem(idx, "qty", e.target.value)}
                        placeholder="0"
                        disabled={!item.rokok_id}
                        className={inputCls + (melebihi ? " border-orange-400" : "") + (!item.rokok_id ? " opacity-40 cursor-not-allowed" : "")}
                      />
                    </Field>
                  </div>
                  {data.items.length > 1 && (
                    <div className="pb-1">
                      <IconButton icon={Trash2} onClick={() => onChange({ ...data, items: data.items.filter((_, i) => i !== idx) })} variant="danger" label="Hapus" />
                    </div>
                  )}
                </div>
                {melebihi && (
                  <div className="flex items-center gap-1.5 mt-1 rounded-md border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs text-orange-700">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    Qty melebihi yang tersedia ({usedByOthers})
                  </div>
                )}
              </div>
            )
          })}
          <Button
            variant="ghost"
            size="sm"
            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
            onClick={() => onChange({ ...data, items: [...data.items, { rokok_id: "", qty: "" }] })}
          >
            + Tambah rokok
          </Button>

          {missingRokok && (
            <div className="flex items-center gap-1.5 rounded-md border border-orange-200 bg-orange-50 px-2.5 py-1.5 text-xs text-orange-700">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              Pilih minimal satu rokok dengan qty &gt; 0
            </div>
          )}

        </div>
      )}
    </div>
  )
}

// ─── TUKAR BARANG TAB (di Laporan Sore) ─────────────────────────────────────

function TukarBarangTab({ tukarSelesai, setTukarSelesai, rokokDibawa, rokokList, qtyDibawa, qtyTerjualLangsung, qtyTitipBaru, isHistorical = false }) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-neutral-200 bg-white p-5 space-y-5">
        <div className="border-b border-neutral-100 pb-3">
          <h3 className="text-sm font-bold text-neutral-800 uppercase tracking-wide">Tukar Barang / Retur</h3>
          <p className="text-[11px] text-neutral-400 mt-1 italic">Gunakan jika penukaran barang (kembali & pengganti) langsung selesai hari ini.</p>
        </div>

        <div className="space-y-5">
          <Field label="Tipe Toko">
            <SelectInput
              value={tukarSelesai.kategori}
              onChange={(e) => setTukarSelesai(prev => ({ ...prev, kategori: e.target.value }))}
              className="w-full"
            >
              <option value="grosir">Grosir</option>
              <option value="toko">Toko</option>
            </SelectInput>
          </Field>

          <TukarInputBlock
            data={tukarSelesai}
            onChange={(b) => setTukarSelesai(b)}
            rokokDibawa={rokokDibawa}
            rokokList={rokokList}
            type="selesai"
            kategori={tukarSelesai.kategori}
            qtyDibawa={qtyDibawa}
            qtyTerjualLangsung={qtyTerjualLangsung}
            qtyTitipBaru={qtyTitipBaru}
            isHistorical={isHistorical}
          />
        </div>
      </div>
    </div>
  )
}

function TukarInputBlock({ data, onChange, rokokDibawa, rokokList, type, kategori, label, qtyDibawa = {}, qtyTerjualLangsung = {}, qtyTitipBaru = {}, qtyOtherTukarKeluar = {}, qtyOtherTukarMasuk = {}, isHistorical = false }) {
  const hargaDefault = (rokok) => {
    if (!rokok) return 0
    return kategori === "grosir" ? (rokok.harga_grosir || rokok.harga_toko) : (rokok.harga_toko || rokok.harga_perorangan)
  }

  const updateItems = (field, items) => onChange({ ...data, [field]: items })
  const updateRow = (field, rowIdx, key, val) => {
    const items = data[field].map((it, i) => i === rowIdx ? { ...it, [key]: val } : it)
    updateItems(field, items)
  }
  const updateRokok = (field, rowIdx, rokok_id) => {
    const rokok = rokokList.find((r) => r.id === rokok_id)
    const standar = hargaDefault(rokok)
    const items = data[field].map((it, i) => i === rowIdx ? { ...it, rokok_id, harga_satuan: String(standar) } : it)
    updateItems(field, items)
  }
  const addRow    = (field) => updateItems(field, [...data[field], { rokok_id: "", qty: "", harga_satuan: "" }])
  const removeRow = (field, rowIdx) => updateItems(field, data[field].filter((_, i) => i !== rowIdx))

  const rokokForKeluar = rokokDibawa
  const rokokForMasuk  = rokokList.filter((r) => r.aktif !== false)

  const renderItems = (field, label, available) => {
    const isFirstRow = data[field]?.length > 0 && data[field]?.[0]?.rokok_id

    return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-neutral-600">{label}</p>
      {data[field]?.map((item, rowIdx) => {
        const selectedIds = data[field].map((x) => x.rokok_id).filter(Boolean)
        const opts = available.filter((r) => !selectedIds.includes(r.id) || r.id === item.rokok_id)
        const rokok = rokokList.find((r) => r.id === item.rokok_id)
        const standar = hargaDefault(rokok)

        // Info tambahan per field
        const isKeluar = field === "itemsKeluar"
        const isMasuk  = field === "itemsMasuk"
        let infoLabel = null
        if (!isHistorical && item.rokok_id) {
          if (isKeluar) {
            const dibawa   = qtyDibawa[item.rokok_id] || 0
            const terjual  = qtyTerjualLangsung[item.rokok_id] || 0
            const titip    = qtyTitipBaru[item.rokok_id] || 0
            const other    = qtyOtherTukarKeluar[item.rokok_id] || 0
            const thisRowQty = Number(item.qty || 0)
            const otherRowsQty = (data.itemsKeluar || []).filter((_, i) => i !== rowIdx).reduce((s, it) => it.rokok_id === item.rokok_id ? s + Number(it.qty || 0) : s, 0)
            const totalUsed = terjual + titip + other + otherRowsQty
            const sisa = Math.max(0, dibawa - totalUsed - thisRowQty)
            const melebihi = thisRowQty > dibawa - totalUsed
            infoLabel = (
              <span className={`text-[10px] font-bold tabular-nums ${!thisRowQty ? "text-neutral-400" : melebihi ? "text-red-500" : "text-blue-600"}`}>
                Sisa: {sisa} / {dibawa}
              </span>
            )
          } else if (isMasuk) {
            const stok         = rokok?.stok ?? 0
            const thisBlockQty = (data.itemsMasuk || []).reduce((s, it) => it.rokok_id === item.rokok_id ? s + Number(it.qty || 0) : s, 0)
            const otherBlockQty = qtyOtherTukarMasuk[item.rokok_id] || 0
            const totalMasuk   = thisBlockQty + otherBlockQty
            infoLabel = (
              <span className={`text-[10px] font-bold tabular-nums ${totalMasuk > 0 ? "text-blue-600" : "text-neutral-400"}`}>
                Stok: {stok + totalMasuk}
              </span>
            )
          }
        }

        return (
          <div key={rowIdx}>
            {rowIdx === 0 && (
              <div className="grid grid-cols-12 gap-2 px-1 mb-1">
                <div className="col-span-12 sm:col-span-5">
                  <p className="text-xs font-semibold text-neutral-700">Rokok</p>
                </div>
                <div className="col-span-3 sm:col-span-2">
                  <p className="text-xs font-semibold text-neutral-700">Qty</p>
                </div>
                <div className="col-span-7 sm:col-span-4">
                  <p className="text-xs font-semibold text-neutral-700">Harga</p>
                </div>
                <div className="col-span-2 sm:col-span-1" />
              </div>
            )}
            <div className="grid grid-cols-12 items-end gap-2">
            <div className="col-span-12 sm:col-span-5">
              <div className="flex items-center justify-between mb-1">
                <span />
                {infoLabel}
              </div>
              <SelectInput value={item.rokok_id} onChange={(e) => updateRokok(field, rowIdx, e.target.value)}>
                <option value="">Pilih rokok</option>
                {opts.map((r) => <option key={r.id} value={r.id}>{r.nama}</option>)}
              </SelectInput>
            </div>
            <div className="col-span-3 sm:col-span-2">
              <input type="number" min="1" value={item.qty} disabled={!item.rokok_id}
                onChange={(e) => updateRow(field, rowIdx, "qty", e.target.value)}
                placeholder="Qty" className={inputCls + (!item.rokok_id ? " bg-neutral-50 opacity-50" : "")} />
            </div>
            <div className="col-span-7 sm:col-span-4">
              <MoneyInput value={String(standar) || ""}
                disabled
                onChange={() => {}}
                className={inputCls + " bg-neutral-50 opacity-70"}
                placeholder="Harga" />
            </div>
            <div className="col-span-2 sm:col-span-1 flex justify-end">
              {data[field].length > 1 && (
                <IconButton icon={Trash2} onClick={() => removeRow(field, rowIdx)} variant="danger" label="Hapus" />
              )}
            </div>
            </div>
          </div>
        )
      })}
      <Button type="button" variant="ghost" size="sm" onClick={() => addRow(field)} className="text-blue-600 hover:bg-blue-50">
        + Tambah baris
      </Button>
    </div>
    )
  }

  const totalMasuk    = (data.itemsMasuk || []).reduce((s, it)  => s + Number(it.qty || 0) * Number(it.harga_satuan || 0), 0)
  const totalKeluar   = (data.itemsKeluar || []).reduce((s, it) => s + Number(it.qty || 0) * Number(it.harga_satuan || 0), 0)
  const selisih       = totalKeluar - totalMasuk
  const isReturnOnly  = type === "selesai" && !(data.itemsKeluar || []).some(it => it.rokok_id && Number(it.qty) > 0)
  const invalid       = type === "selesai" && !isReturnOnly && selisih < 0

  const labelKat = label || (kategori === "grosir" ? "Grosir" : "Toko")
  const KATEGORI_DOT = {
    grosir: "bg-violet-500",
    toko:   "bg-blue-500",
  }

  return (
    <div className="rounded-lg border border-neutral-200 p-4 space-y-4">
      <div className="flex items-center gap-1.5 px-0.5">
        <div className={`h-1.5 w-1.5 rounded-full ${KATEGORI_DOT[kategori] || "bg-neutral-400"}`} />
        <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-600">
          {labelKat}
        </span>
      </div>
      {renderItems("itemsMasuk", `Barang Return (dari ${labelKat})`, rokokForMasuk)}
      
      {type === "selesai" && (
        <>
          {renderItems("itemsKeluar", "Barang Pengganti (dari Sales)", rokokForKeluar)}
          {rokokForKeluar.length === 0 && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
              Sales tidak membawa rokok hari ini — tidak bisa input pengganti.
            </p>
          )}

          {isReturnOnly ? (
            <div className="rounded border border-teal-200 bg-teal-50 p-3 flex items-start gap-2 text-sm">
              <Info className="h-4 w-4 text-teal-600 mt-0.5 shrink-0" />
              <div>
                <span className="font-semibold text-teal-800">Akan diproses sebagai Retur</span>
                <p className="text-teal-700 text-xs mt-0.5">
                  Tidak ada barang pengganti — barang yang dikembalikan toko akan dicatat sebagai retur masuk ke stok.
                </p>
              </div>
            </div>
          ) : (
          <div className="rounded border border-neutral-300 bg-neutral-50 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-neutral-600 text-xs">Nilai pengganti − Nilai kembalian</span>
                <span className="font-medium tabular-nums text-xs">{fmtIDR(totalKeluar)} − {fmtIDR(totalMasuk)}</span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="font-semibold text-sm">
                  {selisih > 0 ? "Selisih (toko bayar tambahan)" : selisih < 0 ? "Selisih (sales kasih kembalian)" : "Seimbang"}
                </span>
                <span className={`font-bold tabular-nums ${invalid ? "text-red-600" : selisih > 0 ? "text-emerald-700" : selisih < 0 ? "text-amber-600" : "text-neutral-700"}`}>
                  {selisih === 0 ? "—" : fmtIDR(Math.abs(selisih))}
                </span>
              </div>
              {invalid && (
                <p className="mt-1 text-xs text-red-600">
                  Nilai pengganti dari sales harus ≥ nilai kembalian dari toko.
                </p>
              )}
            </div>
          )}
        </>
      )}

      {type === "belum_selesai" && (
        <Field label="Catatan (opsional)">
          <input
            type="text"
            value={data.catatan || ""}
            onChange={(e) => onChange({ ...data, catatan: e.target.value })}
            placeholder="Catatan tambahan..."
            className={inputCls}
          />
        </Field>
      )}
    </div>
  )
}

