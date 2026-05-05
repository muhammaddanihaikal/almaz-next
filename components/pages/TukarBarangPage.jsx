"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowUp } from "lucide-react"
import { fmtTanggal, filterByDateRange, defaultDateRange, sortByDateDesc, fmtIDR } from "@/lib/utils"
import { deleteTukarBarang, selesaikanTukarBarang } from "@/actions/tukar-barang"
import {
  Card, PageHeader, DateFilter, Field, SelectInput, SearchableSelect,
  RowActions, useConfirmWithReason, Button, MoneyInput, IconButton
} from "@/components/ui"
import DataTable from "@/components/DataTable"
import Modal from "@/components/Modal"
import RokokItemsTooltip from "@/components/RokokItemsTooltip"

const PAGE_SIZE = 10

const STATUS_LABELS = {
  aktif:   { label: "Aktif",   cls: "bg-yellow-100 text-yellow-700" },
  selesai: { label: "Selesai", cls: "bg-green-100 text-green-700"   },
}

function StatusBadge({ status }) {
  const s = STATUS_LABELS[status] || { label: status, cls: "bg-neutral-100 text-neutral-700" }
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>
}

function SelisihBadge({ selisih }) {
  if (!selisih || selisih === 0) return <span className="text-xs text-neutral-400">—</span>
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
      <ArrowUp className="h-3 w-3" />+{fmtIDR(selisih)}
    </span>
  )
}

