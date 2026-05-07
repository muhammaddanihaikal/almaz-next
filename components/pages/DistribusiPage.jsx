"use client"

import { useEffect, useMemo, useState, Fragment } from "react"
import { useRouter } from "next/navigation"
import { Plus, Trash2, AlertCircle, ChevronDown, ChevronUp, Download } from "lucide-react"
import { fmtIDR, fmtTanggal, filterByDateRange, defaultDateRange, sortByDateDesc } from "@/lib/utils"
import { createSesi, updateSesiPagi, submitLaporanSore, editLaporanSore, deleteSesi } from "@/actions/distribusi"
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

function collectSessionRokokIds(session) {
  const ids = new Set()
  const add = (items = []) => items.forEach((it) => it?.rokok_id && ids.add(String(it.rokok_id)))

  // Kita fokus pada barang yang dibawa (barangKeluar) dan yang terjual (penjualan)
  // karena ini yang paling relevan dengan tampilan di tabel distribusi.
  add(session.barangKeluar)
  add(session.penjualan)

  return ids
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

function exportToExcel(rows, rokokList, dateRange, onNoData) {
  const XLSX = require("xlsx-js-style")

  // Kumpulkan semua item penjualan (langsung + konsinyasi selesai)
  const allItems = []
  for (const sesi of rows) {
    for (const it of (sesi.penjualan || [])) {
      allItems.push({ tanggal: sesi.tanggal, rokok_id: it.rokok_id, rokok: it.rokok, qty: it.qty, harga: it.harga })
    }
    for (const k of (sesi.konsinyasi || [])) {
      if (k.status !== "selesai") continue
      const tanggal = k.tanggal_selesai || sesi.tanggal
      for (const it of k.items) {
        if (it.qty_terjual > 0) {
          allItems.push({ tanggal, rokok_id: it.rokok_id, rokok: it.rokok, qty: it.qty_terjual, harga: it.harga })
        }
      }
    }
  }
  if (!allItems.length) { onNoData?.(); return }

  // Produk unik (urut berdasarkan urutan rokokList) & tanggal unik (urut asc)
  const rokokOrderMap = Object.fromEntries(rokokList.map((r) => [r.nama, r.urutan ?? 0]))
  const products = [...new Set(allItems.map((it) => it.rokok))].sort((a, b) => (rokokOrderMap[a] ?? 0) - (rokokOrderMap[b] ?? 0))
  const dates    = [...new Set(allItems.map((it) => it.tanggal))].sort()

  // Map harga_beli per rokok_id
  const hargaBeli = Object.fromEntries(rokokList.map((r) => [r.id, r.harga_beli || 0]))

  // Agregasi per tanggal
  const dateMap = {}
  for (const it of allItems) {
    if (!dateMap[it.tanggal]) dateMap[it.tanggal] = { byProduct: {}, penjualan: 0, profit: 0 }
    dateMap[it.tanggal].byProduct[it.rokok] = (dateMap[it.tanggal].byProduct[it.rokok] || 0) + it.qty
    dateMap[it.tanggal].penjualan += it.qty * it.harga
    dateMap[it.tanggal].profit   += it.qty * (it.harga - (hargaBeli[it.rokok_id] || 0))
  }

  // Hitung total
  const totalByProduct = Object.fromEntries(products.map((p) => [p, dates.reduce((s, d) => s + (dateMap[d].byProduct[p] || 0), 0)]))
  const totalPenjualan = dates.reduce((s, d) => s + dateMap[d].penjualan, 0)
  const totalProfit    = dates.reduce((s, d) => s + dateMap[d].profit, 0)

  const fmtD = (d) => { const [y, m, day] = d.split("-"); return `${day}/${m}/${y}` }

  const start = dateRange?.start ? fmtD(dateRange.start) : fmtD(dates[0])
  const end   = dateRange?.end   ? fmtD(dateRange.end)   : fmtD(dates[dates.length - 1])
  const title = `LAPORAN PENJUALAN HARIAN ${start} - ${end}`

  const totalCols = 2 + products.length + 2

  // Border tipis
  const bThin = { style: "thin", color: { rgb: "9CA3AF" } }
  const border = { top: bThin, bottom: bThin, left: bThin, right: bThin }

  // Styles
  const sH     = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "1F2937" } }, alignment: { horizontal: "center", vertical: "center" }, border }
  const sSub   = { font: { bold: true }, fill: { fgColor: { rgb: "E5E7EB" } }, alignment: { horizontal: "center", vertical: "center" }, border }
  const sData  = { alignment: { horizontal: "center", vertical: "center" }, border }
  const sNum   = { alignment: { horizontal: "center", vertical: "center" }, border }
  const sMoney = { alignment: { horizontal: "center", vertical: "center" }, border }
  const sTotal = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "1F2937" } }, alignment: { horizontal: "center", vertical: "center" }, border }
  const sTotalNum = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "1F2937" } }, alignment: { horizontal: "center", vertical: "center" }, border }
  const sTotalMoney = { ...sTotalNum, alignment: { horizontal: "center", vertical: "center" } }

  const fmtExcelMoney = (v) => "Rp. " + (v || 0).toLocaleString("id-ID")

  const wsData = [
    // Baris 1: judul
    [{ v: title, s: { font: { bold: true, sz: 12 }, alignment: { horizontal: "center", vertical: "center" } } }, ...Array(totalCols - 1).fill({ v: "" })],
    // Baris 2: kosong
    Array(totalCols).fill({ v: "" }),
    // Baris 3: header atas
    [
      { v: "NO",             s: sH },
      { v: "TANGGAL",        s: sH },
      { v: "PRODUK",         s: sH },
      ...Array(products.length - 1).fill({ v: "", s: sH }),
      { v: "PENJUALAN (RP)", s: sH },
      { v: "PROFIT (RP)",    s: sH },
    ],
    // Baris 4: nama produk
    [
      { v: "", s: sSub },
      { v: "", s: sSub },
      ...products.map((p) => ({ v: p.toUpperCase(), s: sSub })),
      { v: "", s: sSub },
      { v: "", s: sSub },
    ],
    // Baris data
    ...dates.map((date, i) => {
      const d = dateMap[date]
      return [
        { v: i + 1,       t: "n", s: sData },
        { v: fmtD(date),          s: sData },
        ...products.map((p) => ({ v: d.byProduct[p] || 0, t: "n", s: sData })),
        { v: fmtExcelMoney(d.penjualan), t: "s", s: sMoney },
        { v: fmtExcelMoney(d.profit),    t: "s", s: sMoney },
      ]
    }),
    // Baris TOTAL
    [
      { v: "",        s: sTotal },
      { v: "TOTAL",   s: sTotal },
      ...products.map((p) => ({ v: totalByProduct[p], t: "n", s: sTotal })),
      { v: fmtExcelMoney(totalPenjualan), t: "s", s: sTotalMoney },
      { v: fmtExcelMoney(totalProfit),    t: "s", s: sTotalMoney },
    ],
  ]

  const ws = XLSX.utils.aoa_to_sheet(wsData)

  // Merge cells
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } },
    { s: { r: 2, c: 0 }, e: { r: 3, c: 0 } },
    { s: { r: 2, c: 1 }, e: { r: 3, c: 1 } },
    { s: { r: 2, c: 2 }, e: { r: 2, c: 1 + products.length } },
    { s: { r: 2, c: 2 + products.length }, e: { r: 3, c: 2 + products.length } },
    { s: { r: 2, c: 3 + products.length }, e: { r: 3, c: 3 + products.length } },
  ]

  // Auto-fit column widths berdasarkan konten terpanjang
  const autoW = (values) => ({ wch: Math.min(Math.max(...values.map((v) => String(v ?? "").length)) + 3, 40) })
  ws["!cols"] = [
    autoW(["NO", ...dates.map((_, i) => i + 1)]),                                            // NO
    autoW(["TANGGAL", ...dates.map(fmtD)]),                                                   // TANGGAL
    ...products.map((p) => autoW([p, ...dates.map((d) => dateMap[d].byProduct[p] || 0)])),   // per produk
    autoW(["PENJUALAN (RP)", totalPenjualan, ...dates.map((d) => dateMap[d].penjualan)]),     // PENJUALAN
    autoW(["PROFIT (RP)",    totalProfit,    ...dates.map((d) => dateMap[d].profit)]),        // PROFIT
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Distribusi")
  XLSX.writeFile(wb, `laporan_penjualan_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

function exportToExcelBySales(rows, rokokList, dateRange, onNoData) {
  const XLSX = require("xlsx-js-style")
  
  const hargaBeliMap = Object.fromEntries(rokokList.map(r => [r.id, r.harga_beli || 0]))
  const rokokIdToName = Object.fromEntries(rokokList.map(r => [r.id, r.nama]))

  // 1. Identifikasi semua Sales & Produk yang terlibat dalam data yang terfilter
  const activeSales = [...new Set(rows.map(r => r.sales))].sort((a, b) => a.localeCompare(b, "id"))
  
  // Agregasi data: { [rokokId]: { [salesName]: qty } }
  const dataMap = {}
  const allRokokIds = new Set()

  for (const sesi of rows) {
    // Penjualan Langsung
    for (const it of (sesi.penjualan || [])) {
      allRokokIds.add(it.rokok_id)
      if (!dataMap[it.rokok_id]) dataMap[it.rokok_id] = {}
      dataMap[it.rokok_id][sesi.sales] = (dataMap[it.rokok_id][sesi.sales] || 0) + it.qty
    }
    // Titip Jual Selesai
    for (const k of (sesi.konsinyasi || [])) {
      if (k.status !== "selesai") continue
      for (const it of k.items) {
        if (it.qty_terjual > 0) {
          allRokokIds.add(it.rokok_id)
          if (!dataMap[it.rokok_id]) dataMap[it.rokok_id] = {}
          dataMap[it.rokok_id][sesi.sales] = (dataMap[it.rokok_id][sesi.sales] || 0) + it.qty_terjual
        }
      }
    }
  }

  const rokokIdOrderMap = Object.fromEntries(rokokList.map(r => [r.id, r.urutan ?? 0]))
  const sortedRokokIds = [...allRokokIds].sort((a, b) => (rokokIdOrderMap[a] ?? 0) - (rokokIdOrderMap[b] ?? 0))
  if (!sortedRokokIds.length) { onNoData?.(); return }

  // 2. Persiapkan Worksheet
  const fmtD = (d) => { const [y, m, day] = d.split("-"); return `${day}/${m}/${y}` }
  const start = dateRange?.start ? fmtD(dateRange.start) : "-"
  const end   = dateRange?.end   ? fmtD(dateRange.end)   : "-"
  const title = `LAPORAN PENJUALAN PER MOTORIS (${start} - ${end})`

  const totalCols = 3 + activeSales.length + 2 // No, Produk, Harga + Sales... + Total Qty, Total Uang

  const bThin = { style: "thin", color: { rgb: "9CA3AF" } }
  const border = { top: bThin, bottom: bThin, left: bThin, right: bThin }
  const sH     = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "1F2937" } }, alignment: { horizontal: "center", vertical: "center" }, border }
  const sData  = { border, alignment: { vertical: "center", horizontal: "center" } }
  const sCenter = { ...sData, alignment: { horizontal: "center", vertical: "center" } }
  const sNum    = { ...sData, alignment: { horizontal: "center", vertical: "center" }, z: "#,##0" }
  const sNumLeft = { ...sData, alignment: { horizontal: "center", vertical: "center" }, z: "#,##0" }
  const sMoney  = { ...sData, alignment: { horizontal: "center", vertical: "center" } }
  const sTotal  = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "1F2937" } }, border, alignment: { horizontal: "center", vertical: "center" } }
  const sTotalNum = { ...sTotal, alignment: { horizontal: "center", vertical: "center" }, z: "#,##0" }
  const sTotalNumCenter = { ...sTotal, alignment: { horizontal: "center", vertical: "center" }, z: "#,##0" }
  const sTotalNumLeft = { ...sTotal, alignment: { horizontal: "center", vertical: "center" }, z: "#,##0" }
  const sTotalMoney = { ...sTotal, alignment: { horizontal: "center", vertical: "center" } }

  const fmtExcelMoney = (v) => "Rp. " + (v || 0).toLocaleString("id-ID")

  const wsData = [
    [{ v: title, s: { font: { bold: true, sz: 12 }, alignment: { horizontal: "center", vertical: "center" } } }, ...Array(totalCols-1).fill("")],
    Array(totalCols).fill(""),
    [
      { v: "NO",             s: sH },
      { v: "PRODUK",         s: sH },
      { v: "HARGA (BELI)",   s: sH },
      { v: "MOTORIS",        s: sH },
      ...Array(activeSales.length - 1).fill({ v: "", s: sH }),
      { v: "TOTAL TERJUAL",  s: sH },
      { v: "TOTAL UANG",     s: sH },
    ],
    [
      { v: "", s: sH },
      { v: "", s: sH },
      { v: "", s: sH },
      ...activeSales.map(name => ({ v: name.toUpperCase(), s: sH })),
      { v: "", s: sH },
      { v: "", s: sH },
    ],
    ...sortedRokokIds.map((rid, i) => {
      const rowData = dataMap[rid] || {}
      const harga = hargaBeliMap[rid] || 0
      const totalQty = activeSales.reduce((sum, sname) => sum + (rowData[sname] || 0), 0)
      return [
        { v: i + 1,           s: sCenter },
        { v: rokokIdToName[rid], s: sData },
        { v: fmtExcelMoney(harga), t: "s", s: sMoney },
        ...activeSales.map(sname => ({ v: rowData[sname] || 0, s: sNum })),
        { v: totalQty,        s: sNum },
        { v: fmtExcelMoney(totalQty * harga), t: "s", s: sMoney },
      ]
    }),
    [
      { v: "", s: sTotal },
      { v: "TOTAL KESELURUHAN", s: sTotal },
      { v: "", s: sTotal },
      ...activeSales.map(sname => ({ 
        v: sortedRokokIds.reduce((sum, rid) => sum + (dataMap[rid]?.[sname] || 0), 0), 
        s: sTotalNumCenter 
      })),
      { v: sortedRokokIds.reduce((sum, rid) => {
          const rowData = dataMap[rid] || {}
          return sum + activeSales.reduce((s, sn) => s + (rowData[sn] || 0), 0)
        }, 0), 
        s: sTotalNumCenter 
      },
      { v: fmtExcelMoney(sortedRokokIds.reduce((sum, rid) => {
          const rowData = dataMap[rid] || {}
          const harga = hargaBeliMap[rid] || 0
          const totalQty = activeSales.reduce((s, sn) => s + (rowData[sn] || 0), 0)
          return sum + (totalQty * harga)
        }, 0)), 
        t: "s",
        s: sTotalMoney 
      },
    ]
  ]

  const ws = XLSX.utils.aoa_to_sheet(wsData)
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } }, // Title
    // Vertikal merge untuk No, Produk, Harga, Total Qty, Total Uang
    { s: { r: 2, c: 0 }, e: { r: 3, c: 0 } }, // NO
    { s: { r: 2, c: 1 }, e: { r: 3, c: 1 } }, // PRODUK
    { s: { r: 2, c: 2 }, e: { r: 3, c: 2 } }, // HARGA
    { s: { r: 2, c: 3 }, e: { r: 2, c: 2 + activeSales.length } }, // MOTORIS (Horizontal merge)
    { s: { r: 2, c: 3 + activeSales.length }, e: { r: 3, c: 3 + activeSales.length } }, // TOTAL TERJUAL
    { s: { r: 2, c: 4 + activeSales.length }, e: { r: 3, c: 4 + activeSales.length } }, // TOTAL UANG
    // Bottom Total label merge
    { s: { r: wsData.length - 1, c: 1 }, e: { r: wsData.length - 1, c: 2 } }, 
  ]

  const autoW = (values) => ({ wch: Math.min(Math.max(...values.map((v) => String(v ?? "").length)) + 5, 50) })
  ws["!cols"] = [
    { wch: 6 }, // NO
    autoW(["PRODUK", ...sortedRokokIds.map(rid => rokokIdToName[rid]), "TOTAL KESELURUHAN"]), // PRODUK
    { wch: 15 }, // HARGA
    ...activeSales.map(name => ({ wch: Math.max(12, name.length + 4) })), // SALES...
    { wch: 16 }, // TOTAL QTY
    { wch: 18 }, // TOTAL UANG
  ]

  // Set Row heights
  ws["!rows"] = [
    { hpt: 25 }, // Title
    { hpt: 10 }, // Empty
    { hpt: 20 }, // Header 1
    { hpt: 20 }, // Header 2
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Per Motoris")
  XLSX.writeFile(wb, `laporan_motoris_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

export default function DistribusiPage({ role, sesiList, rokokList, salesList, tokoList, tukarBarangList = [], stockCutoffDate }) {
  const router  = useRouter()
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
  const [deletingId, setDeletingId] = useState(null)
  const [localSesiList, setLocalSesiList] = useState(sesiList)

  useEffect(() => {
    setLocalSesiList(sesiList)
  }, [sesiList])

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
    setDeletingId(r.id)
    try {
      const result = await deleteSesi(r.id, alasan)
      if (result && result.success === false) {
        throw new Error(result.error || "Gagal menghapus sesi.")
      }
      removeLocalSesi(r.id)
      router.refresh()
    } catch (error) {
      console.error("[deleteSesi]", error)
      await confirm(error?.message || "Gagal menghapus sesi.", { title: "Gagal Hapus Sesi", hideCancel: true })
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Distribusi"
        subtitle="Sesi harian sales — barang keluar pagi & laporan sore."
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
                      onClick={() => {
                        setShowExportMenu(false)
                        exportToExcel(rows, rokokList, dateRange, () => confirm("Tidak ada data untuk diekspor.", { title: "Export Excel", hideCancel: true }))
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
                      onClick={() => {
                        setShowExportMenu(false)
                        exportToExcelBySales(rows, rokokList, dateRange, () => confirm("Tidak ada data untuk diekspor.", { title: "Export Excel", hideCancel: true }))
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
        <DataTable
          key={`${dateRange?.start}-${dateRange?.end}-${salesFilter}-${rokokFilter}-${statusFilter}`}
          pageSize={PAGE_SIZE}
          rows={rows}
          empty="Belum ada sesi distribusi."
          columns={[
            { key: "no",      label: "No",      render: (_, idx) => idx + 1 },
            { key: "tanggal", label: "Tanggal", render: (r) => fmtTanggal(r.tanggal) },
            { key: "sales",   label: "Sales",   render: (r) => r.sales },
            {
              key: "status", label: "Status",
              render: (r) => {
                const hasAktifKonsinyasi = r.konsinyasi?.some((k) => k.status === "aktif")
                const tukarAktifSales = tukarBarangList.filter((t) => t.status === "aktif" && t.sales_id === r.sales_id).length
                return (
                  <div className="flex flex-col gap-1 items-start">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge label={r.status === "selesai" ? "Selesai" : "Aktif"} colorClass={STATUS_COLOR[r.status]} />
                      {r.is_historical && <Badge label="Data Lama" colorClass="bg-indigo-100 text-indigo-700 border border-indigo-300 justify-center" />}
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
              render: (r) => <RokokItemsTooltip items={r.barangKeluar} />
            },
            {
              key: "actions", label: "", align: "right",
              render: (r) => (
                <div className="flex items-center justify-end gap-1">
                  {role !== "staff" && r.status === "aktif" && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setLaporanSesi(r)}
                    >
                      Input Laporan
                    </Button>
                  )}
                  {role !== "staff" && r.status === "selesai" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                      onClick={() => setEditLaporan(r)}
                    >
                      Edit Laporan
                    </Button>
                  )}
                  <RowActions
                    onDetail={() => setDetail(r)}
                    onEdit={role !== "staff" ? () => { setEditing(r); setMode("edit") } : null}
                    onDelete={role !== "staff" ? () => { handleDelete(r) } : null}
                    deleteLoading={deletingId === r.id}
                  />
                </div>
              ),
            },
          ]}
        />
      </Card>

      {detail && (
        <Modal title="Detail Sesi" onClose={() => setDetail(null)} width="max-w-4xl">
          <SesiDetail record={detail} />
        </Modal>
      )}

      {mode && (
        <Modal title={mode === "add" ? "Buat Sesi Pagi" : "Edit Sesi Pagi"} onClose={close} width="max-w-2xl">
          <SesiPagiForm
            initial={editing}
            rokokList={rokokList}
            salesList={salesList}
            sesiList={localSesiList}
            stockCutoffDate={stockCutoffDate}
            onSubmit={async (data) => {
              if (mode === "add") {
                const result = await createSesi(data)
                if (result && result.success === false) {
                  throw new Error(result.error || "Gagal membuat sesi distribusi.")
                }
                upsertLocalSesi(result.data)
                close()
                router.refresh()
              } else {
                const captured = editing
                const alasan = await confirmWithReason(`Edit distribusi pagi ${captured.sales}?`, { title: "Edit Distribusi Pagi", confirmLabel: "Ya, Simpan" })
                if (!alasan) return
                const result = await updateSesiPagi(captured.id, data, alasan)
                if (result && result.success === false) {
                  throw new Error(result.error || "Gagal mengubah sesi distribusi.")
                }
                upsertLocalSesi(result.data)
                close()
                router.refresh()
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
            rokokList={rokokList}
            tokoList={tokoList}
            tukarBarangList={tukarBarangList}
            onSessionChange={upsertLocalSesi}
            onSubmit={async (data) => {
              const result = await submitLaporanSore(laporanSesi.id, { ...data, sales_id: laporanSesi.sales_id, tanggal: laporanSesi.tanggal })
              if (result && result.success === false) {
                throw new Error(result.error || "Gagal submit laporan sore.")
              }
              upsertLocalSesi(result.data)
              setLaporanSesi(null)
              router.refresh()
            }}
            onCancel={() => setLaporanSesi(null)}
          />
        </Modal>
      )}

      {editLaporan && (
        <Modal title={`Edit Laporan — ${editLaporan.sales} (${fmtTanggal(editLaporan.tanggal)})`} onClose={() => setEditLaporan(null)} width="max-w-4xl">
          <LaporanSoreForm
            sesi={editLaporan}
            rokokList={rokokList}
            tokoList={tokoList}
            tukarBarangList={tukarBarangList}
            isEdit
            onSessionChange={upsertLocalSesi}
            onSubmit={async (data) => {
              const captured = editLaporan
              const alasan = await confirmWithReason(`Edit laporan sore ${captured.sales}?`, { title: "Edit Laporan Sore", confirmLabel: "Ya, Simpan" })
              if (!alasan) return
              const result = await editLaporanSore(captured.id, { ...data, sales_id: captured.sales_id, tanggal: captured.tanggal }, alasan)
              if (result && result.success === false) {
                throw new Error(result.error || "Gagal edit laporan sore.")
              }
              upsertLocalSesi(result.data)
              setEditLaporan(null)
              router.refresh()
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
            {record.is_historical && <Badge label="Data Lama" colorClass="bg-indigo-100 text-indigo-700 border border-indigo-300 justify-center" />}
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
          Tukar Barang {(record.tukarBarang?.length > 0 || record.tukarBarangSelesaiDiSesi?.length > 0) && `(${(record.tukarBarang?.length || 0) + (record.tukarBarangSelesaiDiSesi?.length || 0)})`}
        </TabButton>
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
          {record.tukarBarang?.length > 0 || record.tukarBarangSelesaiDiSesi?.length > 0 ? (
            <>
              {record.tukarBarang?.map((t, i) => (
                <div key={`baru-${i}`} className="rounded-lg border border-neutral-200 p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{t.toko} <span className="text-xs font-normal text-neutral-500">— Tukar Baru</span></span>
                    <Badge label={t.status === "selesai" ? "Selesai" : "Aktif"} colorClass={STATUS_COLOR[t.status]} />
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
              ))}
              {record.tukarBarangSelesaiDiSesi?.map((t, i) => (
                <div key={`selesai-${i}`} className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-blue-800">{t.toko} <span className="text-xs font-normal text-blue-600">— Penyelesaian Tukar Aktif</span></span>
                    <Badge label="Diselesaikan" colorClass="bg-blue-100 text-blue-700" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-semibold text-blue-700/70 mb-1">Rokok dari Toko (kemarin)</p>
                      <SimpleTable rows={t.itemsMasuk} cols={["rokok", "qty"]} labels={["Rokok", "Qty"]} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-blue-700/70 mb-1">Rokok Pengganti (hari ini)</p>
                      <SimpleTable rows={t.itemsKeluar} cols={["rokok", "qty"]} labels={["Rokok", "Qty"]} />
                    </div>
                  </div>
                </div>
              ))}
            </>
          ) : (
            <p className="text-xs text-neutral-400 italic">Tidak ada tukar barang pada sesi ini.</p>
          )}
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

function SesiPagiForm({ initial, rokokList, salesList, sesiList, stockCutoffDate, onSubmit, onCancel }) {
  const today = new Date().toISOString().slice(0, 10)
  const [tanggal,  setTanggal]  = useState(initial?.tanggal || today)
  const [salesId,  setSalesId]  = useState(initial?.sales_id || "")
  const [catatan,  setCatatan]  = useState(initial?.catatan || "")
  const [items, setItems] = useState(() => {
    const aktif = rokokList.filter((r) => r.aktif !== false)
    return aktif.map((r) => {
      const existing = initial?.barangKeluar?.find((it) => it.rokok_id === r.id)
      // Saat edit, stok efektif = stok saat ini + qty lama (karena stok sudah dikurangi saat create sesi)
      const existingQty = existing ? existing.qty : 0
      const effectiveStok = (r.stok ?? 0) + existingQty
      return { rokok_id: r.id, nama: r.nama, stok: effectiveStok, qty: existing?.qty || "" }
    })
  })
  const [error, setError] = useState("")

  const updateQty = (idx, val) => setItems(items.map((it, i) => i === idx ? { ...it, qty: val } : it))

  const is_historical_computed = stockCutoffDate ? tanggal < stockCutoffDate : false

  const validItems = items.filter((it) => Number(it.qty) > 0)
  const hasStokError = !is_historical_computed && validItems.some((it) => Number(it.qty) > it.stok)
  const valid = tanggal && salesId && validItems.length >= 1 && !hasStokError

  const [loading, setLoading] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    if (!valid || loading) return
    setLoading(true)
    try {
      setError("")
      await onSubmit({ tanggal, sales_id: salesId, catatan, barangKeluar: validItems.map((it) => ({ rokok_id: it.rokok_id, qty: Number(it.qty) })) })
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
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-xs text-neutral-500">
              <th className="pb-1.5 text-left">Rokok</th>
              {!is_historical_computed && <th className="pb-1.5 text-right pr-3">Stok</th>}
              <th className="pb-1.5 text-right">Qty Dibawa</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const qty = Number(item.qty)
              const sisaStok = item.stok - (qty > 0 ? qty : 0)
              const melebihi = !is_historical_computed && qty > 0 && qty > item.stok
              return (
                <Fragment key={item.rokok_id}>
                  <tr className="border-b border-neutral-100">
                    <td className="py-1.5 font-medium">{item.nama}</td>
                    {!is_historical_computed && (
                      <td className={`py-1.5 text-right pr-3 text-xs tabular-nums font-medium transition-colors ${melebihi ? "text-red-500" : qty > 0 ? "text-blue-600" : "text-neutral-400"}`}>
                        {qty > 0 ? sisaStok : item.stok}
                      </td>
                    )}
                    <td className="py-1.5 text-right">
                      <input
                        type="number" min="0"
                        value={item.qty}
                        onChange={(e) => updateQty(idx, e.target.value)}
                        placeholder="—"
                        disabled={!salesId}
                        className={inputCls + " w-24 text-right" + (melebihi ? " border-red-400 focus:border-red-500" : "") + (!salesId ? " opacity-40 cursor-not-allowed bg-neutral-50" : "")}
                      />
                    </td>
                  </tr>
                  {melebihi && (
                    <tr>
                      <td colSpan={3} className="pb-1.5 pt-0">
                        <div className="flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs text-red-700">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                          Melebihi stok — tersedia {item.stok} bungkus
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

function LaporanSoreForm({ sesi, rokokList, tokoList: tokoListProp, tukarBarangList = [], isEdit = false, onSessionChange, onSubmit, onCancel }) {
  const { confirmWithReason, ConfirmWithReasonModal: LaporanConfirmModal } = useConfirmWithReason()
  const [step, setStep] = useState(1)
  const [activeTab, setActiveTab] = useState("penjualan")
  const [tokoList, setTokoList]   = useState(tokoListProp ?? [])

  // ─── Tukar Barang ──────────────────────────────────────────────────────
  // Daftar tukar aktif untuk sales ini (semua sesi sebelumnya), bisa diselesaikan di sesi ini
  const tukarAktifSales = useMemo(
    () => tukarBarangList.filter((t) => t.status === "aktif" && t.sales_id === sesi.sales_id),
    [tukarBarangList, sesi.sales_id]
  )
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

  const [tukarSelesai, setTukarSelesai] = useState({
    kategori: existingSelesai[0]?.kategori || sesi.sales_kategori || "grosir",
    itemsMasuk:  mapItems(aggregateItems(existingSelesai.flatMap(t => t.itemsMasuk  || [])), (existingSelesai[0]?.kategori || sesi.sales_kategori || "grosir")),
    itemsKeluar: mapItems(aggregateItems(existingSelesai.flatMap(t => t.itemsKeluar || [])), (existingSelesai[0]?.kategori || sesi.sales_kategori || "grosir")),
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
  const selisihTukar = totalTukarMasuk - totalTukarKeluar

  const nilaiPenjualan = nilaiPenjualanLangsung + totalTitipJual + selisihTukar
  const totalSetoran = setoran.reduce((s, it) => s + (Number(it.jumlah) || 0), 0)
  const flagSetoran  = nilaiPenjualan > 0 && totalSetoran !== nilaiPenjualan
  const setoranEmpty = totalSetoran === 0

  const [submitError, setSubmitError] = useState("")
  const submit = async (e) => {
    e.preventDefault()
    if (setoranEmpty || loading) return
    setSubmitError("")
    setLoading(true)
    try {
      const validPenjualan  = penjualan.filter((it) => it.rokok_id && Number(it.qty) > 0)
      const validSetoran    = setoran.filter((it) => Number(it.jumlah) > 0)
      const validKonsinyasi = konsinyasiBaru.filter((k) => k.toko_id && k.kategori && k.tanggal_jatuh_tempo && k.items.some((it) => it.rokok_id && Number(it.qty) > 0))
      const validTukarBaru = []

      const inItems  = tukarSelesai.itemsMasuk.filter(i => i.rokok_id && Number(i.qty) > 0)
      const outItems = tukarSelesai.itemsKeluar.filter(i => i.rokok_id && Number(i.qty) > 0)
      if (inItems.length > 0 || outItems.length > 0) {
        if (inItems.length === 0 || outItems.length === 0) {
          throw new Error(`Tukar Barang: Barang return dan barang pengganti harus diisi.`)
        }
        validTukarBaru.push({ ...tukarSelesai, langsungSelesai: true })
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

      await onSubmit(payload)
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

  const SUBTABS = ["penjualan", "konsinyasi", "tukar"]
  const subIdx = SUBTABS.indexOf(activeTab)
  const isFirstSub = subIdx === 0
  const isLastSub = subIdx === SUBTABS.length - 1
  const goPrevSub = () => setActiveTab(SUBTABS[subIdx - 1])
  const goNextSub = () => setActiveTab(SUBTABS[subIdx + 1])

  return (
    <form onSubmit={submit} className="-mx-6 -mb-6 flex flex-col" style={{ maxHeight: 'calc(100vh - 8rem)' }}>
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
                    onChange={(e) => {
                      setSetoranAuto(e.target.checked)
                      if (e.target.checked && nilaiPenjualan > 0) {
                        setSetoran([{ metode: setoran[0]?.metode || "cash", jumlah: String(nilaiPenjualan) }])
                      }
                    }}
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
                      <SelectInput value={it.metode} onChange={(e) => setSetoran(setoran.map((s, i) => i === idx ? { ...s, metode: e.target.value } : s))} disabled={setoranAuto || nilaiPenjualan === 0}>
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
                        className={inputCls + (setoranAuto || nilaiPenjualan === 0 ? " bg-neutral-50 opacity-70" : "")}
                        disabled={setoranAuto || nilaiPenjualan === 0}
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
                <Button type="button" className="bg-blue-700 text-white hover:bg-blue-800" onClick={() => setStep(2)}>Lanjut ke Ringkasan →</Button>
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
              <Button type="submit" className="bg-green-600 text-white hover:bg-green-700" disabled={setoranEmpty || loading} loading={loading}>
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

function KonsinyasiBaruInput({ data, currentIdx, rokokDibawa, qtyDibawa, qtyTerjualLangsung, qtyTukarKeluar = {}, konsinyasiBaru, tokoList, onChange, onRemove, onTokoCreated, extraUsedTokoIds = [], isEdit = false, isHistorical = false }) {
  const [open,        setOpen]        = useState(!(isEdit && data.toko_id))
  const [showAddToko, setShowAddToko] = useState(false)
  const [newTokoNama, setNewTokoNama] = useState("")
  const [newTokoAlamat, setNewTokoAlamat] = useState("")
  const [newTokoKategori, setNewTokoKategori] = useState("toko")
  const [savingToko,  setSavingToko]  = useState(false)

  const selectedToko  = tokoList.find((t) => t.id === data.toko_id)
  const usedTokoIds   = [...konsinyasiBaru.filter((_, i) => i !== currentIdx).map((k) => k.toko_id).filter(Boolean), ...extraUsedTokoIds]


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
      await addToko({ nama: newTokoNama.trim(), alamat: newTokoAlamat.trim(), kategori: newTokoKategori })
      // Fetch toko baru — karena server action, kita buat objek sementara untuk optimistic update
      const tempToko = { id: `__temp__${Date.now()}`, nama: newTokoNama.trim(), alamat: newTokoAlamat.trim(), kategori: newTokoKategori, aktif: true }
      onTokoCreated(tempToko)
      onChange({ ...data, toko_id: tempToko.id, kategori: newTokoKategori })
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
              <input type="date" value={data.tanggal_jatuh_tempo} onChange={(e) => onChange({ ...data, tanggal_jatuh_tempo: e.target.value })} className={inputCls} />
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
          <h3 className="text-sm font-bold text-neutral-800 uppercase tracking-wide">Tukar Barang Selesai</h3>
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

  const totalMasuk  = (data.itemsMasuk || []).reduce((s, it)  => s + Number(it.qty || 0) * Number(it.harga_satuan || 0), 0)
  const totalKeluar = (data.itemsKeluar || []).reduce((s, it) => s + Number(it.qty || 0) * Number(it.harga_satuan || 0), 0)
  const selisih     = totalKeluar - totalMasuk
  const invalid     = type === "selesai" && selisih < 0

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

          <div className="rounded border border-neutral-300 bg-neutral-50 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-neutral-600 text-xs">Nilai pengganti − Nilai kembalian</span>
              <span className="font-medium tabular-nums text-xs">{fmtIDR(totalKeluar)} − {fmtIDR(totalMasuk)}</span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="font-semibold text-sm">Selisih (toko bayar tambahan)</span>
              <span className={`font-bold tabular-nums ${invalid ? "text-red-600" : selisih > 0 ? "text-emerald-700" : "text-neutral-700"}`}>
                {fmtIDR(Math.abs(selisih))}
              </span>
            </div>
            {invalid && (
              <p className="mt-1 text-xs text-red-600">
                Nilai pengganti dari sales harus ≥ nilai kembalian dari toko.
              </p>
            )}
          </div>
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

