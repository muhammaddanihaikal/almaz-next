"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Trash2 } from "lucide-react"
import { fmtTanggal, filterByDateRange, defaultDateRange, sortByDateDesc, downloadExcel } from "@/lib/utils"
import { addRetur, updateRetur, deleteRetur } from "@/actions/retur"
import { Card, PageHeader, DateFilter, DownloadButton, PrimaryButton, Field, FormActions, SelectInput, SearchableSelect, inputCls, RowActions, IconButton } from "@/components/ui"
import DataTable from "@/components/DataTable"
import Modal from "@/components/Modal"

const PAGE_SIZE = 10

const TIPE_COLOR = {
  Toko:       "bg-blue-100 text-blue-700",
  Grosir:     "bg-violet-100 text-violet-700",
  Perorangan: "bg-amber-100 text-amber-700",
}

function TipeBadge({ tipe }) {
  if (!tipe) return <span className="text-neutral-400">—</span>
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TIPE_COLOR[tipe] || "bg-neutral-100 text-neutral-600"}`}>
      {tipe}
    </span>
  )
}

export default function ReturPage({ retur, rokokList, tokoList, salesList }) {
  const router = useRouter()
  const [mode, setMode] = useState(null)
  const [editing, setEditing] = useState(null)
  const [detail, setDetail] = useState(null)
  const [dateRange, setDateRange] = useState(defaultDateRange("bulan_ini"))
  const [tokoFilter, setTokoFilter] = useState("")
  const [salesFilter, setSalesFilter] = useState("")

  const rows = useMemo(() => {
    let filtered = filterByDateRange(retur, dateRange)
    if (tokoFilter) filtered = filtered.filter((r) => r.toko_id === tokoFilter)
    if (salesFilter) filtered = filtered.filter((r) => r.sales_id === salesFilter)
    return sortByDateDesc(filtered)
  }, [retur, dateRange, tokoFilter, salesFilter])

  const handleDownload = () => {
    const label = dateRange?.start ? `${dateRange.start}_${dateRange.end}` : "semua-waktu"
    let no = 0
    const flat = rows.flatMap((r) =>
      r.items.map((it) => {
        no++
        return { no, tanggal: r.tanggal, toko: r.toko || "—", tipe_penjualan: r.tipe_penjualan || "", sales: r.sales || "", rokok: it.rokok, qty: it.qty, alasan: r.alasan || "" }
      })
    )
    const totalQty = flat.reduce((s, r) => s + r.qty, 0)
    const periodeLabel = dateRange?.start ? `${fmtTanggal(dateRange.start)} s/d ${fmtTanggal(dateRange.end)}` : "Semua Waktu"
    downloadExcel(flat, `retur-${label}`, [
      { label: "No",             value: (r) => r.no },
      { label: "Tanggal",        value: (r) => r.tanggal },
      { label: "Toko",           value: (r) => r.toko },
      { label: "Tipe Penjualan", value: (r) => r.tipe_penjualan },
      { label: "Sales",          value: (r) => r.sales },
      { label: "Rokok",          value: (r) => r.rokok },
      { label: "Qty",            value: (r) => r.qty },
      { label: "Alasan",         value: (r) => r.alasan },
    ], [["Laporan Retur"], ["Periode", periodeLabel], ["Total Transaksi", `${rows.length} transaksi`], ["Total Qty Retur", totalQty]])
  }

  const close = () => { setMode(null); setEditing(null) }

  const handleDelete = async (r) => {
    if (!window.confirm(`Hapus retur dari "${r.toko || "Perorangan"}"?`)) return
    await deleteRetur(r.id)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Retur"
        subtitle={`Daftar barang yang dikembalikan dari toko${dateRange?.start ? ` — ${fmtTanggal(dateRange.start)} s/d ${fmtTanggal(dateRange.end)}` : " — semua waktu"}.`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <DownloadButton onClick={handleDownload} disabled={!rows.length} />
            <PrimaryButton onClick={() => { setEditing(null); setMode("add") }} icon={Plus}>Input Retur</PrimaryButton>
          </div>
        }
      />

      <div className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] lg:flex-row lg:flex-wrap lg:items-center lg:gap-6">
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
          <label className="text-sm font-medium text-neutral-600 sm:w-14">Waktu:</label>
          <DateFilter value={dateRange} onChange={setDateRange} />
        </div>
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
          <label className="text-sm font-medium text-neutral-600 sm:w-10">Toko:</label>
          <div className="w-full sm:w-56">
            <SearchableSelect value={tokoFilter} onChange={(e) => setTokoFilter(e.target.value)} placeholder="Semua Toko" options={[{ value: "", label: "Semua Toko" }, ...tokoList.map((t) => ({ value: t.id, label: t.nama }))]} />
          </div>
        </div>
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
          <label className="text-sm font-medium text-neutral-600 sm:w-10">Sales:</label>
          <div className="w-full sm:w-48">
            <SearchableSelect value={salesFilter} onChange={(e) => setSalesFilter(e.target.value)} placeholder="Semua Sales" options={[{ value: "", label: "Semua Sales" }, ...salesList.map((s) => ({ value: s.id, label: s.nama }))]} />
          </div>
        </div>
      </div>

      <Card>
        <DataTable
          key={`${dateRange?.start}-${dateRange?.end}-${tokoFilter}-${salesFilter}`}
          pageSize={PAGE_SIZE}
          rows={rows}
          empty={dateRange?.start ? `Tidak ada retur dari ${fmtTanggal(dateRange.start)} s/d ${fmtTanggal(dateRange.end)}.` : "Belum ada retur."}
          columns={[
            { key: "no",      label: "No",      render: (_, idx) => idx + 1 },
            { key: "tanggal", label: "Tanggal", render: (r) => fmtTanggal(r.tanggal) },
            { key: "toko",    label: "Toko",    render: (r) => r.toko || <span className="text-neutral-400">Perorangan</span> },
            { key: "tipe",    label: "Tipe",    render: (r) => <TipeBadge tipe={r.tipe_penjualan} /> },
            { key: "sales",   label: "Sales",   render: (r) => r.sales || <span className="text-neutral-400">—</span> },
            { key: "items",   label: "Barang Retur", render: (r) => (
              <div className="space-y-0.5">
                {r.items.map((item, i) => <div key={i} className="text-xs text-neutral-700">{i + 1}. {item.rokok} ×{item.qty}</div>)}
              </div>
            )},
            { key: "alasan",    label: "Alasan",    render: (r) => <span className="text-sm text-neutral-500">{r.alasan || "—"}</span> },
            { key: "total_qty", label: "Total Qty", align: "right", render: (r) => r.items.reduce((s, it) => s + it.qty, 0) },
            { key: "actions", label: "", align: "right", render: (r) => (
              <RowActions
                onDetail={() => setDetail(r)}
                onEdit={() => { setEditing(r); setMode("edit") }}
                onDelete={() => handleDelete(r)}
              />
            )},
          ]}
        />
      </Card>

      {detail && (
        <Modal title="Detail Retur" onClose={() => setDetail(null)} width="max-w-4xl">
          <ReturDetail record={detail} />
        </Modal>
      )}

      {mode && (
        <Modal title={mode === "add" ? "Input Retur" : "Edit Retur"} onClose={close} width="max-w-4xl">
          <ReturForm
            initial={editing}
            existing={retur}
            rokokList={rokokList}
            tokoList={tokoList}
            salesList={salesList}
            onSubmit={async (data) => {
              if (mode === "add") await addRetur(data)
              else await updateRetur(editing.id, data)
              close()
              router.refresh()
            }}
            onCancel={close}
          />
        </Modal>
      )}
    </div>
  )
}

function ReturDetail({ record }) {
  const totalQty = record.items.reduce((s, it) => s + it.qty, 0)
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div><p className="text-xs text-neutral-500">Tanggal</p><p className="font-medium">{fmtTanggal(record.tanggal)}</p></div>
        <div><p className="text-xs text-neutral-500">Toko</p><p className="font-medium">{record.toko || "Perorangan"}</p></div>
        {record.tipe_penjualan && <div><p className="text-xs text-neutral-500">Tipe Penjualan</p><TipeBadge tipe={record.tipe_penjualan} /></div>}
        {record.sales && <div><p className="text-xs text-neutral-500">Sales</p><p className="font-medium">{record.sales}</p></div>}
      </div>
      {record.alasan && <div className="text-sm"><p className="text-xs text-neutral-500">Alasan</p><p className="font-medium">{record.alasan}</p></div>}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">Daftar Barang Retur</p>
        <div className="overflow-hidden rounded-lg border border-neutral-200">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-neutral-200 bg-neutral-50 text-xs font-medium uppercase tracking-wide text-neutral-500"><th className="px-3 py-2 text-left">Rokok</th><th className="px-3 py-2 text-right">Qty</th></tr></thead>
            <tbody>
              {record.items.map((item, i) => (
                <tr key={i} className="border-b border-neutral-100">
                  <td className="px-3 py-2.5">{item.rokok}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{item.qty}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-neutral-200 bg-neutral-50">
                <td className="px-3 py-2.5 text-xs font-semibold text-neutral-500">Total</td>
                <td className="px-3 py-2.5 text-right text-xs font-semibold text-neutral-900 tabular-nums">{totalQty}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function ReturForm({ initial, existing, rokokList, tokoList, salesList, onSubmit, onCancel }) {
  const today = new Date().toISOString().slice(0, 10)
  const [tanggal, setTanggal]             = useState(initial?.tanggal || today)
  const [tipePenjualan, setTipePenjualan] = useState(initial?.tipe_penjualan || "")
  const [tokoId, setTokoId]               = useState(initial?.tipe_penjualan === "Perorangan" ? "" : (initial?.toko_id || ""))
  const [salesId, setSalesId]             = useState(initial?.sales_id || "")
  const [alasan, setAlasan]               = useState(initial?.alasan || "")
  const [items, setItems] = useState(
    initial
      ? initial.items.map((it) => ({ rokok_id: it.rokok_id, qty: it.qty }))
      : [{ rokok_id: "", qty: "" }, { rokok_id: "", qty: "" }]
  )

  const addItem    = () => setItems([...items, { rokok_id: "", qty: "" }])
  const removeItem = (idx) => setItems(items.filter((_, i) => i !== idx))
  const updateItem = (idx, field, val) => setItems(items.map((item, i) => (i === idx ? { ...item, [field]: val } : item)))

  const isDuplicate =
    tipePenjualan !== "Perorangan" && tanggal && tokoId &&
    (existing || []).some((r) => r.tanggal === tanggal && r.toko_id === tokoId && r.id !== initial?.id)

  const validItems = items.filter((it) => it.rokok_id && Number(it.qty) > 0)
  const valid = !isDuplicate && tanggal && (tipePenjualan === "Perorangan" || !!tokoId) && !!tipePenjualan && !!salesId && alasan.trim().length > 0 && validItems.length > 0

  const submit = (e) => {
    e.preventDefault()
    if (!valid) return
    onSubmit({
      tanggal,
      toko_id: tipePenjualan === "Perorangan" ? null : tokoId,
      tipe_penjualan: tipePenjualan,
      sales_id: salesId,
      alasan: alasan.trim(),
      items: validItems.map((it) => ({ rokok_id: it.rokok_id, qty: Number(it.qty) })),
    })
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Tanggal">
          <input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} className={inputCls} required />
        </Field>
        <Field label="Tipe Penjualan">
          <SelectInput value={tipePenjualan} onChange={(e) => { setTipePenjualan(e.target.value); setTokoId("") }}>
            <option value="">Pilih Tipe Penjualan</option>
            <option value="Toko">Toko</option>
            <option value="Grosir">Grosir</option>
            <option value="Perorangan">Perorangan</option>
          </SelectInput>
        </Field>
      </div>

      <div className={`space-y-4${!tipePenjualan ? " pointer-events-none opacity-50 select-none" : ""}`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {tipePenjualan !== "Perorangan" ? (
            <Field label="Toko">
              <SearchableSelect value={tokoId} onChange={(e) => setTokoId(e.target.value)} placeholder="Pilih toko" disabled={!tipePenjualan}
                options={tokoList.filter((t) => t.aktif !== false && t.tipe_harga === tipePenjualan.toLowerCase()).map((t) => ({ value: t.id, label: t.nama }))} />
              {isDuplicate && <p className="mt-1 text-xs text-red-600">Sudah ada retur untuk toko ini pada tanggal yang sama.</p>}
            </Field>
          ) : (
            <div className="flex flex-col justify-end">
              <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                <TipeBadge tipe="Perorangan" />
                <span className="text-sm font-medium text-amber-700">Retur langsung dari perorangan</span>
              </div>
            </div>
          )}
          <Field label="Sales">
            <SearchableSelect value={salesId} onChange={(e) => setSalesId(e.target.value)} placeholder="Pilih sales"
              options={[{ value: "", label: "Pilih sales" }, ...salesList.filter((s) => s.aktif !== false).map((s) => ({ value: s.id, label: s.nama }))]} />
          </Field>
        </div>

        <div className="space-y-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Daftar Barang Retur</span>
          {items.map((item, idx) => (
            <div key={idx} className="flex items-end gap-3">
              <div className="flex-1">
                <Field label={idx === 0 ? "Rokok" : ""}>
                  <SelectInput value={item.rokok_id} onChange={(e) => updateItem(idx, "rokok_id", e.target.value)}>
                    <option value="">Pilih rokok</option>
                    {rokokList.filter((r) => r.aktif !== false).map((r) => (
                      <option key={r.id} value={r.id}>{r.nama} (stok: {r.stok ?? 0})</option>
                    ))}
                  </SelectInput>
                </Field>
              </div>
              <div className="w-24">
                <Field label={idx === 0 ? "Qty" : ""}>
                  <input type="number" min="1" value={item.qty} onChange={(e) => updateItem(idx, "qty", e.target.value)} placeholder="0" className={inputCls} />
                </Field>
              </div>
              {items.length > 1 && (
                <div className="pb-1"><IconButton icon={Trash2} onClick={() => removeItem(idx)} variant="danger" label="Hapus baris" /></div>
              )}
            </div>
          ))}
          <button type="button" onClick={addItem} className="w-full rounded-lg border border-dashed border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-500 transition hover:border-neutral-400 hover:bg-neutral-50 hover:text-neutral-700">
            + Tambah Baris
          </button>
        </div>

        <Field label="Alasan">
          <input type="text" value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder="Misal: Tidak laku, Rusak, Kadaluarsa..." className={inputCls} required />
        </Field>
      </div>

      <FormActions onCancel={onCancel} disabled={!valid} submitLabel={initial ? "Simpan Perubahan" : "Simpan Retur"} />
    </form>
  )
}