export default function TukarBarangPage({ role, list, salesList, rokokList }) {
  const router = useRouter()
  const { confirmWithReason, ConfirmWithReasonModal } = useConfirmWithReason()
  const [detail, setDetail] = useState(null)
  const [dateRange, setDateRange] = useState(defaultDateRange("minggu_ini"))
  const [statusFilter, setStatusFilter] = useState("aktif")
  const [salesFilter, setSalesFilter]   = useState("")
  const [deletingId, setDeletingId]     = useState(null)
  const [selesaiModal, setSelesaiModal] = useState(null)

  const { rows, countAktif, countSelesai } = useMemo(() => {
    const listAktif   = list.filter(r => r.status === "aktif")
    const listSelesai = list.filter(r => r.status === "selesai")

    // Filtered Selesai list based on date
    const filteredSelesai = filterByDateRange(listSelesai, dateRange)

    // Current displayed rows
    let currentRows = statusFilter === "aktif" ? listAktif : filteredSelesai

    // Apply sales filter if any
    if (salesFilter) {
      currentRows = currentRows.filter(r => r.sales_id === salesFilter)
    }

    return {
      rows: sortByDateDesc(currentRows),
      countAktif: listAktif.length,
      countSelesai: filteredSelesai.length
    }
  }, [list, dateRange, statusFilter, salesFilter])

  const handleDelete = async (r) => {
    const result = await confirmWithReason(
      "Hapus data tukar barang ini? Stok akan ikut dibatalkan.",
      { title: "Hapus Tukar Barang", variant: "danger", confirmLabel: "Ya, Hapus" }
    )
    if (!result) return
    setDeletingId(r.id)
    try {
      await deleteTukarBarang(r.id, result)
      router.refresh()
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tukar Barang"
        subtitle={`Tracking transaksi tukar antara toko & sales. Input dilakukan dari Laporan Sore di halaman Distribusi.${countAktif > 0 ? ` — ${countAktif} tukar aktif.` : ""}`}
      />

      <div className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] lg:flex-row lg:items-end lg:gap-4">
        <Field label="Rentang Waktu" className="flex-1">
          <div className="w-full">
            <DateFilter value={dateRange} onChange={setDateRange} />
          </div>
        </Field>
        <Field label="Sales" className="flex-1">
          <SearchableSelect
            value={salesFilter}
            onChange={(e) => setSalesFilter(e.target.value)}
            placeholder="Semua Sales"
            options={[{ value: "", label: "Semua Sales" }, ...salesList.map((s) => ({ value: s.id, label: s.nama }))]}
          />
        </Field>
      </div>

      <Card>
        {/* Tabs */}
        <div className="flex border-b border-neutral-200 -mx-4 -mt-4 px-4 mb-4">
          <button
            onClick={() => setStatusFilter("aktif")}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${
              statusFilter === "aktif" || statusFilter === ""
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-neutral-500 hover:text-neutral-700"
            }`}
          >
            Aktif
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-yellow-500 px-1.5 text-xs font-semibold text-white">{countAktif}</span>
          </button>
          <button
            onClick={() => setStatusFilter("selesai")}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${
              statusFilter === "selesai"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-neutral-500 hover:text-neutral-700"
            }`}
          >
            Selesai
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-green-600 px-1.5 text-xs font-semibold text-white">
              {countSelesai}
            </span>
          </button>
        </div>

        <DataTable
          key={`${dateRange?.start}-${dateRange?.end}-${statusFilter}-${salesFilter}`}
          pageSize={PAGE_SIZE}
          rows={rows}
          empty={dateRange?.start ? `Tidak ada tukar barang dari ${fmtTanggal(dateRange.start)} s/d ${fmtTanggal(dateRange.end)}.` : "Belum ada tukar barang."}
          columns={statusFilter === "aktif" ? [
            { key: "no",      label: "No",     render: (_, idx) => idx + 1 },
            { key: "tanggal", label: "Tanggal Buat", render: (r) => fmtTanggal(r.tanggal) },
            { key: "sales",   label: "Sales",  render: (r) => r.nama_sales },
            { key: "kategori", label: "Kategori", render: (r) => <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${r.kategori === "grosir" ? "bg-violet-100 text-violet-700" : "bg-blue-100 text-blue-700"}`}>{r.kategori}</span> },
            { key: "masuk",   label: "Dari Toko", render: (r) => <RokokItemsTooltip items={r.itemsMasuk} /> },
            { key: "selisih", label: "Selisih", align: "right", render: (r) => <SelisihBadge selisih={r.selisih_uang} /> },
            { key: "actions", label: "", align: "right", render: (r) => (
              <div className="flex items-center justify-end gap-1.5">
                {role !== "staff" && (
                  <Button size="sm" variant="ghost" className="border border-green-200 bg-green-50 text-green-700 hover:bg-green-100" onClick={() => setSelesaiModal(r)}>
                    Selesaikan
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100" onClick={() => setDetail(r)}>
                  Detail
                </Button>
                {role !== "staff" && (
                  <Button size="sm" variant="ghost" className="border border-red-200 bg-red-50 text-red-700 hover:bg-red-100" onClick={() => handleDelete(r)} disabled={deletingId === r.id}>
                    {deletingId === r.id ? "Menghapus..." : "Hapus"}
                  </Button>
                )}
              </div>
            )},
          ] : [
            { key: "no",      label: "No",     render: (_, idx) => idx + 1 },
            { key: "tanggal", label: "Tanggal Buat", render: (r) => fmtTanggal(r.tanggal) },
            { key: "tanggal_selesai", label: "Tanggal Selesai", render: (r) => r.tanggal_selesai ? fmtTanggal(r.tanggal_selesai) : <span className="text-neutral-400">—</span> },
            { key: "sales",   label: "Sales",  render: (r) => r.nama_sales },
            { key: "kategori", label: "Kategori", render: (r) => <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${r.kategori === "grosir" ? "bg-violet-100 text-violet-700" : "bg-blue-100 text-blue-700"}`}>{r.kategori}</span> },
            { key: "masuk",   label: "Dari Toko", render: (r) => <RokokItemsTooltip items={r.itemsMasuk} /> },
            { key: "keluar",  label: "Pengganti", render: (r) => <RokokItemsTooltip items={r.itemsKeluar} /> },
            { key: "selisih", label: "Selisih", align: "right", render: (r) => <SelisihBadge selisih={r.selisih_uang} /> },
            { key: "actions", label: "", align: "right", render: (r) => (
              <div className="flex items-center justify-end gap-1.5">
                <Button size="sm" variant="ghost" className="border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100" onClick={() => setDetail(r)}>
                  Detail
                </Button>
                {role !== "staff" && (
                  <Button size="sm" variant="ghost" className="border border-red-200 bg-red-50 text-red-700 hover:bg-red-100" onClick={() => handleDelete(r)} disabled={deletingId === r.id}>
                    {deletingId === r.id ? "Menghapus..." : "Hapus"}
                  </Button>
                )}
              </div>
            )},
          ]}
        />
      </Card>

      {detail && (
        <Modal title="Detail Tukar Barang" onClose={() => setDetail(null)} width="max-w-4xl">
          <TukarDetail record={detail} />
        </Modal>
      )}
      {selesaiModal && (
        <Modal title="Selesaikan Tukar Barang" onClose={() => setSelesaiModal(null)} width="max-w-3xl">
          <SelesaikanTukarForm 
            record={selesaiModal} 
            rokokList={rokokList} 
            onClose={() => setSelesaiModal(null)}
            onSuccess={() => {
              setSelesaiModal(null)
              router.refresh()
            }}
          />
        </Modal>
      )}
      {ConfirmWithReasonModal}
    </div>
  )
}

