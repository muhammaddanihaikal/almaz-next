"use client"

import { Fragment, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Trash2 } from "lucide-react"
import { fmtIDR, fmtTanggal, filterByDateRange, defaultDateRange, sortByDateDesc, downloadExcel } from "@/lib/utils"
import { addPenjualan, updatePenjualan, deletePenjualan } from "@/actions/penjualan"
import { Card, PageHeader, DateFilter, DownloadButton, PrimaryButton, Field, FormActions, SelectInput, SearchableSelect, inputCls, RowActions, IconButton } from "@/components/ui"
import DataTable from "@/components/DataTable"
import Modal from "@/components/Modal"

const PAGE_SIZE = 10

const TIPE_COLOR = {
  Toko:   "bg-blue-100 text-blue-700",
  Grosir: "bg-violet-100 text-violet-700",
}

function TipeBadge({ tipe }) {
  if (!tipe) return null
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TIPE_COLOR[tipe] || "bg-neutral-100 text-neutral-600"}`}>
      {tipe}
    </span>
  )
}

function StatusBadge({ status }) {
  return status === "belum_masuk"
    ? <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">Belum Masuk</span>
    : <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">Lengkap</span>
}

function SetoranCell({ record }) {
  if (record.status === "belum_masuk") return <span className="text-neutral-300 select-none">—</span>
  if (record.setoran_total == null) {
    return <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Belum diisi</span>
  }
  const expected = record.masukItems.reduce((s, it) => s + it.qty * it.harga, 0)
  const match = record.setoran_total === expected
  return (
    <span className={`font-medium tabular-nums text-sm ${match ? "text-green-600" : "text-red-600"}`}>
      {fmtIDR(record.setoran_total)}
    </span>
  )
}

function emptyItem() {
  return { rokok_id: "", keluar_qty: "", keluar_qsample: "0", masuk_qty: "", masuk_qsample: "0", pembayaran: "Cash" }
}

function mergeItems(keluarItems = [], masukItems = []) {
  const masukMap = {}
  masukItems.forEach((it) => { masukMap[it.rokok_id] = it })
  return keluarItems.map((kit) => {
    const mit = masukMap[kit.rokok_id]
    return {
      rokok_id:       kit.rokok_id,
      keluar_qty:     String(kit.qty),
      keluar_qsample: String(kit.qty_sample || 0),
      masuk_qty:      mit ? String(mit.qty) : "",
      masuk_qsample:  mit ? String(mit.qty_sample || 0) : "0",
      pembayaran:     mit?.pembayaran || "Cash",
    }
  })
}

export default function PenjualanPage({ penjualan, rokokList, salesList, tokoList }) {
  const router = useRouter()
  const [mode,        setMode]        = useState(null)
  const [editing,     setEditing]     = useState(null)
  const [detail,      setDetail]      = useState(null)
  const [dateRange,   setDateRange]   = useState(defaultDateRange("bulan_ini"))
  const [salesFilter, setSalesFilter] = useState("")

  const rows = useMemo(() => {
    let filtered = filterByDateRange(penjualan, dateRange)
    if (salesFilter) filtered = filtered.filter((r) => r.sales_id === salesFilter)
    return sortByDateDesc(filtered)
  }, [penjualan, dateRange, salesFilter])

  const handleDownload = () => {
    const label = dateRange?.start ? `${dateRange.start}_${dateRange.end}` : "semua-waktu"
    let no = 0
    const flat = rows
      .filter((r) => r.masukItems.length > 0)
      .flatMap((r) =>
        r.masukItems.map((it) => {
          no++
          return {
            no, tanggal: r.tanggal, sales: r.sales, toko: r.toko || "", tipe: r.tipe_penjualan || "",
            rokok: it.rokok, qty: it.qty, harga: it.harga,
            total: it.qty * it.harga, pembayaran: it.pembayaran,
          }
        })
      )
    downloadExcel(flat, `penjualan-${label}`, [
      { label: "No",         value: (r) => r.no },
      { label: "Tanggal",    value: (r) => r.tanggal },
      { label: "Sales",      value: (r) => r.sales },
      { label: "Toko",       value: (r) => r.toko },
      { label: "Tipe",       value: (r) => r.tipe },
      { label: "Rokok",      value: (r) => r.rokok },
      { label: "Qty",        value: (r) => r.qty },
      { label: "Harga",      value: (r) => r.harga },
      { label: "Total",      value: (r) => r.total },
      { label: "Pembayaran", value: (r) => r.pembayaran },
    ])
  }

  const close = () => { setMode(null); setEditing(null) }

  const handleDelete = async (r) => {
    if (!window.confirm("Hapus data penjualan ini?")) return
    await deletePenjualan(r.id)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Penjualan"
        subtitle={`Catatan keluar dan masuk rokok per sales${dateRange?.start ? ` — ${fmtTanggal(dateRange.start)} s/d ${fmtTanggal(dateRange.end)}` : " — semua waktu"}.`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <DownloadButton onClick={handleDownload} disabled={!rows.some((r) => r.masukItems.length > 0)} />
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
          empty={dateRange?.start ? `Tidak ada data dari ${fmtTanggal(dateRange.start)} s/d ${fmtTanggal(dateRange.end)}.` : "Belum ada data penjualan."}
          columns={[
            { key: "no",      label: "No",      render: (_, idx) => idx + 1 },
            { key: "tanggal", label: "Tanggal", render: (r) => fmtTanggal(r.tanggal) },
            { key: "sales",   label: "Sales",   render: (r) => r.sales || <span className="text-neutral-400">—</span> },
            {
              key: "toko", label: "Toko",
              render: (r) => r.toko
                ? <span className="flex items-center gap-1.5">{r.toko}<TipeBadge tipe={r.tipe_penjualan} /></span>
                : <span className="text-neutral-400">—</span>,
            },
            { key: "status",  label: "Status",  render: (r) => <StatusBadge status={r.status} /> },
            {
              key: "keluar", label: "Keluar",
              render: (r) => {
                const qty = r.keluarItems.reduce((s, it) => s + it.qty, 0)
                const smp = r.keluarItems.reduce((s, it) => s + (it.qty_sample || 0), 0)
                return (
                  <div className="text-sm tabular-nums">
                    <span className="font-medium">{qty}</span><span className="text-neutral-400"> pcs</span>
                    {smp > 0 && <span className="ml-1.5 text-xs text-amber-600">+{smp} spl</span>}
                  </div>
                )
              },
            },
            { key: "setoran", label: "Setoran", align: "right", render: (r) => <SetoranCell record={r} /> },
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
          mobileRender={(r) => {
            const qty = r.keluarItems.reduce((s, it) => s + it.qty, 0)
            const smp = r.keluarItems.reduce((s, it) => s + (it.qty_sample || 0), 0)
            return (
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium text-neutral-900">{r.sales || "—"}</span>
                    <TipeBadge tipe={r.tipe_penjualan} />
                    <StatusBadge status={r.status} />
                  </div>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {fmtTanggal(r.tanggal)}{r.toko ? ` — ${r.toko}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-neutral-600">
                    Keluar: <span className="font-medium tabular-nums">{qty} pcs</span>
                    {smp > 0 && <span className="ml-1 text-amber-600">+{smp} sample</span>}
                  </p>
                  {r.status !== "belum_masuk" && (
                    <p className="mt-0.5 text-xs text-neutral-600">
                      Setoran: <SetoranCell record={r} />
                    </p>
                  )}
                </div>
                <RowActions
                  onDetail={() => setDetail(r)}
                  onEdit={() => { setEditing(r); setMode("edit") }}
                  onDelete={() => handleDelete(r)}
                />
              </div>
            )
          }}
        />
      </Card>

      {detail && (
        <Modal title="Detail Penjualan" onClose={() => setDetail(null)} width="max-w-2xl">
          <PenjualanDetail record={detail} />
        </Modal>
      )}

      {mode && (
        <Modal title={mode === "add" ? "Input Penjualan" : "Edit Penjualan"} onClose={close} width="max-w-3xl">
          <PenjualanForm
            initial={editing}
            rokokList={rokokList}
            salesList={salesList}
            tokoList={tokoList}
            onSubmit={async (data) => {
              if (mode === "add") await addPenjualan(data)
              else await updatePenjualan(editing.id, data)
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

function PenjualanDetail({ record }) {
  const totalJual    = record.masukItems.reduce((s, it) => s + it.qty * it.harga, 0)
  const setoranMatch = record.setoran_total != null && record.setoran_total === totalJual

  return (
    <div className="space-y-5 text-sm">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div><p className="text-xs text-neutral-500">Tanggal</p><p className="font-medium">{fmtTanggal(record.tanggal)}</p></div>
        <div><p className="text-xs text-neutral-500">Sales</p><p className="font-medium">{record.sales || "—"}</p></div>
        <div>
          <p className="text-xs text-neutral-500">Toko</p>
          <p className="flex items-center gap-1.5 font-medium">{record.toko || "—"} <TipeBadge tipe={record.tipe_penjualan} /></p>
        </div>
        <div><p className="text-xs text-neutral-500">Status</p><StatusBadge status={record.status} /></div>
      </div>

      {/* Keluar */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">Keluar (Barang Dibawa)</p>
        <div className="overflow-hidden rounded-lg border border-neutral-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 text-xs font-medium uppercase tracking-wide text-neutral-500">
                <th className="px-3 py-2 text-left">Rokok</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Sample</th>
              </tr>
            </thead>
            <tbody>
              {record.keluarItems.map((it, i) => (
                <tr key={i} className="border-b border-neutral-100">
                  <td className="px-3 py-2.5">{it.rokok}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{it.qty}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {it.qty_sample > 0
                      ? <span className="font-medium text-amber-600">{it.qty_sample}</span>
                      : <span className="text-neutral-400">—</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Masuk */}
      {record.masukItems.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">Masuk (Hasil Penjualan)</p>
          <div className="overflow-hidden rounded-lg border border-neutral-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50 text-xs font-medium uppercase tracking-wide text-neutral-500">
                  <th className="px-3 py-2 text-left">Rokok</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Sample</th>
                  <th className="px-3 py-2 text-left">Pembayaran</th>
                  <th className="px-3 py-2 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {record.masukItems.map((it, i) => (
                  <tr key={i} className="border-b border-neutral-100">
                    <td className="px-3 py-2.5">{it.rokok}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{it.qty}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {it.qty_sample > 0
                        ? <span className="font-medium text-amber-600">{it.qty_sample}</span>
                        : <span className="text-neutral-400">—</span>
                      }
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">{it.pembayaran}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtIDR(it.qty * it.harga)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-neutral-200 bg-neutral-50">
                  <td colSpan="4" className="px-3 py-2.5 text-xs font-semibold text-neutral-500">Total Penjualan</td>
                  <td className="px-3 py-2.5 text-right text-xs font-semibold tabular-nums">{fmtIDR(totalJual)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Setoran */}
      {record.masukItems.length > 0 && (
        <div className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
          record.setoran_total == null
            ? "border-amber-200 bg-amber-50"
            : setoranMatch
            ? "border-green-200 bg-green-50"
            : "border-red-200 bg-red-50"
        }`}>
          <div>
            <p className="text-xs font-medium text-neutral-500">Setoran {record.setoran_tipe || ""}</p>
            {record.setoran_total != null
              ? <p className={`mt-0.5 text-base font-semibold tabular-nums ${setoranMatch ? "text-green-700" : "text-red-700"}`}>{fmtIDR(record.setoran_total)}</p>
              : <p className="mt-0.5 text-sm font-medium text-amber-700">Belum diisi</p>
            }
          </div>
          {record.setoran_total != null && (
            <span className={`text-xs font-medium ${setoranMatch ? "text-green-600" : "text-red-600"}`}>
              {setoranMatch
                ? "✓ Cocok"
                : `${record.setoran_total > totalJual ? "Lebih" : "Kurang"} ${fmtIDR(Math.abs(record.setoran_total - totalJual))}`
              }
            </span>
          )}
        </div>
      )}
    </div>
  )
}

const sampleInputCls =
  "w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/10"

function PenjualanForm({ initial, rokokList, salesList, tokoList, onSubmit, onCancel }) {
  const today = new Date().toISOString().slice(0, 10)

  const [tanggal,      setTanggal]      = useState(initial?.tanggal || today)
  const [salesId,      setSalesId]      = useState(initial?.sales_id || "")
  const [tokoId,       setTokoId]       = useState(initial?.toko_id || "")
  const [setoranTipe,  setSetoranTipe]  = useState(initial?.setoran_tipe || "")
  const [setoranTotal, setSetoranTotal] = useState(initial?.setoran_total ?? "")
  const [items, setItems] = useState(() =>
    initial?.keluarItems?.length
      ? mergeItems(initial.keluarItems, initial.masukItems)
      : [emptyItem()]
  )

  const selectedToko = tokoList.find((t) => t.id === tokoId)
  const priceProp    = selectedToko?.tipe === "Toko" ? "harga_toko" : selectedToko?.tipe === "Grosir" ? "harga_grosir" : null

  const addRow    = () => setItems([...items, emptyItem()])
  const removeRow = (idx) => { if (items.length > 1) setItems(items.filter((_, i) => i !== idx)) }
  const update    = (idx, field, val) => setItems(items.map((it, i) => i === idx ? { ...it, [field]: val } : it))

  const validItems = items.filter((it) => it.rokok_id && Number(it.keluar_qty) > 0)
  const hasMasuk   = items.some((it) => it.rokok_id && Number(it.masuk_qty) > 0)

  const expectedSetoran = (hasMasuk && priceProp)
    ? items.reduce((s, it) => {
        if (!it.rokok_id || !Number(it.masuk_qty)) return s
        const r = rokokList.find((r) => r.id === it.rokok_id)
        return s + (r ? (r[priceProp] || 0) * Number(it.masuk_qty) : 0)
      }, 0)
    : 0

  const setoranNum      = Number(setoranTotal) || 0
  const setoranMatch    = setoranNum > 0 && setoranNum === expectedSetoran
  const setoranMismatch = setoranNum > 0 && setoranNum !== expectedSetoran

  const valid = tanggal && salesId && validItems.length > 0

  const submit = (e) => {
    e.preventDefault()
    if (!valid) return
    const rows = items.filter((it) => it.rokok_id && Number(it.keluar_qty) > 0)
    onSubmit({
      tanggal,
      sales_id:  salesId,
      toko_id:   tokoId || null,
      keluarItems: rows.map((it) => ({
        rokok_id:   it.rokok_id,
        qty:        Number(it.keluar_qty),
        qty_sample: Number(it.keluar_qsample) || 0,
      })),
      masukItems: rows
        .filter((it) => Number(it.masuk_qty) > 0)
        .map((it) => {
          const r = rokokList.find((r) => r.id === it.rokok_id)
          return {
            rokok_id:   it.rokok_id,
            qty:        Number(it.masuk_qty),
            qty_sample: Number(it.masuk_qsample) || 0,
            harga:      priceProp && r ? (r[priceProp] || 0) : 0,
            pembayaran: it.pembayaran || "Cash",
          }
        }),
      setoran_tipe:  hasMasuk ? (setoranTipe || null) : null,
      setoran_total: hasMasuk && setoranTotal !== "" ? Number(setoranTotal) : null,
    })
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {/* Header */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
        <Field label="Toko">
          <SearchableSelect
            value={tokoId}
            onChange={(e) => setTokoId(e.target.value)}
            placeholder="Pilih toko (opsional)"
            options={[{ value: "", label: "Tanpa toko" }, ...tokoList.filter((t) => t.aktif !== false).map((t) => ({ value: t.id, label: `${t.nama} (${t.tipe})` }))]}
          />
        </Field>
      </div>

      {/* Items */}
      <SectionDivider label="Barang" />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs font-medium text-neutral-500">
              <th className="pb-2 pr-2">Rokok</th>
              <th className="pb-2 px-2 w-24 text-right">Keluar</th>
              <th className="pb-2 px-2 w-24 text-right">Masuk</th>
              <th className="pb-2 px-2 w-28">Pembayaran</th>
              <th className="pb-2 pl-2 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const usedIds   = items.map((it) => it.rokok_id).filter(Boolean)
              const available = rokokList.filter((r) => r.aktif !== false && (!usedIds.includes(r.id) || r.id === item.rokok_id))
              return (
                <Fragment key={idx}>
                  {/* Main row */}
                  <tr className="border-t border-neutral-100">
                    <td className="pt-2 pr-2">
                      <SelectInput value={item.rokok_id} onChange={(e) => update(idx, "rokok_id", e.target.value)}>
                        <option value="">Pilih rokok</option>
                        {available.map((r) => <option key={r.id} value={r.id}>{r.nama} (stok: {r.stok ?? 0})</option>)}
                      </SelectInput>
                    </td>
                    <td className="pt-2 px-2">
                      <input
                        type="number" min="0" value={item.keluar_qty}
                        onChange={(e) => update(idx, "keluar_qty", e.target.value)}
                        placeholder="0" className={inputCls + " text-right"}
                      />
                    </td>
                    <td className="pt-2 px-2">
                      <input
                        type="number" min="0" value={item.masuk_qty}
                        onChange={(e) => update(idx, "masuk_qty", e.target.value)}
                        placeholder="0" className={inputCls + " text-right"}
                      />
                    </td>
                    <td className="pt-2 px-2">
                      <SelectInput value={item.pembayaran} onChange={(e) => update(idx, "pembayaran", e.target.value)}>
                        <option value="Cash">Cash</option>
                        <option value="Transfer">Transfer</option>
                        <option value="Hutang">Hutang</option>
                      </SelectInput>
                    </td>
                    <td className="pt-2 pl-2">
                      {items.length > 1 && (
                        <IconButton icon={Trash2} onClick={() => removeRow(idx)} variant="danger" label="Hapus baris" />
                      )}
                    </td>
                  </tr>
                  {/* Sample sub-row */}
                  {item.rokok_id && (
                    <tr className="bg-amber-50/60">
                      <td className="py-1.5 pr-2 pl-2">
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                          Sample
                        </span>
                      </td>
                      <td className="py-1.5 px-2">
                        <input
                          type="number" min="0" value={item.keluar_qsample}
                          onChange={(e) => update(idx, "keluar_qsample", e.target.value)}
                          placeholder="0" className={sampleInputCls + " text-right"}
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <input
                          type="number" min="0" value={item.masuk_qsample}
                          onChange={(e) => update(idx, "masuk_qsample", e.target.value)}
                          placeholder="0" className={sampleInputCls + " text-right"}
                        />
                      </td>
                      <td colSpan={2} />
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      <AddRowButton onClick={addRow} />

      {/* Setoran */}
      {hasMasuk && (
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 space-y-3">
          <SectionDivider label="Setoran" optional />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Tipe Setoran">
              <SelectInput value={setoranTipe} onChange={(e) => setSetoranTipe(e.target.value)}>
                <option value="">Pilih tipe</option>
                <option value="Cash">Cash</option>
                <option value="Transfer">Transfer</option>
              </SelectInput>
            </Field>
            <div>
              <Field label="Total Setoran">
                <input
                  type="number"
                  value={setoranTotal}
                  onChange={(e) => setSetoranTotal(e.target.value)}
                  placeholder={String(expectedSetoran)}
                  className={
                    inputCls +
                    (setoranMatch    ? " !border-green-500 focus:!border-green-600 focus:!ring-green-500/10"
                    : setoranMismatch ? " !border-red-400   focus:!border-red-500   focus:!ring-red-500/10"
                    : "")
                  }
                />
              </Field>
              <p className={`mt-1 text-xs ${setoranMatch ? "text-green-600" : setoranMismatch ? "text-red-600" : "text-neutral-400"}`}>
                {setoranMatch
                  ? "✓ Cocok dengan total penjualan"
                  : setoranMismatch
                  ? `${setoranNum > expectedSetoran ? "Lebih" : "Kurang"} ${fmtIDR(Math.abs(setoranNum - expectedSetoran))} dari ${fmtIDR(expectedSetoran)}`
                  : `Ekspektasi: ${fmtIDR(expectedSetoran)}`
                }
              </p>
            </div>
          </div>
        </div>
      )}

      <FormActions onCancel={onCancel} disabled={!valid} submitLabel={initial ? "Simpan Perubahan" : "Simpan Penjualan"} />
    </form>
  )
}

function SectionDivider({ label, optional }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 whitespace-nowrap">{label}</span>
      {optional && <span className="text-xs text-neutral-400">(opsional)</span>}
      <div className="flex-1 border-t border-neutral-200" />
    </div>
  )
}

function AddRowButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-lg border border-dashed border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-500 transition hover:border-neutral-400 hover:bg-neutral-50 hover:text-neutral-700"
    >
      + Tambah Baris
    </button>
  )
}
