"use client"

import { useMemo, useState, Fragment } from "react"
import { useRouter } from "next/navigation"
import { Plus, Trash2, AlertCircle, ChevronDown, ChevronUp, Search, Download } from "lucide-react"
import { fmtIDR, fmtTanggal, filterByDateRange, defaultDateRange, sortByDateDesc } from "@/lib/utils"
import { createSesi, updateSesiPagi, submitLaporanSore, editLaporanSore, deleteSesi } from "@/actions/distribusi"
import { addToko } from "@/actions/toko"
import {
  Card, PageHeader, DateFilter, PrimaryButton, Field, FormActions,
  SearchableSelect, SelectInput, inputCls, RowActions, IconButton,
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

function exportToExcel(rows, rokokList, dateRange) {
  const XLSX = require("xlsx-js-style")

  // Kumpulkan semua item penjualan
  const allItems = []
  for (const sesi of rows) {
    if (!sesi.penjualan?.length) continue
    for (const it of sesi.penjualan) allItems.push({ tanggal: sesi.tanggal, ...it })
  }
  if (!allItems.length) { alert("Tidak ada data penjualan untuk diekspor."); return }

  // Produk unik (urut alfabet) & tanggal unik (urut asc)
  const products = [...new Set(allItems.map((it) => it.rokok))].sort((a, b) => a.localeCompare(b, "id"))
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
  const sTotal = { font: { bold: true }, fill: { fgColor: { rgb: "1F2937" } }, alignment: { horizontal: "center" }, border, font: { bold: true, color: { rgb: "FFFFFF" } } }
  const sTotalNum = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "1F2937" } }, alignment: { horizontal: "right" }, border }

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
        { v: d.penjualan, t: "n", s: sNum,  z: "#,##0" },
        { v: d.profit,    t: "n", s: sNum,  z: "#,##0" },
      ]
    }),
    // Baris TOTAL
    [
      { v: "",        s: sTotal },
      { v: "TOTAL",   s: sTotal },
      ...products.map((p) => ({ v: totalByProduct[p], t: "n", s: sTotal })),
      { v: totalPenjualan, t: "n", s: sTotalNum, z: "#,##0" },
      { v: totalProfit,    t: "n", s: sTotalNum, z: "#,##0" },
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

export default function DistribusiPage({ sesiList, rokokList, salesList, tokoList }) {
  const router  = useRouter()
  const [mode,    setMode]    = useState(null)
  const [editing, setEditing] = useState(null)
  const [detail,  setDetail]  = useState(null)
  const [laporanSesi,  setLaporanSesi]  = useState(null)
  const [editLaporan,  setEditLaporan]  = useState(null)
  const [dateRange,   setDateRange]   = useState(defaultDateRange("bulan_ini"))
  const [salesFilter, setSalesFilter] = useState("")
  const [search,      setSearch]      = useState("")

  const rows = useMemo(() => {
    let filtered = filterByDateRange(sesiList, dateRange)
    if (salesFilter) filtered = filtered.filter((r) => r.sales_id === salesFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      filtered = filtered.filter((r) => r.sales.toLowerCase().includes(q))
    }
    return sortByDateDesc(filtered)
  }, [sesiList, dateRange, salesFilter, search])

  const close = () => { setMode(null); setEditing(null) }

  const handleDelete = async (r) => {
    if (!window.confirm(`Hapus sesi ${r.sales} — ${fmtTanggal(r.tanggal)}?`)) return
    await deleteSesi(r.id)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Distribusi"
        subtitle="Sesi harian sales — barang keluar pagi & laporan sore."
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportToExcel(rows, rokokList, dateRange)}
              className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              <Download className="h-4 w-4" />
              Export Excel
            </button>
            <PrimaryButton onClick={() => { setEditing(null); setMode("add") }} icon={Plus}>
              Buat Sesi
            </PrimaryButton>
          </div>
        }
      />

      <div className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] lg:flex-row lg:items-center lg:gap-6">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-neutral-600 w-14">Waktu:</label>
          <DateFilter value={dateRange} onChange={setDateRange} />
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-neutral-600 w-10">Sales:</label>
          <div className="w-48">
            <SearchableSelect
              value={salesFilter}
              onChange={(e) => setSalesFilter(e.target.value)}
              placeholder="Semua Sales"
              options={[{ value: "", label: "Semua Sales" }, ...salesList.map((s) => ({ value: s.id, label: s.nama }))]}
            />
          </div>
        </div>
        <div className="relative flex-1 lg:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama sales..."
            className={inputCls + " pl-8 text-sm"}
          />
        </div>
      </div>

      <Card>
        <DataTable
          key={`${dateRange?.start}-${dateRange?.end}-${salesFilter}-${search}`}
          pageSize={PAGE_SIZE}
          rows={rows}
          empty="Belum ada sesi distribusi."
          columns={[
            { key: "no",      label: "No",      render: (_, idx) => idx + 1 },
            { key: "tanggal", label: "Tanggal", render: (r) => fmtTanggal(r.tanggal) },
            { key: "sales",   label: "Sales",   render: (r) => r.sales },
            { key: "status",  label: "Status",  render: (r) => <Badge label={r.status === "selesai" ? "Selesai" : "Aktif"} colorClass={STATUS_COLOR[r.status]} /> },
            {
              key: "keluar", label: "Barang Keluar",
              render: (r) => (
                <div className="space-y-0.5">
                  {r.barangKeluar.map((it, i) => (
                    <div key={i} className="text-xs text-neutral-700">{it.rokok} ×{it.qty}</div>
                  ))}
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
      return { rokok_id: r.id, nama: r.nama, stok: r.stok ?? 0, qty: existing ? String(existing.qty) : "" }
    })
  })
  const [error, setError] = useState("")

  const updateQty = (idx, val) => setItems(items.map((it, i) => i === idx ? { ...it, qty: val } : it))

  const validItems = items.filter((it) => Number(it.qty) > 0)
  const valid = tanggal && salesId && validItems.length >= 1

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
            {items.map((item, idx) => (
              <tr key={item.rokok_id} className="border-b border-neutral-100">
                <td className="py-1.5 font-medium">{item.nama}</td>
                <td className="py-1.5 text-right pr-3 text-xs text-neutral-400 tabular-nums">{item.stok}</td>
                <td className="py-1.5 text-right">
                  <input
                    type="number" min="0"
                    value={item.qty}
                    onChange={(e) => updateQty(idx, e.target.value)}
                    placeholder="—"
                    className={inputCls + " w-24 text-right"}
                  />
                </td>
              </tr>
            ))}
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
  const [konsinyasiBaru,       setKonsinyasiBaru]       = useState([])
  const [penyelesaianKonsinyasi, setPenyelesaianKonsinyasi] = useState([])
  const [showPerorangan, setShowPerorangan] = useState(false)

  const nilaiPenjualan = penjualan.reduce((s, it) => {
    const r = rokokList.find((r) => r.id === it.rokok_id)
    if (!r || !it.qty) return s
    return s + Number(it.qty) * r[`harga_${it.kategori}`]
  }, 0)
  const totalSetoran = setoran.reduce((s, it) => s + (Number(it.jumlah) || 0), 0)
  const flagSetoran  = nilaiPenjualan > 0 && totalSetoran !== nilaiPenjualan

  const submit = (e) => {
    e.preventDefault()
    const validPenjualan = penjualan.filter((it) => it.rokok_id && Number(it.qty) > 0)
    const validSetoran   = setoran.filter((it) => Number(it.jumlah) > 0)
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
    const validKembali = Object.entries(barangKembaliAuto)
      .filter(([_, qty]) => qty > 0)
      .map(([rokok_id, qty]) => ({ rokok_id, qty }))

    onSubmit({
      penjualan:             validPenjualan.map((it) => ({ rokok_id: it.rokok_id, kategori: it.kategori, qty: Number(it.qty) })),
      setoran:               validSetoran.map((it) => ({ metode: it.metode, jumlah: Number(it.jumlah) })),
      barangKembali:         validKembali,
      konsinyasiBaru:        validKonsinyasi,
      penyelesaianKonsinyasi,
    })
  }

  const hasKonsinyasiAktif = sesi.konsinyasi?.filter((k) => k.status === "aktif").length > 0

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
          Titip Jual {hasKonsinyasiAktif && <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-yellow-500 text-xs text-white">{sesi.konsinyasi.filter((k) => k.status === "aktif").length}</span>}
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
              showPerorangan={showPerorangan}
              setShowPerorangan={setShowPerorangan}
            />
            {nilaiPenjualan > 0 && (
              <p className="text-xs text-neutral-500 mt-2">Total nilai penjualan: <span className="font-semibold text-neutral-900">{fmtIDR(nilaiPenjualan)}</span></p>
            )}
          </SectionCard>

          {/* Setoran */}
          <SectionCard title="Setoran">
            {setoran.map((it, idx) => (
              <div key={idx} className="flex items-end gap-3">
                <div className="w-36">
                  <Field label={idx === 0 ? "Metode" : ""}>
                    <SelectInput value={it.metode} onChange={(e) => setSetoran(setoran.map((s, i) => i === idx ? { ...s, metode: e.target.value } : s))}>
                      <option value="cash">Cash</option>
                      <option value="transfer">Transfer</option>
                    </SelectInput>
                  </Field>
                </div>
                <div className="flex-1">
                  <Field label={idx === 0 ? "Jumlah" : ""}>
                    <input type="number" min="0" value={it.jumlah} onChange={(e) => setSetoran(setoran.map((s, i) => i === idx ? { ...s, jumlah: e.target.value } : s))} placeholder="0" className={inputCls} />
                  </Field>
                </div>
                {setoran.length > 1 && (
                  <div className="pb-1">
                    <IconButton icon={Trash2} onClick={() => setSetoran(setoran.filter((_, i) => i !== idx))} variant="danger" label="Hapus" />
                  </div>
                )}
              </div>
            ))}
            {setoran.length < 2 && (
              <button type="button" onClick={() => setSetoran([...setoran, { metode: "transfer", jumlah: "" }])} className="text-xs text-blue-600 hover:underline mt-1">
                + Tambah metode setoran
              </button>
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
                konsinyasiBaru={konsinyasiBaru}
                tokoList={tokoList}
                onChange={(updated) => setKonsinyasiBaru(konsinyasiBaru.map((x, i) => i === idx ? updated : x))}
                onRemove={() => setKonsinyasiBaru(konsinyasiBaru.filter((_, i) => i !== idx))}
                onTokoCreated={(newToko) => setTokoList((prev) => [...prev, newToko].sort((a, b) => a.nama.localeCompare(b.nama, "id")))}
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

          {/* Penyelesaian Konsinyasi */}
          {hasKonsinyasiAktif && (
            <SectionCard title="Penyelesaian Titip Jual">
              {sesi.konsinyasi.filter((k) => k.status === "aktif").map((k) => (
                <PenyelesaianKonsinyasiInput
                  key={k.id}
                  konsinyasi={k}
                  onChange={(data) => {
                    const exists = penyelesaianKonsinyasi.find((p) => p.konsinyasi_id === k.id)
                    if (data) {
                      if (exists) setPenyelesaianKonsinyasi(penyelesaianKonsinyasi.map((p) => p.konsinyasi_id === k.id ? data : p))
                      else setPenyelesaianKonsinyasi([...penyelesaianKonsinyasi, data])
                    } else {
                      setPenyelesaianKonsinyasi(penyelesaianKonsinyasi.filter((p) => p.konsinyasi_id !== k.id))
                    }
                  }}
                />
              ))}
            </SectionCard>
          )}
        </div>
      )}

      <FormActions onCancel={onCancel} submitLabel={isEdit ? "Simpan Perubahan" : "Submit Laporan"} />
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

function PenjualanLangsungInput({ penjualan, setPenjualan, barangKeluar = [], showPerorangan, setShowPerorangan }) {
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
            const melebihi = terjual > dibawa
            return (
              <Fragment key={rokok_id}>
                <tr className="border-b border-neutral-100">
                  <td className="py-2 pr-3 font-medium">
                    {sample?.rokok}
                    <span className="ml-1 font-normal text-neutral-400 text-xs">({dibawa})</span>
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
                        Total terjual ({terjual}) melebihi yang dibawa ({dibawa}) — selisih {terjual - dibawa} bungkus
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

function KonsinyasiBaruInput({ data, currentIdx, rokokDibawa, qtyDibawa, qtyTerjualLangsung, konsinyasiBaru, tokoList, onChange, onRemove, onTokoCreated }) {
  const [open,        setOpen]        = useState(true)
  const [showAddToko, setShowAddToko] = useState(false)
  const [newTokoNama, setNewTokoNama] = useState("")
  const [newTokoAlamat, setNewTokoAlamat] = useState("")
  const [newTokoKategori, setNewTokoKategori] = useState("toko")
  const [savingToko, setSavingToko]   = useState(false)

  const selectedToko = tokoList.find((t) => t.id === data.toko_id)

  // Qty tersedia per rokok: dibawa - terjual langsung - item di konsinyasi lain (bukan ini)
  const getAvailableQty = (rokok_id) => {
    const dibawa  = qtyDibawa[rokok_id] || 0
    const terjual = qtyTerjualLangsung[rokok_id] || 0
    const otherKonsinyasi = konsinyasiBaru
      .filter((_, i) => i !== currentIdx)
      .flatMap((k) => k.items)
      .filter((it) => it.rokok_id === rokok_id)
      .reduce((s, it) => s + (Number(it.qty) || 0), 0)
    return Math.max(0, dibawa - terjual - otherKonsinyasi)
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
              <SelectInput value={data.toko_id} onChange={(e) => {
                const t = tokoList.find((x) => x.id === e.target.value)
                onChange({ ...data, toko_id: e.target.value, kategori: t?.kategori || data.kategori })
              }}>
                <option value="">Pilih toko</option>
                {tokoList.filter((t) => t.aktif !== false).map((t) => (
                  <option key={t.id} value={t.id}>{t.nama} ({t.kategori})</option>
                ))}
              </SelectInput>
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
            const available = getAvailableQty(item.rokok_id)
            const melebihi  = item.rokok_id && Number(item.qty) > available
            return (
              <div key={idx}>
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <Field label={idx === 0 ? "Rokok" : ""}>
                      <SelectInput value={item.rokok_id} onChange={(e) => updateItem(idx, "rokok_id", e.target.value)}>
                        <option value="">Pilih rokok</option>
                        {rokokDibawa.filter((r) => r.aktif !== false && (r.id === item.rokok_id || !data.items.some((it, i) => i !== idx && it.rokok_id === r.id))).map((r) => {
                          const avail = getAvailableQty(r.id)
                          return (
                            <option key={r.id} value={r.id}>{r.nama} (tersedia: {avail})</option>
                          )
                        })}
                      </SelectInput>
                    </Field>
                  </div>
                  <div className="w-24">
                    <Field label={idx === 0 ? "Qty" : ""}>
                      <input
                        type="number" min="1"
                        max={item.rokok_id ? available + (Number(item.qty) || 0) : undefined}
                        value={item.qty}
                        onChange={(e) => updateItem(idx, "qty", e.target.value)}
                        placeholder="0"
                        className={inputCls + (melebihi ? " border-orange-400" : "")}
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
                    Qty melebihi yang tersedia ({available})
                  </div>
                )}
              </div>
            )
          })}
          <button type="button" onClick={() => onChange({ ...data, items: [...data.items, { rokok_id: "", qty: "" }] })} className="text-xs text-blue-600 hover:underline">
            + Tambah rokok
          </button>
        </div>
      )}
    </div>
  )
}