function TukarDetail({ record }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div><p className="text-xs text-neutral-500">Tanggal Buat</p><p className="font-medium">{fmtTanggal(record.tanggal)}</p></div>
        <div><p className="text-xs text-neutral-500">Tanggal Selesai</p><p className="font-medium">{record.tanggal_selesai ? fmtTanggal(record.tanggal_selesai) : "—"}</p></div>
        <div><p className="text-xs text-neutral-500">Sales</p><p className="font-medium">{record.nama_sales}</p></div>
        <div><p className="text-xs text-neutral-500">Status</p><StatusBadge status={record.status} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div><p className="text-xs text-neutral-500">Selisih</p><SelisihBadge selisih={record.selisih_uang} /></div>
      </div>
      {record.catatan && (
        <div className="text-sm">
          <p className="text-xs text-neutral-500">Catatan</p>
          <p className="font-medium">{record.catatan}</p>
        </div>
      )}

      <ItemsTable title="Rokok dari Toko (kembalian)" items={record.itemsMasuk} total={record.totalMasuk} />
      <ItemsTable title="Rokok Pengganti dari Sales" items={record.itemsKeluar} total={record.totalKeluar} />

      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-neutral-600">Nilai pengganti − Nilai kembalian</span>
          <span className="font-semibold tabular-nums">{fmtIDR(record.totalKeluar)} − {fmtIDR(record.totalMasuk)}</span>
        </div>
        <div className="mt-1 flex items-center justify-between border-t border-neutral-200 pt-1">
          <span className="font-semibold text-neutral-700">Selisih (toko bayar tambahan)</span>
          <span className="font-bold tabular-nums">{record.selisih_uang === 0 ? "Setara" : fmtIDR(record.selisih_uang)}</span>
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          {record.selisih_uang > 0 && "Toko bayar tambahan ke sales — dicatat sebagai pemasukan."}
          {record.selisih_uang === 0 && "Nilai setara, tidak ada pertukaran uang."}
        </p>
      </div>
    </div>
  )
}

