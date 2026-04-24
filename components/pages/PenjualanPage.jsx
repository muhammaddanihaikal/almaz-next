"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Trash2 } from "lucide-react"
import { fmtIDR, fmtTanggal, filterByDateRange, defaultDateRange, sortByDateDesc, hitungProfit, downloadExcel, getRokok } from "@/lib/utils"
import { addDistribusi, updateDistribusi, deleteDistribusi } from "@/actions/distribusi"
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

export default function PenjualanPage({ distribusi, rokokList, salesList }) {
  const router = useRouter()
  const [mode, setMode] = useState(null)
  const [editing, setEditing] = useState(null)
  const [detail, setDetail] = useState(null)
  const [dateRange, setDateRange] = useState(defaultDateRange("bulan_ini"))
  const [salesFilter, setSalesFilter] = useState("")

  const rows = useMemo(() => {
    let filtered = filterByDateRange(distribusi, dateRange)
    if (salesFilter) filtered = filtered.filter((r) => r.sales_id === salesFilter)
    return sortByDateDesc(filtered)
  }, [distribusi, dateRange, salesFilter])

  const handleDownload = () => {
    const label = dateRange?.start ? `${dateRange.start}_${dateRange.end}` : "semua-waktu"
    let no = 0
    const flat = rows.flatMap((d) =>
      d.items.map((it) => {
        no++
        return {
          no, tanggal: d.tanggal, tipe_penjualan: d.tipe_penjualan || "",
          sales: d.sales || "", pembayaran: it.pembayaran || "Cash",
          tanggal_bayar: d.tanggal_bayar || "", rokok: it.rokok,
          qty: it.qty, harga: it.harga, total: it.qty * it.harga,
          profit: it.qty * ((it.harga || 0) - (getRokok(rokokList, it.rokok)?.harga_beli || 0)),
        }
      })
    )
    const totalQty     = flat.reduce((s, r) => s + r.qty, 0)
    const totalRevenue = flat.reduce((s, r) => s + r.total, 0)
    const periodeLabel = dateRange?.start ? `${fmtTanggal(dateRange.start)} s/d ${fmtTanggal(dateRange.end)}` : "Semua Waktu"
    downloadExcel(flat, `penjualan-${label}`, [
      { label: "No",             value: (r) => r.no },
      { label: "Tanggal",        value: (r) => r.tanggal },
      { label: "Tipe Penjualan", value: (r) => r.tipe_penjualan },
      { label: "Sales",          value: (r) => r.sales },
      { label: "Pembayaran",     value: (r) => r.pembayaran },
      { label: "Tgl Tempo",      value: (r) => r.tanggal_bayar },
      { label: "Rokok",          value: (r) => r.rokok },
      { label: "Qty",            value: (r) => r.qty },
      { label: "Harga Satuan",   value: (r) => r.harga },
      { label: "Total",          value: (r) => r.total },
      { label: "Profit",         value: (r) => r.profit },
    ], [
      ["Laporan Penjualan"], ["Periode", periodeLabel],
      ["Total Qty Terjual", String(totalQty)],
      ["Total Transaksi", `${rows.length} transaksi`],
      ["Total Pendapatan", fmtIDR(totalRevenue)],
    ], { centerData: true })
  }

  const close = () => { setMode(null); setEditing(null) }

  const handleDelete = async (r) => {
    if (!window.confirm("Hapus data penjualan ini?")) return
    await deleteDistribusi(r.id)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Penjualan"
        subtitle={`Daftar semua data penjualan${dateRange?.start ? ` — ${fmtTanggal(dateRange.start)} s/d ${fmtTanggal(dateRange.end)}` : " — semua waktu"}.`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <DownloadButton onClick={handleDownload} disabled={!rows.length} />
            <PrimaryButton onClick={() => { setEditing(null); setMode("add") }} icon={Plus}>
              Input Penjualan
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
          empty={dateRange?.start ? `Tidak ada penjualan dari ${fmtTanggal(dateRange.start)} s/d ${fmtTanggal(dateRange.end)}.` : "Belum ada data penjualan."}
          columns={[
            { key: "no",      label: "No",      render: (_, idx) => idx + 1 },
            { key: "tanggal", label: "Tanggal", render: (r) => fmtTanggal(r.tanggal) },
            { key: "tipe",    label: "Tipe",    render: (r) => <TipeBadge tipe={r.tipe_penjualan} /> },
            { key: "sales",   label: "Sales",   render: (r) => r.sales || <span className="text-neutral-400">—</span> },
            {
              key: "items", label: "Rokok",
              render: (r) => (
                <div className="space-y-0.5">
                  {r.items.map((item, i) => (
                    <div key={i} className="text-xs text-neutral-700">{i + 1}. {item.rokok} ×{item.qty}</div>
                  ))}
                </div>
              ),
            },
            { key: "total",  label: "Total",  align: "right", render: (r) => fmtIDR(r.items.reduce((s, it) => s + it.qty * it.harga, 0)) },
            { key: "profit", label: "Profit", align: "right", render: (r) => <span className="font-medium text-neutral-900">{fmtIDR(hitungProfit(rokokList, r))}</span> },
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
        />
      </Card>

      {detail && (
        <Modal title="Detail Penjualan" onClose={() => setDetail(null)} width="max-w-4xl">
          <PenjualanDetail record={detail} rokokList={rokokList} />
        </Modal>
      )}

      {mode && (
        <Modal title={mode === "add" ? "Input Penjualan" : "Edit Penjualan"} onClose={close} width="max-w-4xl">
          <PenjualanForm
            initial={editing}
            rokokList={rokokList}
            salesList={salesList}
            onSubmit={async (data) => {
              if (mode === "add") await addDistribusi(data)
              else await updateDistribusi(editing.id, data)
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

function PenjualanDetail({ record, rokokList }) {
  const total    = record.items.reduce((s, it) => s + it.qty * it.harga, 0)
  const totalQty = record.items.reduce((s, it) => s + it.qty, 0)
  const profit   = hitungProfit(rokokList, record)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div><p className="text-xs text-neutral-500">Tanggal</p><p className="font-medium">{fmtTanggal(record.tanggal)}</p></div>
        {record.tipe_penjualan && <div><p className="text-xs text-neutral-500">Tipe</p><TipeBadge tipe={record.tipe_penjualan} /></div>}
        {record.sales && <div><p className="text-xs text-neutral-500">Sales</p><p className="font-medium">{record.sales}</p></div>}
        {record.tanggal_bayar && <div><p className="text-xs text-neutral-500">Tanggal Tempo</p><p className="font-medium text-red-600">{fmtTanggal(record.tanggal_bayar)}</p></div>}
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">Daftar Rokok</p>
        <div className="overflow-hidden rounded-lg border border-neutral-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 text-xs font-medium uppercase tracking-wide text-neutral-500">
                <th className="px-3 py-2 text-left">Rokok</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Harga</th>
                <th className="px-3 py-2 text-left">Pembayaran</th>
                <th className="px-3 py-2 text-right">Subtotal</th>
                <th className="px-3 py-2 text-right">Profit</th>
              </tr>
            </thead>
            <tbody>
              {record.items.map((item, i) => {
                const r = getRokok(rokokList, item.rokok)
                const itemProfit = r ? item.qty * (item.harga - r.harga_beli) : 0
                return (
                  <tr key={i} className="border-b border-neutral-100">
                    <td className="px-3 py-2.5">{item.rokok}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{item.qty}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtIDR(item.harga)}</td>
                    <td className="px-3 py-2.5"><span className="text-xs font-medium px-2 py-1 rounded-md bg-neutral-100 text-neutral-600">{item.pembayaran || "Cash"}</span></td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtIDR(item.qty * item.harga)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-neutral-600">{fmtIDR(itemProfit)}</td>
                  </tr>
                )
              })}
              <tr className="border-t-2 border-neutral-200 bg-neutral-50">
                <td className="px-3 py-2.5 text-xs font-semibold text-neutral-500">Total</td>
                <td className="px-3 py-2.5 text-right text-xs font-semibold tabular-nums">{totalQty}</td>
                <td colSpan="2" className="px-3 py-2.5"></td>
                <td className="px-3 py-2.5 text-right text-xs font-semibold tabular-nums">{fmtIDR(total)}</td>
                <td className="px-3 py-2.5 text-right text-xs font-semibold tabular-nums">{fmtIDR(profit)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function PenjualanForm({ initial, rokokList, salesList, onSubmit, onCancel }) {
  const today = new Date().toISOString().slice(0, 10)
  const [tanggal, setTanggal]             = useState(initial?.tanggal || today)
  const [tipePenjualan, setTipePenjualan] = useState(initial?.tipe_penjualan || "")
  const [salesId, setSalesId]             = useState(initial?.sales_id || "")
  const [tanggalBayar, setTanggalBayar]   = useState(initial?.tanggal_bayar || "")
  const [items, setItems] = useState(
    initial
      ? initial.items.map((it) => ({ rokok_id: it.rokok_id, qty: it.qty, pembayaran: it.pembayaran || "Cash" }))
      : [{ rokok_id: "", qty: "", pembayaran: "Cash" }, { rokok_id: "", qty: "", pembayaran: "Cash" }]
  )

  const addItem    = () => setItems([...items, { rokok_id: "", qty: "", pembayaran: "Cash" }])
  const removeItem = (idx) => setItems(items.filter((_, i) => i !== idx))
  const updateItem = (idx, field, val) => setItems(items.map((item, i) => (i === idx ? { ...item, [field]: val } : item)))

  const priceProp  = tipePenjualan ? "harga_" + tipePenjualan.toLowerCase() : "harga_toko"
  const validItems = items.filter((it) => it.rokok_id && Number(it.qty) > 0)
  const adaHutang  = items.some((it) => it.pembayaran === "Hutang")
  const valid      = tanggal && !!tipePenjualan && !!salesId && (!adaHutang || !!tanggalBayar) && validItems.length > 0

  const submit = (e) => {
    e.preventDefault()
    if (!valid) return
    onSubmit({
      tanggal,
      tipe_penjualan: tipePenjualan,
      sales_id: salesId,
      tanggal_bayar: adaHutang ? tanggalBayar : null,
      items: validItems.map((it) => ({
        rokok_id: it.rokok_id,
        qty: Number(it.qty),
        harga: rokokList.find((r) => r.id === it.rokok_id)?.[priceProp] || 0,
        pembayaran: it.pembayaran,
      })),
    })
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Tanggal">
          <input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} className={inputCls} required />
        </Field>
        <Field label="Tipe Penjualan">
          <SelectInput value={tipePenjualan} onChange={(e) => setTipePenjualan(e.target.value)}>
            <option value="">Pilih Tipe Penjualan</option>
            <option value="Toko">Toko</option>
            <option value="Grosir">Grosir</option>
            <option value="Perorangan">Perorangan</option>
          </SelectInput>
        </Field>
      </div>

      <div className={`space-y-4${!tipePenjualan ? " pointer-events-none opacity-50 select-none" : ""}`}>
        <Field label="Sales">
          <SearchableSelect
            value={salesId}
            onChange={(e) => setSalesId(e.target.value)}
            placeholder="Pilih sales"
            options={[{ value: "", label: "Pilih sales" }, ...salesList.filter((s) => s.aktif !== false).map((s) => ({ value: s.id, label: s.nama }))]}
          />
        </Field>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Daftar Rokok</span>
            <div className="flex gap-1.5">
              <button type="button" onClick={() => setItems(items.map((it) => ({ ...it, pembayaran: "Cash" })))} className="rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50">Semua Cash</button>
              <button type="button" onClick={() => setItems(items.map((it) => ({ ...it, pembayaran: "Hutang" })))} className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100">Semua Hutang</button>
            </div>
          </div>
          {items.map((item, idx) => {
            const rokokData  = rokokList.find((r) => r.id === item.rokok_id)
            const itemHarga  = rokokData ? rokokData[priceProp] || 0 : 0
            const totalHarga = rokokData && item.qty ? itemHarga * Number(item.qty) : null
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
                <div className="w-24">
                  <Field label={idx === 0 ? "Qty" : ""}>
                    <input type="number" min="1" value={item.qty} onChange={(e) => updateItem(idx, "qty", e.target.value)} placeholder="0" className={inputCls} />
                  </Field>
                </div>
                <div className="w-28">
                  <Field label={idx === 0 ? "Bayar" : ""}>
                    <SelectInput value={item.pembayaran} onChange={(e) => updateItem(idx, "pembayaran", e.target.value)}>
                      <option value="Cash">Cash</option>
                      <option value="Hutang">Hutang</option>
                    </SelectInput>
                  </Field>
                </div>
                <div className="w-32">
                  <Field label={idx === 0 ? "Total" : ""}>
                    <input type="text" value={totalHarga !== null ? fmtIDR(totalHarga) : ""} className={inputCls + " bg-neutral-50 text-neutral-500"} readOnly placeholder="Otomatis" />
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

        {adaHutang && (
          <div className="rounded-lg border border-red-100 bg-red-50 p-4 shadow-sm">
            <p className="mb-3 text-sm font-medium text-red-800">Terdapat item Hutang. Kapan akan dibayar?</p>
            <Field label="Tanggal Tempo">
              <input type="date" value={tanggalBayar} onChange={(e) => setTanggalBayar(e.target.value)} className={inputCls + " border-red-200 focus:border-red-500 focus:ring-red-500"} required />
            </Field>
          </div>
        )}
      </div>

      <FormActions onCancel={onCancel} disabled={!valid} submitLabel={initial ? "Simpan Perubahan" : "Simpan Penjualan"} />
    </form>
  )
}
