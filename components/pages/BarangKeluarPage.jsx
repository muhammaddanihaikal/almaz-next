"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Trash2 } from "lucide-react"
import { fmtTanggal, filterByDateRange, defaultDateRange, sortByDateDesc, downloadExcel } from "@/lib/utils"
import { addBarangKeluar, updateBarangKeluar, deleteBarangKeluar } from "@/actions/barang-keluar"
import { Card, PageHeader, DateFilter, DownloadButton, PrimaryButton, Field, FormActions, SelectInput, SearchableSelect, inputCls, RowActions, IconButton } from "@/components/ui"
import DataTable from "@/components/DataTable"
import Modal from "@/components/Modal"

const PAGE_SIZE = 10

export default function BarangKeluarPage({ barangKeluar, rokokList, salesList }) {
  const router = useRouter()
  const [mode, setMode] = useState(null)
  const [editing, setEditing] = useState(null)
  const [detail, setDetail] = useState(null)
  const [dateRange, setDateRange] = useState(defaultDateRange("bulan_ini"))
  const [salesFilter, setSalesFilter] = useState("")

  const rows = useMemo(() => {
    let filtered = filterByDateRange(barangKeluar, dateRange)
    if (salesFilter) filtered = filtered.filter((r) => r.sales_id === salesFilter)
    return sortByDateDesc(filtered)
  }, [barangKeluar, dateRange, salesFilter])

  const handleDownload = () => {
    const label = dateRange?.start ? `${dateRange.start}_${dateRange.end}` : "semua-waktu"
    let no = 0
    const flat = rows.flatMap((d) =>
      d.items.map((it) => {
        no++
        return { no, tanggal: d.tanggal, sales: d.sales || "", rokok: it.rokok, qty: it.qty }
      })
    )
    downloadExcel(flat, `barang-keluar-${label}`, [
      { label: "No",      value: (r) => r.no },
      { label: "Tanggal", value: (r) => r.tanggal },
      { label: "Sales",   value: (r) => r.sales },
      { label: "Rokok",   value: (r) => r.rokok },
      { label: "Qty",     value: (r) => r.qty },
    ])
  }

  const close = () => { setMode(null); setEditing(null) }

  const handleDelete = async (r) => {
    if (!window.confirm("Hapus catatan barang keluar ini?")) return
    await deleteBarangKeluar(r.id)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Barang Keluar"
        subtitle={`Catatan rokok yang dibawa sales pagi hari${dateRange?.start ? ` — ${fmtTanggal(dateRange.start)} s/d ${fmtTanggal(dateRange.end)}` : " — semua waktu"}.`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <DownloadButton onClick={handleDownload} disabled={!rows.length} />
            <PrimaryButton onClick={() => { setEditing(null); setMode("add") }} icon={Plus}>
              Input Barang Keluar
            </PrimaryButton>
          </div>
        }
      />

      <div className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] lg:flex-row lg:flex-wrap lg:items-center lg:gap-6">
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
          <label className="text-sm font-medium text-neutral-600 sm:w-14">Waktu:</label>
          <DateFilter value={dateRange} onChange={setDateRange} />
        </div>
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
          <label className="text-sm font-medium text-neutral-600 sm:w-10">Sales:</label>
          <div className="w-full sm:w-48">
            <SearchableSelect
              value={salesFilter}
              onChange={(e) => setSalesFilter(e.target.value)}
              placeholder="Semua Sales"
              options={[{ value: "", label: "Semua Sales" }, ...salesList.map((s) => ({ value: s.id, label: s.nama }))]}
            />
          </div>
        </div>
      </div>

      <Card>
        <DataTable
          key={`${dateRange?.start}-${dateRange?.end}-${salesFilter}`}
          pageSize={PAGE_SIZE}
          rows={rows}
          empty={dateRange?.start ? `Tidak ada data dari ${fmtTanggal(dateRange.start)} s/d ${fmtTanggal(dateRange.end)}.` : "Belum ada catatan barang keluar."}
          columns={[
            { key: "no",      label: "No",      render: (_, idx) => idx + 1 },
            { key: "tanggal", label: "Tanggal", render: (r) => fmtTanggal(r.tanggal) },
            { key: "sales",   label: "Sales",   render: (r) => r.sales || <span className="text-neutral-400">—</span> },
            {
              key: "items", label: "Rokok",
              render: (r) => (
                <div className="space-y-0.5">
                  {r.items.map((it, i) => (
                    <div key={i} className="text-xs text-neutral-700">{i + 1}. {it.rokok} ×{it.qty}</div>
                  ))}
                </div>
              ),
            },
            { key: "total_qty", label: "Total Qty", align: "right", render: (r) => <span className="font-medium tabular-nums">{r.items.reduce((s, it) => s + it.qty, 0)}</span> },
            {
              key: "actions", label: "", align: "right",
              render: (r) => (
                <RowActions
                  onDetail={() => setDetail(r)}
                  onEdit={() => { setEditing(r); setMode("edit") }}
                  onDelete={() => handleDelete(r)}
                />
              ),
            },
          ]}
          mobileRender={(r) => (
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium text-neutral-900">{r.sales || "—"}</p>
                <p className="text-xs text-neutral-500">{fmtTanggal(r.tanggal)}</p>
                <div className="mt-1 space-y-0.5">
                  {r.items.map((it, i) => (
                    <p key={i} className="text-xs text-neutral-600">{it.rokok} ×{it.qty}</p>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm font-medium tabular-nums">{r.items.reduce((s, it) => s + it.qty, 0)} pcs</span>
                <RowActions
                  onDetail={() => setDetail(r)}
                  onEdit={() => { setEditing(r); setMode("edit") }}
                  onDelete={() => handleDelete(r)}
                />
              </div>
            </div>
          )}
        />
      </Card>

      {detail && (
        <Modal title="Detail Barang Keluar" onClose={() => setDetail(null)} width="max-w-lg">
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div><p className="text-xs text-neutral-500">Tanggal</p><p className="font-medium">{fmtTanggal(detail.tanggal)}</p></div>
              <div><p className="text-xs text-neutral-500">Sales</p><p className="font-medium">{detail.sales || "—"}</p></div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">Daftar Rokok</p>
              <div className="overflow-hidden rounded-lg border border-neutral-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-200 bg-neutral-50 text-xs font-medium uppercase tracking-wide text-neutral-500">
                      <th className="px-3 py-2 text-left">Rokok</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items.map((it, i) => (
                      <tr key={i} className="border-b border-neutral-100">
                        <td className="px-3 py-2.5">{it.rokok}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-medium">{it.qty}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-neutral-200 bg-neutral-50">
                      <td className="px-3 py-2.5 text-xs font-semibold text-neutral-500">Total</td>
                      <td className="px-3 py-2.5 text-right text-xs font-semibold tabular-nums">{detail.items.reduce((s, it) => s + it.qty, 0)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {mode && (
        <Modal title={mode === "add" ? "Input Barang Keluar" : "Edit Barang Keluar"} onClose={close} width="max-w-2xl">
          <BarangKeluarForm
            initial={editing}
            rokokList={rokokList}
            salesList={salesList}
            onSubmit={async (data) => {
              if (mode === "add") await addBarangKeluar(data)
              else await updateBarangKeluar(editing.id, data)
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

function BarangKeluarForm({ initial, rokokList, salesList, onSubmit, onCancel }) {
  const today = new Date().toISOString().slice(0, 10)
  const [tanggal, setTanggal] = useState(initial?.tanggal || today)
  const [salesId, setSalesId] = useState(initial?.sales_id || "")
  const [items, setItems] = useState(
    initial
      ? initial.items.map((it) => ({ rokok_id: it.rokok_id, qty: it.qty }))
      : [{ rokok_id: "", qty: "" }, { rokok_id: "", qty: "" }]
  )

  const addItem    = () => setItems([...items, { rokok_id: "", qty: "" }])
  const removeItem = (idx) => setItems(items.filter((_, i) => i !== idx))
  const updateItem = (idx, field, val) => setItems(items.map((item, i) => (i === idx ? { ...item, [field]: val } : item)))

  const validItems = items.filter((it) => it.rokok_id && Number(it.qty) > 0)
  const valid      = tanggal && !!salesId && validItems.length > 0

  const submit = (e) => {
    e.preventDefault()
    if (!valid) return
    onSubmit({
      tanggal,
      sales_id: salesId,
      items: validItems.map((it) => ({ rokok_id: it.rokok_id, qty: Number(it.qty) })),
    })
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Tanggal">
          <input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} className={inputCls} required autoFocus />
        </Field>
        <Field label="Sales">
          <SearchableSelect
            value={salesId}
            onChange={(e) => setSalesId(e.target.value)}
            placeholder="Pilih sales"
            options={[{ value: "", label: "Pilih sales" }, ...salesList.filter((s) => s.aktif !== false).map((s) => ({ value: s.id, label: s.nama }))]}
          />
        </Field>
      </div>

      <div className="space-y-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Daftar Rokok</span>
        {items.map((item, idx) => {
          const selectedIds = items.map((it) => it.rokok_id).filter(Boolean)
          const available   = rokokList.filter((r) => r.aktif !== false && (!selectedIds.includes(r.id) || r.id === item.rokok_id))
          return (
          <div key={idx} className="flex items-end gap-3">
            <div className="flex-1">
              <Field label={idx === 0 ? "Rokok" : ""}>
                <SelectInput value={item.rokok_id} onChange={(e) => updateItem(idx, "rokok_id", e.target.value)}>
                  <option value="">Pilih rokok</option>
                  {available.map((r) => (
                    <option key={r.id} value={r.id}>{r.nama} (stok: {r.stok ?? 0})</option>
                  ))}
                </SelectInput>
              </Field>
            </div>
            <div className="w-28">
              <Field label={idx === 0 ? "Qty" : ""}>
                <input type="number" min="1" value={item.qty} onChange={(e) => updateItem(idx, "qty", e.target.value)} placeholder="0" className={inputCls} />
              </Field>
            </div>
            {items.length > 1 && (
              <div className="pb-1">
                <IconButton icon={Trash2} onClick={() => removeItem(idx)} variant="danger" label="Hapus baris" />
              </div>
            )}
          </div>
          )
        })}
        <button type="button" onClick={addItem} className="w-full rounded-lg border border-dashed border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-500 transition hover:border-neutral-400 hover:bg-neutral-50 hover:text-neutral-700">
          + Tambah Baris
        </button>
      </div>

      <FormActions onCancel={onCancel} disabled={!valid} submitLabel={initial ? "Simpan Perubahan" : "Simpan Barang Keluar"} />
    </form>
  )
}