function ItemsTable({ title, items, total }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">{title}</p>
      <div className="overflow-hidden rounded-lg border border-neutral-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50 text-xs font-medium uppercase tracking-wide text-neutral-500">
              <th className="px-3 py-2 text-left">Rokok</th>
              <th className="px-3 py-2 text-right">Qty</th>
              <th className="px-3 py-2 text-right">Harga</th>
              <th className="px-3 py-2 text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} className="border-b border-neutral-100">
                <td className="px-3 py-2.5">{it.rokok}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{it.qty}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmtIDR(it.harga_satuan)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmtIDR(it.qty * it.harga_satuan)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-neutral-200 bg-neutral-50">
              <td className="px-3 py-2.5 text-xs font-semibold text-neutral-500" colSpan={3}>Total</td>
              <td className="px-3 py-2.5 text-right text-xs font-semibold tabular-nums">{fmtIDR(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SelesaikanTukarForm({ record, rokokList, onClose, onSuccess }) {
  const [itemsKeluar, setItemsKeluar] = useState([{ rokok_id: "", qty: "", harga_satuan: "" }])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const hargaDefault = (rokok_id) => {
    const rokok = rokokList.find(r => r.id === rokok_id)
    if (!rokok) return 0
    return rokok.harga_toko || rokok.harga_standar
  }

  const addRow = () => setItemsKeluar([...itemsKeluar, { rokok_id: "", qty: "", harga_satuan: "" }])
  const removeRow = (idx) => setItemsKeluar(itemsKeluar.filter((_, i) => i !== idx))
  const updateRow = (idx, key, val) => {
    setItemsKeluar(itemsKeluar.map((it, i) => i === idx ? { ...it, [key]: val } : it))
  }
  const updateRokok = (idx, rokok_id) => {
    const standar = hargaDefault(rokok_id)
    setItemsKeluar(itemsKeluar.map((it, i) => i === idx ? { ...it, rokok_id, harga_satuan: it.harga_satuan || String(standar) } : it))
  }

  const totalKeluar = itemsKeluar.reduce((s, it) => s + Number(it.qty || 0) * Number(it.harga_satuan || 0), 0)
  const selisih = totalKeluar - record.totalMasuk
  const invalid = selisih < 0
  const isFormEmpty = !itemsKeluar.some(it => it.rokok_id && Number(it.qty) > 0)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (invalid) {
      setError("Nilai barang pengganti harus lebih besar atau sama dengan nilai kembalian.")
      return
    }
    setLoading(true)
    setError(null)
    try {
      await selesaikanTukarBarang(record.id, itemsKeluar)
      onSuccess()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const inputCls = "w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10"

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 border border-red-200">
          {error}
        </div>
      )}

      <div>
        <h4 className="text-sm font-semibold mb-2">1. Barang Return (dari Toko)</h4>
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
          <ul className="space-y-1 text-sm text-neutral-700">
            {record.itemsMasuk.map((it, i) => (
              <li key={i} className="flex justify-between">
                <span>{it.rokok} ×{it.qty} ({fmtIDR(it.harga_satuan)})</span>
                <span className="tabular-nums">{fmtIDR(it.qty * it.harga_satuan)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 pt-2 border-t border-neutral-200 flex justify-between font-medium">
            <span>Total Kembalian</span>
            <span className="tabular-nums">{fmtIDR(record.totalMasuk)}</span>
          </div>
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold mb-2">2. Input Barang Pengganti (ke Toko)</h4>
        <div className="space-y-2">
          {itemsKeluar.map((item, rowIdx) => {
            const selectedIds = itemsKeluar.map((x) => x.rokok_id).filter(Boolean)
            const opts = rokokList.filter((r) => r.aktif !== false && (!selectedIds.includes(r.id) || r.id === item.rokok_id))
            const standar = hargaDefault(item.rokok_id)
            
            return (
              <div key={rowIdx} className="grid grid-cols-12 items-end gap-2">
                <div className="col-span-12 sm:col-span-5">
                  <SelectInput value={item.rokok_id} onChange={(e) => updateRokok(rowIdx, e.target.value)}>
                    <option value="">Pilih rokok</option>
                    {opts.map((r) => <option key={r.id} value={r.id}>{r.nama}</option>)}
                  </SelectInput>
                </div>
                <div className="col-span-3 sm:col-span-2">
                  <input type="number" min="1" value={item.qty} disabled={!item.rokok_id}
                    onChange={(e) => updateRow(rowIdx, "qty", e.target.value)}
                    placeholder="Qty" className={inputCls + (!item.rokok_id ? " bg-neutral-50 opacity-50" : "")} />
                </div>
                <div className="col-span-7 sm:col-span-4">
                  <MoneyInput value={item.harga_satuan} disabled={!item.rokok_id}
                    onChange={(v) => updateRow(rowIdx, "harga_satuan", v)}
                    className={inputCls + (!item.rokok_id ? " bg-neutral-50 opacity-50" : "")}
                    placeholder={standar ? `Standar ${standar.toLocaleString("id-ID")}` : "Harga"} />
                </div>
                <div className="col-span-2 sm:col-span-1 flex justify-end">
                  {itemsKeluar.length > 1 && (
                    <IconButton icon={Trash2} onClick={() => removeRow(rowIdx)} variant="danger" label="Hapus" />
                  )}
                </div>
              </div>
            )
          })}
          <Button type="button" variant="ghost" size="sm" onClick={addRow} className="text-blue-600 hover:bg-blue-50">
            + Tambah baris
          </Button>
        </div>
      </div>

      <div className="rounded border border-neutral-300 bg-neutral-50 p-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-neutral-600">Nilai pengganti − Nilai kembalian</span>
          <span className="font-medium tabular-nums text-xs">{fmtIDR(totalKeluar)} − {fmtIDR(record.totalMasuk)}</span>
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="font-semibold">Selisih (toko bayar tambahan)</span>
          <span className={`font-bold tabular-nums ${invalid ? "text-red-600" : selisih > 0 ? "text-emerald-700" : "text-neutral-700"}`}>
            {fmtIDR(Math.abs(selisih))}
          </span>
        </div>
      </div>

      <div className="flex justify-end gap-3 border-t border-neutral-200 pt-4">
        <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
        <Button type="submit" disabled={loading || invalid || isFormEmpty} loading={loading} className="bg-green-600 hover:bg-green-700 text-white border-green-600">
          Selesaikan Tukar
        </Button>
      </div>
    </form>
  )
}