function PenyelesaianKonsinyasiInput({ konsinyasi, onChange }) {
  const [checked, setChecked]   = useState(false)
  const [items,   setItems]     = useState(konsinyasi.items.map((it) => ({ ...it, qty_terjual: it.qty_terjual || "", qty_kembali: it.qty_kembali || "" })))
  const [setoran, setSetoran]   = useState([{ metode: "cash", jumlah: "" }])

  const toggle = (val) => {
    setChecked(val)
    if (!val) {
      onChange(null)
    } else {
      onChange(buildPayload())
    }
  }

  const buildPayload = () => ({
    konsinyasi_id: konsinyasi.id,
    items: items.map((it) => ({
      id:          it.id,
      rokok_id:    it.rokok_id,
      qty_terjual: Number(it.qty_terjual) || 0,
      qty_kembali: Number(it.qty_kembali) || 0,
    })),
    setoran: setoran.filter((s) => Number(s.jumlah) > 0).map((s) => ({ metode: s.metode, jumlah: Number(s.jumlah) })),
  })

  const update = (newItems, newSetoran) => {
    if (checked) onChange({ konsinyasi_id: konsinyasi.id, items: newItems.map((it) => ({ id: it.id, rokok_id: it.rokok_id, qty_terjual: Number(it.qty_terjual) || 0, qty_kembali: Number(it.qty_kembali) || 0 })), setoran: newSetoran.filter((s) => Number(s.jumlah) > 0).map((s) => ({ metode: s.metode, jumlah: Number(s.jumlah) })) })
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-3 space-y-3">
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={checked} onChange={(e) => toggle(e.target.checked)} className="h-4 w-4 rounded" />
        <span className="font-medium text-sm">{konsinyasi.nama_toko}</span>
        <span className="text-xs text-neutral-400">— Jatuh Tempo: {fmtTanggal(konsinyasi.tanggal_jatuh_tempo)}</span>
      </label>
      {checked && (
        <div className="space-y-3 pl-6">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-neutral-200 text-neutral-500">
                <th className="pb-1.5 text-left">Rokok</th>
                <th className="pb-1.5 text-right">Keluar</th>
                <th className="pb-1.5 text-right">Terjual</th>
                <th className="pb-1.5 text-right">Kembali</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr key={idx} className="border-b border-neutral-100">
                  <td className="py-1.5">{it.rokok}</td>
                  <td className="py-1.5 text-right tabular-nums">{it.qty_keluar}</td>
                  <td className="py-1.5 text-right">
                    <input type="number" min="0" max={it.qty_keluar} value={it.qty_terjual} onChange={(e) => { const ni = items.map((x, i) => i === idx ? { ...x, qty_terjual: e.target.value } : x); setItems(ni); update(ni, setoran) }} className={inputCls + " w-20 text-right"} placeholder="0" />
                  </td>
                  <td className="py-1.5 text-right">
                    <input type="number" min="0" max={it.qty_keluar} value={it.qty_kembali} onChange={(e) => { const ni = items.map((x, i) => i === idx ? { ...x, qty_kembali: e.target.value } : x); setItems(ni); update(ni, setoran) }} className={inputCls + " w-20 text-right"} placeholder="0" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="space-y-2">
            <p className="text-xs font-medium text-neutral-500">Setoran</p>
            {setoran.map((st, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <SelectInput value={st.metode} onChange={(e) => { const ns = setoran.map((s, i) => i === idx ? { ...s, metode: e.target.value } : s); setSetoran(ns); update(items, ns) }} className="w-32">
                  <option value="cash">Cash</option>
                  <option value="transfer">Transfer</option>
                </SelectInput>
                <input type="number" min="0" value={st.jumlah} onChange={(e) => { const ns = setoran.map((s, i) => i === idx ? { ...s, jumlah: e.target.value } : s); setSetoran(ns); update(items, ns) }} placeholder="0" className={inputCls + " flex-1"} />
                {setoran.length > 1 && <IconButton icon={Trash2} onClick={() => { const ns = setoran.filter((_, i) => i !== idx); setSetoran(ns); update(items, ns) }} variant="danger" label="Hapus" />}
              </div>
            ))}
            {setoran.length < 2 && (
              <button type="button" onClick={() => { const ns = [...setoran, { metode: "transfer", jumlah: "" }]; setSetoran(ns); update(items, ns) }} className="text-xs text-blue-600 hover:underline">
                + Tambah metode
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
