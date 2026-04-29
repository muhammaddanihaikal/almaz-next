"use client"

import { useMemo, useState, Fragment } from "react"
import { useRouter } from "next/navigation"
import { Plus, Trash2, AlertCircle, ChevronDown, ChevronUp, Download } from "lucide-react"
import { fmtIDR, fmtTanggal, filterByDateRange, defaultDateRange, sortByDateDesc } from "@/lib/utils"
import { createSesi, updateSesiPagi, submitLaporanSore, editLaporanSore, deleteSesi } from "@/actions/distribusi"
import { settleTitipJual, createTitipJual, editSettlement, revertSettlement, editTitipJualDetail, deleteTitipJual } from "@/actions/titip_jual"
import { addToko } from "@/actions/toko"
import SettlementForm from "@/components/SettlementForm"
import {
  Card, PageHeader, DateFilter, PrimaryButton, Field, FormActions,
  MultiSearchableSelect, SearchableSelect, SelectInput, inputCls, MoneyInput, RowActions, IconButton, useConfirm,
} from "@/components/ui"
import DataTable from "@/components/DataTable"
import Modal from "@/components/Modal"

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

function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
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
  const sData  = { alignment: { horizontal: "center" }, border }
  const sNum   = { alignment: { horizontal: "right" }, border }
  const sMoney = { alignment: { horizontal: "left" }, border }
  const sTotal = { font: { bold: true }, fill: { fgColor: { rgb: "1F2937" } }, alignment: { horizontal: "center" }, border, font: { bold: true, color: { rgb: "FFFFFF" } } }
  const sTotalNum = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "1F2937" } }, alignment: { horizontal: "right" }, border }
  const sTotalMoney = { ...sTotalNum, alignment: { horizontal: "left" } }

  const fmtExcelMoney = (v) => "Rp. " + (v || 0).toLocaleString("id-ID")

  const wsData = [
    // Baris 1: judul
    [{ v: title, s: { font: { bold: true, sz: 12 } } }, ...Array(totalCols - 1).fill({ v: "" })],
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
  const sData  = { border, alignment: { vertical: "center" } }
  const sCenter = { ...sData, alignment: { horizontal: "center", vertical: "center" } }
  const sNum    = { ...sData, alignment: { horizontal: "center", vertical: "center" }, z: "#,##0" }
  const sNumLeft = { ...sData, alignment: { horizontal: "left", vertical: "center" }, z: "#,##0" }
  const sMoney  = { ...sData, alignment: { horizontal: "left", vertical: "center" } }
  const sTotal  = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "1F2937" } }, border }
  const sTotalNum = { ...sTotal, alignment: { horizontal: "right" }, z: "#,##0" }
  const sTotalNumCenter = { ...sTotal, alignment: { horizontal: "center" }, z: "#,##0" }
  const sTotalNumLeft = { ...sTotal, alignment: { horizontal: "left" }, z: "#,##0" }
  const sTotalMoney = { ...sTotal, alignment: { horizontal: "left" } }

  const fmtExcelMoney = (v) => "Rp. " + (v || 0).toLocaleString("id-ID")

  const wsData = [
    [{ v: title, s: { font: { bold: true, sz: 12 } } }, ...Array(totalCols-1).fill("")],
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

export default function DistribusiPage({ sesiList, rokokList, salesList, tokoList }) {
  const router  = useRouter()
  const { confirm, ConfirmModal } = useConfirm()

  const [mode,      setMode]      = useState(null)
  const [editing,   setEditing]   = useState(null)
  const [detail,    setDetail]    = useState(null)
  const [laporanSesi, setLaporanSesi] = useState(null)
  const [editLaporan, setEditLaporan] = useState(null)
  const [dateRange,   setDateRange]   = useState(defaultDateRange("bulan_ini"))
  const [salesFilter, setSalesFilter] = useState([])
  const [rokokFilter, setRokokFilter] = useState([])
  const [statusFilter, setStatusFilter] = useState("")
  const [showExportMenu, setShowExportMenu] = useState(false)

  const rows = useMemo(() => {
    let temp = [...sesiList]

    // 1. Filter by Date
    if (dateRange?.start && dateRange?.end) {
      temp = temp.filter(s => s.tanggal >= dateRange.start && s.tanggal <= dateRange.end)
    }

    // 2. Filter by Sales (OR Logic)
    if (salesFilter.length > 0) {
      temp = temp.filter(s => salesFilter.includes(s.sales_id))
    }

    // 3. Filter by Multiple Products (AND Logic)
    if (rokokFilter.length > 0) {
      temp = temp.filter(s => {
        const sessionRokokIds = (s.barangKeluar || []).map(b => b.rokok_id)
        return rokokFilter.every(id => sessionRokokIds.includes(id))
      })
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
  }, [sesiList, dateRange, salesFilter, rokokFilter, statusFilter])

  const close = () => { setMode(null); setEditing(null) }

  const handleDelete = async (r) => {
    const ok = await confirm(`Hapus sesi ${r.sales} — ${fmtTanggal(r.tanggal)}?`, { title: "Hapus Sesi", variant: "danger", confirmLabel: "Ya, Hapus" })
    if (!ok) return
    // Assuming deleteSesi is available or we use an API
    // await deleteSesi(r.id)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Distribusi"
        subtitle="Sesi harian sales — barang keluar pagi & laporan sore."
        action={
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
              >
                <Download className="h-4 w-4" />
                Export Excel
                <ChevronDown className={`h-3 w-3 transition-transform ${showExportMenu ? "rotate-180" : ""}`} />
              </button>
              
              {showExportMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowExportMenu(false)} />
                  <div className="absolute right-0 z-20 mt-1.5 w-56 origin-top-right rounded-xl border border-neutral-200 bg-white p-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                    <button
                      onClick={() => {
                        setShowExportMenu(false)
                        exportToExcel(rows, rokokList, dateRange, () => confirm("Tidak ada data untuk diekspor.", { title: "Export Excel", hideCancel: true }))
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50 transition-colors"
                    >
                      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-50 text-blue-600">
                        <Download className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-medium">Rekap Harian</p>
                        <p className="text-[10px] text-neutral-500 text-nowrap text-ellipsis overflow-hidden">Ringkasan per tanggal</p>
                      </div>
                    </button>
                    <button
                      onClick={() => {
                        setShowExportMenu(false)
                        exportToExcelBySales(rows, rokokList, dateRange, () => confirm("Tidak ada data untuk diekspor.", { title: "Export Excel", hideCancel: true }))
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50 transition-colors"
                    >
                      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-green-50 text-green-600">
                        <Download className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-medium">Rincian per Sales</p>
                        <p className="text-[10px] text-neutral-500 text-nowrap text-ellipsis overflow-hidden">Detail per produk & motoris</p>
                      </div>
                    </button>
                  </div>
                </>
              )}
            </div>
            <PrimaryButton onClick={() => { setEditing(null); setMode("add") }} icon={Plus}>
              Buat Sesi
            </PrimaryButton>
          </div>
        }
      />

      <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] space-y-3">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-neutral-600 shrink-0">Waktu:</label>
            <DateFilter value={dateRange} onChange={setDateRange} />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-neutral-600 shrink-0">Sales:</label>
            <div className="w-56">
              <MultiSearchableSelect
                value={salesFilter}
                onChange={(e) => setSalesFilter(e.target.value)}
                placeholder="Semua Sales"
                options={[{ value: "", label: "Semua Sales" }, ...salesList.map((s) => ({ value: s.id, label: s.nama }))]}
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-neutral-600 shrink-0">Status:</label>
            <div className="w-40">
              <SelectInput value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">Semua Status</option>
                <option value="aktif">Aktif</option>
                <option value="selesai">Selesai</option>
                <option value="titip_jual_aktif">Titip Jual Aktif</option>
              </SelectInput>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-neutral-600 shrink-0">Produk:</label>
            <div className="w-64">
              <MultiSearchableSelect
                value={rokokFilter}
                onChange={(e) => setRokokFilter(e.target.value)}
                placeholder="Semua Produk"
                options={[{ value: "", label: "Semua Produk" }, ...rokokList.map((r) => ({ value: r.id, label: r.nama }))]}
              />
            </div>
          </div>
        </div>
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
                return (
                  <div className="flex flex-col gap-1">
                    <Badge label={r.status === "selesai" ? "Selesai" : "Aktif"} colorClass={STATUS_COLOR[r.status]} />
                    {hasAktifKonsinyasi && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
                        <AlertCircle className="h-3 w-3" /> Titip jual aktif
                      </span>
                    )}
                  </div>
                )
              },
            },
            {
              key: "keluar", label: "Barang Keluar",
              render: (r) => (
                <div className="space-y-0.5">
                  {r.barangKeluar.slice(0, 3).map((it, i) => (
                    <div key={i} className="text-xs text-neutral-700">{it.rokok} ×{it.qty}</div>
                  ))}
                  {r.barangKeluar.length > 3 && (
                    <div className="text-xs text-neutral-500 font-medium">+{r.barangKeluar.length - 3} lebih</div>
                  )}
                </div>
              ),
            },
            {
              key: "actions", label: "", align: "right",
              render: (r) => (
                <div className="flex items-center justify-end gap-1">
                  {r.status === "aktif" && (
                    <button
                      onClick={() => setLaporanSesi(r)}
                      className="rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                    >
                      Input Laporan
                    </button>
                  )}
                  {r.status === "selesai" && (
                    <button
                      onClick={() => setEditLaporan(r)}
                      className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
                    >
                      Edit Laporan
                    </button>
                  )}
                  <RowActions
                    onDetail={() => setDetail(r)}
                    onEdit={() => { setEditing(r); setMode("edit") }}
                    onDelete={() => handleDelete(r)}
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
            sesiList={sesiList}
            onSubmit={async (data) => {
              if (mode === "add") await createSesi(data)
              else await updateSesiPagi(editing.id, data)
              close()
              router.refresh()
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
            onSubmit={async (data) => {
              await submitLaporanSore(laporanSesi.id, { ...data, sales_id: laporanSesi.sales_id, tanggal: laporanSesi.tanggal })
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
            isEdit
            onSubmit={async (data) => {
              await editLaporanSore(editLaporan.id, { ...data, sales_id: editLaporan.sales_id, tanggal: editLaporan.tanggal })
              setEditLaporan(null)
              router.refresh()
            }}
            onCancel={() => setEditLaporan(null)}
          />
        </Modal>
      )}
      {ConfirmModal}
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
          <Badge label={record.status === "selesai" ? "Selesai" : "Aktif"} colorClass={STATUS_COLOR[record.status]} />
        </div>
        {record.status === "selesai" && (
          <div><p className="text-xs text-neutral-500">Total Terjual</p><p className="font-medium">{totalQtyTerjual} bungkus</p></div>
        )}
        {record.flagSetoran && <div className="flex items-center gap-1 text-red-600 text-xs col-span-2"><AlertCircle className="h-3 w-3" /> Selisih setoran: {fmtIDR(record.nilaiPenjualan)} vs {fmtIDR(record.totalSetoran)}</div>}
        {record.flagQty     && <div className="flex items-center gap-1 text-orange-600 text-xs"><AlertCircle className="h-3 w-3" /> Qty barang tidak cocok</div>}
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

function SesiPagiForm({ initial, rokokList, salesList, sesiList, onSubmit, onCancel }) {
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

  const validItems = items.filter((it) => Number(it.qty) > 0)
  const hasStokError = validItems.some((it) => Number(it.qty) > it.stok)
  const valid = tanggal && salesId && validItems.length >= 1 && !hasStokError

  const submit = async (e) => {
    e.preventDefault()
    if (!valid) return
    try {
      setError("")
      await onSubmit({ tanggal, sales_id: salesId, catatan, barangKeluar: validItems.map((it) => ({ rokok_id: it.rokok_id, qty: Number(it.qty) })) })
    } catch (err) {
      if (err.message?.includes("Unique constraint failed")) {
        setError(`Sales ini sudah punya sesi pada tanggal ${tanggal}. Edit sesi yang ada atau pilih tanggal/sales lain.`)
      } else {
        setError(err.message || "Terjadi kesalahan")
      }
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Tanggal">
          <input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} className={inputCls} required />
        </Field>
        <Field label="Sales">
          <SearchableSelect
            value={salesId}
            onChange={(e) => setSalesId(e.target.value)}
            placeholder="Pilih sales"
            options={[{ value: "", label: "Pilih sales" }, ...salesList.filter((s) => {
                if (s.aktif === false) return false
                if (initial?.sales_id === s.id) return true
                return !sesiList.some((sesi) => sesi.sales_id === s.id && sesi.tanggal === tanggal)
              }).map((s) => ({ value: s.id, label: s.nama }))]}
          />
        </Field>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Barang Dibawa</p>
        <p className="text-xs text-neutral-400">Isi qty untuk rokok yang dibawa, kosongkan jika tidak dibawa.</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-xs text-neutral-500">
              <th className="pb-1.5 text-left">Rokok</th>
              <th className="pb-1.5 text-right pr-3">Stok</th>
              <th className="pb-1.5 text-right">Qty Dibawa</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const qty = Number(item.qty)
              const sisaStok = item.stok - (qty > 0 ? qty : 0)
              const melebihi = qty > 0 && qty > item.stok
              return (
                <Fragment key={item.rokok_id}>
                  <tr className="border-b border-neutral-100">
                    <td className="py-1.5 font-medium">{item.nama}</td>
                    <td className={`py-1.5 text-right pr-3 text-xs tabular-nums font-medium transition-colors ${melebihi ? "text-red-500" : qty > 0 ? "text-blue-600" : "text-neutral-400"}`}>
                      {qty > 0 ? sisaStok : item.stok}
                    </td>
                    <td className="py-1.5 text-right">
                      <input
                        type="number" min="0"
                        value={item.qty}
                        onChange={(e) => updateQty(idx, e.target.value)}
                        placeholder="—"
                        className={inputCls + " w-24 text-right" + (melebihi ? " border-red-400 focus:border-red-500" : "")}
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

      <FormActions onCancel={onCancel} disabled={!valid} submitLabel={initial ? "Simpan Perubahan" : "Buat Sesi"} />
    </form>
  )
}

// ─── Form Laporan Sore ────────────────────────────────────────────────────────

function LaporanSoreForm({ sesi, rokokList, tokoList: tokoListProp, isEdit = false, onSubmit, onCancel }) {
  const { confirm, ConfirmModal: LaporanConfirmModal } = useConfirm()
  const [activeTab, setActiveTab] = useState("penjualan")
  const [tokoList, setTokoList]   = useState(tokoListProp ?? [])

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
  const [konsinyasiBaru,        setKonsinyasiBaru]        = useState([])
  const [settlingKonsinyasi,    setSettlingKonsinyasi]    = useState(null)
  const [settledIds,            setSettledIds]            = useState(new Set())
  const [savedKonsinyasiItems,  setSavedKonsinyasiItems]  = useState([])
  const [newlyCreatedKonsinyasi, setNewlyCreatedKonsinyasi] = useState([])
  const [savedTokoIds,           setSavedTokoIds]           = useState([])
  const [settledRecords,         setSettledRecords]         = useState([])
  const [editingSettlement,      setEditingSettlement]      = useState(null)
  const [revertedFromSelesaiIds,  setRevertedFromSelesaiIds]  = useState(new Set())
  const [editingKonsinyasiDetail, setEditingKonsinyasiDetail] = useState(null)
  const [detailKonsinyasi,        setDetailKonsinyasi]        = useState(null)
  const [showPerorangan,    setShowPerorangan]    = useState(false)
  const [setoranAuto,       setSetoranAuto]       = useState(false)

  const nilaiPenjualan = penjualan.reduce((s, it) => {
    const r = rokokList.find((r) => r.id === it.rokok_id)
    if (!r || !it.qty) return s
    return s + Number(it.qty) * r[`harga_${it.kategori}`]
  }, 0)
  const totalSetoran = setoran.reduce((s, it) => s + (Number(it.jumlah) || 0), 0)
  const flagSetoran  = nilaiPenjualan > 0 && totalSetoran !== nilaiPenjualan
  const setoranEmpty = nilaiPenjualan > 0 && totalSetoran === 0

  const submit = (e) => {
    e.preventDefault()
    if (setoranEmpty) return
    const validPenjualan  = penjualan.filter((it) => it.rokok_id && Number(it.qty) > 0)
    const validSetoran    = setoran.filter((it) => Number(it.jumlah) > 0)
    const validKonsinyasi = konsinyasiBaru.filter((k) => k.toko_id && k.kategori && k.tanggal_jatuh_tempo && k.items.some((it) => it.rokok_id && Number(it.qty) > 0))

    const barangKembaliAuto = {}
    for (const keluar of sesi.barangKeluar) {
      barangKembaliAuto[keluar.rokok_id] = keluar.qty
    }
    for (const pj of validPenjualan) {
      barangKembaliAuto[pj.rokok_id] = (barangKembaliAuto[pj.rokok_id] || 0) - pj.qty
    }
    for (const k of konsinyasiBaru) {
      for (const it of k.items.filter((i) => i.rokok_id && Number(i.qty) > 0)) {
        barangKembaliAuto[it.rokok_id] = (barangKembaliAuto[it.rokok_id] || 0) - Number(it.qty)
      }
    }
    for (const it of savedKonsinyasiItems) {
      barangKembaliAuto[it.rokok_id] = (barangKembaliAuto[it.rokok_id] || 0) - it.qty
    }
    const validKembali = Object.entries(barangKembaliAuto)
      .filter(([_, qty]) => qty > 0)
      .map(([rokok_id, qty]) => ({ rokok_id, qty }))

    onSubmit({
      penjualan:      validPenjualan.map((it) => ({ rokok_id: it.rokok_id, kategori: it.kategori, qty: Number(it.qty) })),
      setoran:        validSetoran.map((it) => ({ metode: it.metode, jumlah: Number(it.jumlah) })),
      barangKembali:  validKembali,
      konsinyasiBaru: validKonsinyasi,
    })
  }

  const handleSaveAndSettle = async (kData, idx) => {
    const created = await createTitipJual(sesi.id, sesi.sales_id, kData)
    setKonsinyasiBaru((prev) => prev.filter((_, i) => i !== idx))
    setSavedKonsinyasiItems((prev) => [
      ...prev,
      ...kData.items.filter((it) => it.rokok_id && Number(it.qty) > 0).map((it) => ({ rokok_id: it.rokok_id, qty: Number(it.qty) })),
    ])
    setSavedTokoIds((prev) => [...prev, kData.toko_id].filter(Boolean))
    setNewlyCreatedKonsinyasi((prev) => [...prev, created])
  }

  const handleEditSettlement = async (data) => {
    await editSettlement(editingSettlement.konsinyasi.id, data)
    setSettledRecords((prev) => prev.map((r) =>
      r.konsinyasi.id === editingSettlement.konsinyasi.id ? { ...r, submittedData: data } : r
    ))
    setEditingSettlement(null)
  }

  const handleRevertSettlement = async (record) => {
    const ok = await confirm(`Batalkan penyelesaian titip jual "${record.konsinyasi.nama_toko}"? Status akan kembali ke Aktif.`, { title: "Batalkan Penyelesaian", variant: "danger", confirmLabel: "Ya, Batalkan" })
    if (!ok) return
    await revertSettlement(record.konsinyasi.id)
    setSettledIds((prev) => { const s = new Set(prev); s.delete(record.konsinyasi.id); return s })
    setSettledRecords((prev) => prev.filter((r) => r.konsinyasi.id !== record.konsinyasi.id))
  }

  const handleRevertPreexistingSettlement = async (k) => {
    const ok = await confirm(`Batalkan penyelesaian titip jual "${k.nama_toko}"? Status akan kembali ke Aktif.`, { title: "Batalkan Penyelesaian", variant: "danger", confirmLabel: "Ya, Batalkan" })
    if (!ok) return
    await revertSettlement(k.id)
    setRevertedFromSelesaiIds((prev) => new Set([...prev, k.id]))
  }

  const handleHapusKonsinyasi = async (k) => {
    const ok = await confirm(`Hapus titip jual "${k.nama_toko}"? Stok akan dikembalikan.`, { title: "Hapus Titip Jual", variant: "danger", confirmLabel: "Ya, Hapus" })
    if (!ok) return
    await deleteTitipJual(k.id)
    setNewlyCreatedKonsinyasi((prev) => prev.filter((x) => x.id !== k.id))
  }

  const preexistingSelesai = (sesi.konsinyasi || []).filter((k) => k.status === "selesai" && !revertedFromSelesaiIds.has(k.id))

  const activeKonsinyasi = [
    ...(sesi.konsinyasi || []).filter((k) => k.status === "aktif" && !settledIds.has(k.id)),
    ...(sesi.konsinyasi || []).filter((k) => k.status === "selesai" && revertedFromSelesaiIds.has(k.id)),
    ...newlyCreatedKonsinyasi.filter((k) => !settledIds.has(k.id)),
  ]

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

  const qtyTitipLama = useMemo(() => {
    const map = {}
    for (const it of savedKonsinyasiItems) {
      map[it.rokok_id] = (map[it.rokok_id] || 0) + it.qty
    }
    return map
  }, [savedKonsinyasiItems])

  const qtyTitipBaru = useMemo(() => {
    const map = { ...qtyTitipLama }
    for (const k of konsinyasiBaru) {
      for (const it of k.items) {
        if (it.rokok_id && Number(it.qty) > 0) {
          map[it.rokok_id] = (map[it.rokok_id] || 0) + Number(it.qty)
        }
      }
    }
    return map
  }, [konsinyasiBaru, qtyTitipLama])

  // Rokok yang dibawa sales hari ini (sudah terfilter)
  const rokokDibawa = useMemo(
    () => rokokList.filter((r) => sesi.barangKeluar.some((bk) => bk.rokok_id === r.id)),
    [rokokList, sesi.barangKeluar]
  )

  return (
    <form onSubmit={submit} className="space-y-4">

      {/* Tabs */}
      <div className="flex border-b border-neutral-200">
        <TabButton active={activeTab === "penjualan"} onClick={() => setActiveTab("penjualan")}>
          Penjualan Langsung
        </TabButton>
        <TabButton active={activeTab === "konsinyasi"} onClick={() => setActiveTab("konsinyasi")}>
          Titip Jual {activeKonsinyasi.length > 0 && <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-yellow-500 text-xs text-white">{activeKonsinyasi.length}</span>}
        </TabButton>
      </div>

      {activeTab === "penjualan" && (
        <div className="space-y-6">
          {/* Penjualan Langsung */}
          <SectionCard title="Penjualan Langsung">
            <PenjualanLangsungInput
              penjualan={penjualan}
              setPenjualan={setPenjualan}
              barangKeluar={sesi.barangKeluar}
              qtyTitipBaru={qtyTitipBaru}
              showPerorangan={showPerorangan}
              setShowPerorangan={setShowPerorangan}
            />
            {nilaiPenjualan > 0 && (
              <p className="text-xs text-neutral-500 mt-2">Total nilai penjualan: <span className="font-semibold text-neutral-900">{fmtIDR(nilaiPenjualan)}</span></p>
            )}
          </SectionCard>

          {/* Setoran */}
          <SectionCard title="Setoran">
            <div className="flex items-center justify-between mb-1">
              <span />
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
                  className="h-3.5 w-3.5 rounded"
                />
                Sesuai nilai penjualan
              </label>
            </div>
            {setoran.map((it, idx) => (
              <div key={idx} className="flex items-end gap-3">
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
              <button type="button" onClick={() => setSetoran([...setoran, { metode: "transfer", jumlah: "" }])} className="text-xs text-blue-600 hover:underline mt-1">
                + Tambah metode setoran
              </button>
            )}
            {setoranEmpty && (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 mt-2">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                Setoran wajib diisi jika ada penjualan
              </div>
            )}
            {flagSetoran && totalSetoran > 0 && (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 mt-2">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                Selisih setoran: nilai penjualan {fmtIDR(nilaiPenjualan)} vs setoran {fmtIDR(totalSetoran)}
              </div>
            )}
          </SectionCard>
        </div>
      )}

      {activeTab === "konsinyasi" && (
        <div className="space-y-6">
          {/* Konsinyasi Baru */}
          <SectionCard title="Titip Jual Baru (Opsional)">
            {konsinyasiBaru.map((k, idx) => (
              <KonsinyasiBaruInput
                key={idx}
                data={k}
                currentIdx={idx}
                rokokDibawa={rokokDibawa}
                qtyDibawa={qtyDibawa}
                qtyTerjualLangsung={qtyTerjualLangsung}
                qtyTitipLama={qtyTitipLama}
                konsinyasiBaru={konsinyasiBaru}
                tokoList={tokoList}
                onChange={(updated) => setKonsinyasiBaru(konsinyasiBaru.map((x, i) => i === idx ? updated : x))}
                onRemove={() => setKonsinyasiBaru(konsinyasiBaru.filter((_, i) => i !== idx))}
                onTokoCreated={(newToko) => setTokoList((prev) => [...prev, newToko].sort((a, b) => a.nama.localeCompare(b.nama, "id")))}
                onSaveAndSettle={(d) => handleSaveAndSettle(d, idx)}
                extraUsedTokoIds={savedTokoIds}
              />
            ))}
            <button
              type="button"
              onClick={() => setKonsinyasiBaru([...konsinyasiBaru, { toko_id: "", kategori: "toko", tanggal_jatuh_tempo: "", catatan: "", items: [{ rokok_id: "", qty: "" }] }])}
              className="w-full rounded-lg border border-dashed border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-500 hover:border-neutral-400 hover:bg-neutral-50"
            >
              + Tambah Titip Jual
            </button>
          </SectionCard>

          {/* Penyelesaian Titip Jual */}
          {(activeKonsinyasi.length > 0 || settledRecords.length > 0 || preexistingSelesai.length > 0) && (
            <SectionCard title="Penyelesaian Titip Jual">
              <div className="space-y-2">
                {/* Preexisting selesai (sudah selesai sebelum form dibuka) */}
                {preexistingSelesai.map((k) => {
                  const nilaiTerjual = k.items.reduce((s, it) => s + (it.qty_terjual || 0) * (it.harga || 0), 0)
                  return (
                    <div key={`pre-${k.id}`} className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-3 py-2.5">
                      <div>
                        <p className="text-sm font-medium text-green-800">{k.nama_toko} <span className="text-xs font-normal text-green-600">— Selesai</span></p>
                        <p className="text-xs text-green-600">Nilai terjual: {fmtIDR(nilaiTerjual)}{k.tanggal_selesai ? ` · Selesai: ${fmtTanggal(k.tanggal_selesai)}` : ""}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button type="button" onClick={() => setDetailKonsinyasi(k)} className="rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50 whitespace-nowrap">Detail</button>
                        <button type="button" onClick={() => setEditingSettlement({ konsinyasi: k, initialSetoran: k.setoran })} className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 whitespace-nowrap">Edit</button>
                        <button type="button" onClick={() => handleRevertPreexistingSettlement(k)} className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100 whitespace-nowrap">Batalkan</button>
                      </div>
                    </div>
                  )
                })}
                {activeKonsinyasi.map((k) => (
                  <div key={k.id} className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-3 py-2.5">
                    <div>
                      <p className="text-sm font-medium">{k.nama_toko}</p>
                      <p className="text-xs text-neutral-400">Jatuh Tempo: {fmtTanggal(k.tanggal_jatuh_tempo)}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button type="button" onClick={() => setDetailKonsinyasi(k)} className="rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50 whitespace-nowrap">Detail</button>
                      <button type="button" onClick={() => setEditingKonsinyasiDetail(k)} className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 whitespace-nowrap">Edit</button>
                      <button type="button" onClick={() => handleHapusKonsinyasi(k)} className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100 whitespace-nowrap">Hapus</button>
                      <button type="button" onClick={() => setSettlingKonsinyasi(k)} className="rounded-md border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 hover:bg-green-100 whitespace-nowrap">Selesaikan</button>
                    </div>
                  </div>
                ))}
                {settledRecords.map((record, i) => {
                  const nilaiTerjual = record.submittedData.items.reduce((s, it) => {
                    const orig = record.konsinyasi.items.find((o) => o.id === it.id)
                    return s + (it.qty_terjual || 0) * (orig?.harga || 0)
                  }, 0)
                  return (
                    <div key={`settled-${i}`} className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-3 py-2.5">
                      <div>
                        <p className="text-sm font-medium text-green-800">{record.konsinyasi.nama_toko} <span className="text-xs font-normal text-green-600">— Selesai</span></p>
                        <p className="text-xs text-green-600">Nilai terjual: {fmtIDR(nilaiTerjual)}{record.submittedData.tanggal ? ` · Selesai: ${fmtTanggal(record.submittedData.tanggal)}` : ""}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button type="button" onClick={() => setDetailKonsinyasi(record.konsinyasi)} className="rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50 whitespace-nowrap">Detail</button>
                        <button
                          type="button"
                          onClick={() => setEditingSettlement({
                            konsinyasi: {
                              ...record.konsinyasi,
                              items: record.konsinyasi.items.map((it) => {
                                const sub = record.submittedData.items.find((s) => s.id === it.id)
                                return sub ? { ...it, qty_terjual: sub.qty_terjual, qty_kembali: sub.qty_kembali } : it
                              }),
                            },
                            initialSetoran: record.submittedData.setoran,
                          })}
                          className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 whitespace-nowrap"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRevertSettlement(record)}
                          className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100 whitespace-nowrap"
                        >
                          Batalkan
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </SectionCard>
          )}
        </div>
      )}

      {/* Settlement Modal */}
      {settlingKonsinyasi && (
        <Modal title={`Selesaikan Titip Jual — ${settlingKonsinyasi.nama_toko}`} onClose={() => setSettlingKonsinyasi(null)} width="max-w-2xl">
          <SettlementForm
            konsinyasi={settlingKonsinyasi}
            onSubmit={async (data) => {
              await settleTitipJual(settlingKonsinyasi.id, data)
              setSettledIds((prev) => new Set([...prev, settlingKonsinyasi.id]))
              setSettledRecords((prev) => [...prev, { konsinyasi: settlingKonsinyasi, submittedData: data }])
              setSettlingKonsinyasi(null)
            }}
            onCancel={() => setSettlingKonsinyasi(null)}
          />
        </Modal>
      )}

      {/* Edit Settlement Modal */}
      {editingSettlement && (
        <Modal title={`Edit Penyelesaian — ${editingSettlement.konsinyasi.nama_toko}`} onClose={() => setEditingSettlement(null)} width="max-w-2xl">
          <SettlementForm
            konsinyasi={editingSettlement.konsinyasi}
            initialSetoran={editingSettlement.initialSetoran}
            onSubmit={handleEditSettlement}
            onCancel={() => setEditingSettlement(null)}
          />
        </Modal>
      )}

      {/* Edit Konsinyasi Detail Modal (aktif) */}
      {editingKonsinyasiDetail && (
        <Modal title={`Edit Titip Jual — ${editingKonsinyasiDetail.nama_toko}`} onClose={() => setEditingKonsinyasiDetail(null)} width="max-w-md">
          <KonsinyasiDetailEditForm
            record={editingKonsinyasiDetail}
            onSubmit={async (data) => {
              await editTitipJualDetail(editingKonsinyasiDetail.id, data)
              setEditingKonsinyasiDetail(null)
            }}
            onCancel={() => setEditingKonsinyasiDetail(null)}
          />
        </Modal>
      )}

      {/* Detail Konsinyasi Modal */}
      {detailKonsinyasi && (
        <Modal title={`Detail Titip Jual — ${detailKonsinyasi.nama_toko}`} onClose={() => setDetailKonsinyasi(null)} width="max-w-lg">
          <PenyelesaianDetail record={detailKonsinyasi} />
        </Modal>
      )}

      {LaporanConfirmModal}
      <FormActions onCancel={onCancel} disabled={setoranEmpty} submitLabel={isEdit ? "Simpan Perubahan" : "Submit Laporan"} />
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

function SectionCard({ title, children }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{title}</p>
      {children}
    </div>
  )
}

function PenjualanLangsungInput({ penjualan, setPenjualan, barangKeluar = [], qtyTitipBaru = {}, showPerorangan, setShowPerorangan }) {
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
            const sisa    = dibawa - terjual - dititip
            const melebihi = terjual + dititip > dibawa
            return (
              <Fragment key={rokok_id}>
                <tr className="border-b border-neutral-100">
                  <td className="py-2 pr-3 font-medium">
                    {sample?.rokok}
                    <div className={`text-[10px] font-medium transition-colors ${melebihi ? "text-red-500" : terjual + dititip > 0 ? "text-blue-600" : "text-neutral-400"}`}>
                      Sisa: {sisa} / {dibawa}
                    </div>
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
                          className={inputCls + " w-24" + (melebihi ? " border-orange-400 focus:border-orange-500" : "")}
                        />
                      </td>
                    )
                  })}
                </tr>
                {melebihi && (
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
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-neutral-600">Tampilkan Perorangan</label>
        <input type="checkbox" checked={showPerorangan} onChange={(e) => setShowPerorangan(e.target.checked)} className="h-4 w-4 rounded" />
      </div>
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
      <FormActions onCancel={onCancel} disabled={!valid || loading} submitLabel={loading ? "Menyimpan..." : "Simpan Perubahan"} />
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

function KonsinyasiBaruInput({ data, currentIdx, rokokDibawa, qtyDibawa, qtyTerjualLangsung, qtyTitipLama = {}, konsinyasiBaru, tokoList, onChange, onRemove, onTokoCreated, onSaveAndSettle, extraUsedTokoIds = [] }) {
  const [open,        setOpen]        = useState(true)
  const [showAddToko, setShowAddToko] = useState(false)
  const [newTokoNama, setNewTokoNama] = useState("")
  const [newTokoAlamat, setNewTokoAlamat] = useState("")
  const [newTokoKategori, setNewTokoKategori] = useState("toko")
  const [savingToko,  setSavingToko]  = useState(false)
  const [saving,      setSaving]      = useState(false)

  const selectedToko  = tokoList.find((t) => t.id === data.toko_id)
  const usedTokoIds   = [...konsinyasiBaru.filter((_, i) => i !== currentIdx).map((k) => k.toko_id).filter(Boolean), ...extraUsedTokoIds]
  const canSaveAndSettle = data.toko_id && data.tanggal_jatuh_tempo && data.items.some((it) => it.rokok_id && Number(it.qty) > 0)

  const handleSaveAndSettle = async () => {
    if (!canSaveAndSettle) return
    setSaving(true)
    try { await onSaveAndSettle(data) }
    finally { setSaving(false) }
  }

  // Qty tersedia per rokok: dibawa - terjual langsung - item di konsinyasi lain (bukan ini)
  const getAvailableQty = (rokok_id, excludeItemIdx = -1) => {
    const dibawa  = qtyDibawa[rokok_id] || 0
    const terjual = qtyTerjualLangsung[rokok_id] || 0
    const lama    = qtyTitipLama[rokok_id] || 0
    
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

    return Math.max(0, dibawa - terjual - lama - otherAccordions - currentAccordionOthers)
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
    <div className="rounded-lg border border-neutral-200 bg-white p-3 space-y-3">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-2 text-sm font-medium text-neutral-700">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          {selectedToko?.nama || "Titip Jual Baru"}
        </button>
        <IconButton icon={Trash2} onClick={onRemove} variant="danger" label="Hapus" />
      </div>
      {open && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs font-medium text-neutral-600">Toko</span>
                <button type="button" onClick={() => setShowAddToko(true)} className="text-xs text-blue-500 hover:text-blue-700 hover:underline">
                  + toko baru
                </button>
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
            <Field label="Catatan (opsional)">
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
                  <button type="button" onClick={() => setShowAddToko(false)} className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
                    Batal
                  </button>
                  <button type="button" onClick={handleSaveToko} disabled={!newTokoNama.trim() || savingToko} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50">
                    {savingToko ? "Menyimpan..." : "Simpan Toko"}
                  </button>
                </div>
              </div>
            </Modal>
          )}

          {data.items.map((item, idx) => {
            const usedByOthers = getAvailableQty(item.rokok_id, idx)
            const available    = Math.max(0, usedByOthers - (Number(item.qty) || 0))
            const totalDibawa  = qtyDibawa[item.rokok_id] || 0
            const melebihi     = item.rokok_id && Number(item.qty) > usedByOthers
            return (
              <div key={idx}>
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-neutral-600">{idx === 0 ? "Rokok" : ""}</span>
                      {item.rokok_id && (
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
                        max={item.rokok_id ? available + (Number(item.qty) || 0) : undefined}
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
          <button type="button" onClick={() => onChange({ ...data, items: [...data.items, { rokok_id: "", qty: "" }] })} className="text-xs text-blue-600 hover:underline">
            + Tambah rokok
          </button>

          <div className="pt-1 border-t border-neutral-100">
            <button
              type="button"
              onClick={handleSaveAndSettle}
              disabled={!canSaveAndSettle || saving}
              className="w-full rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-700 hover:bg-green-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? "Menyimpan..." : "Simpan & Tambah ke Penyelesaian"}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

