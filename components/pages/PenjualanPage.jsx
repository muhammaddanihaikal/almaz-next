"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Trash2 } from "lucide-react"
import { fmtIDR, fmtTanggal, filterByDateRange, defaultDateRange, sortByDateDesc, downloadExcel } from "@/lib/utils"
import { addPenjualan, updatePenjualan, deletePenjualan } from "@/actions/penjualan"
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

function StatusBadge({ status }) {
  return status === "belum_masuk"
    ? <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">Belum Masuk</span>
    : <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">Lengkap</span>
}

function SampleBadge() {
  return <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Sample</span>
}

function SetoranCell({ record }) {
  if (record.status === "belum_masuk") return <span className="text-neutral-300 select-none">—</span>
  if (record.setoran_total == null) {
    return <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Belum diisi</span>
  }
  const expected = record.masukItems.filter((it) => !it.is_sample).reduce((s, it) => s + it.qty * it.harga, 0)
  const match = record.setoran_total === expected
  return (
    <span className={`font-medium tabular-nums text-sm ${match ? "text-green-600" : "text-red-600"}`}>
      {fmtIDR(record.setoran_total)}
    </span>
  )
}

function SampleToggle({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`h-9 rounded-lg border px-2.5 text-xs font-medium transition whitespace-nowrap ${
        checked
          ? "border-amber-300 bg-amber-100 text-amber-700"
          : "border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-50"
      }`}
    >
      Sample
    </button>
  )
}

export default function PenjualanPage({ penjualan, rokokList, salesList }) {
  const router  = useRouter()
  const [mode,      setMode]      = useState(null)
  const [editing,   setEditing]   = useState(null)
  const [detail,    setDetail]    = useState(null)
  const [dateRange, setDateRange] = useState(defaultDateRange("bulan_ini"))
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
      .filter((r) => r.masukItems.some((it) => !it.is_sample))
      .flatMap((r) =>
        r.masukItems
          .filter((it) => !it.is_sample)
          .map((it) => {
            no++
            return {
              no, tanggal: r.tanggal, sales: r.sales, tipe: r.tipe_penjualan,
              rokok: it.rokok, qty: it.qty, harga: it.harga,
              total: it.qty * it.harga, pembayaran: it.pembayaran,
            }
          })
      )
    downloadExcel(flat, `penjualan-${label}`, [
      { label: "No",         value: (r) => r.no },
      { label: "Tanggal",    value: (r) => r.tanggal },
      { label: "Sales",      value: (r) => r.sales },
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
            <DownloadButton onClick={handleDownload} disabled={!rows.some((r) => r.masukItems.some((it) => !it.is_sample))} />
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
            { key: "no",      label: "No",     render: (_, idx) => idx + 1 },
            { key: "tanggal", label: "Tanggal", render: (r) => fmtTanggal(r.tanggal) },
            { key: "sales",   label: "Sales",   render: (r) => r.sales || <span className="text-neutral-400">—</span> },
            { key: "tipe",    label: "Tipe",    render: (r) => <TipeBadge tipe={r.tipe_penjualan} /> },
            { key: "status",  label: "Status",  render: (r) => <StatusBadge status={r.status} /> },
            {
              key: "keluar", label: "Keluar",
              render: (r) => {
                const reg = r.keluarItems.filter((it) => !it.is_sample).reduce((s, it) => s + it.qty, 0)
                const smp = r.keluarItems.filter((it) =>  it.is_sample).reduce((s, it) => s + it.qty, 0)
                return (
                  <div className="text-sm tabular-nums">
                    <span className="font-medium">{reg}</span><span className="text-neutral-400"> pcs</span>
                    {smp > 0 && <span className="ml-1.5 text-xs text-amber-600">+{smp} sample</span>}
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
            const reg = r.keluarItems.filter((it) => !it.is_sample).reduce((s, it) => s + it.qty, 0)
            const smp = r.keluarItems.filter((it) =>  it.is_sample).reduce((s, it) => s + it.qty, 0)
            return (
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium text-neutral-900">{r.sales || "—"}</span>
                    <TipeBadge tipe={r.tipe_penjualan} />
                    <StatusBadge status={r.status} />
                  </div>
                  <p className="mt-0.5 text-xs text-neutral-500">{fmtTanggal(r.tanggal)}</p>
                  <p className="mt-1 text-xs text-neutral-600">
                    Keluar: <span className="font-medium tabular-nums">{reg} pcs</span>
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
  const masukJual    = record.masukItems.filter((it) => !it.is_sample)
  const totalJual    = masukJual.reduce((s, it) => s + it.qty * it.harga, 0)
  const setoranMatch = record.setoran_total != null && record.setoran_total === totalJual

  return (
    <div className="space-y-5 text-sm">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div><p className="text-xs text-neutral-500">Tanggal</p><p className="font-medium">{fmtTanggal(record.tanggal)}</p></div>
        <div><p className="text-xs text-neutral-500">Sales</p><p className="font-medium">{record.sales || "—"}</p></div>
        <div><p className="text-xs text-neutral-500">Tipe</p><TipeBadge tipe={record.tipe_penjualan} /></div>
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
                <th className="px-3 py-2 text-center">Jenis</th>
              </tr>
            </thead>
            <tbody>
              {record.keluarItems.map((it, i) => (
                <tr key={i} className={`border-b border-neutral-100 ${it.is_sample ? "bg-amber-50/60" : ""}`}>
                  <td className="px-3 py-2.5">{it.rokok}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{it.qty}</td>
                  <td className="px-3 py-2.5 text-center">
                    {it.is_sample ? <SampleBadge /> : <span className="text-xs text-neutral-400">Normal</span>}
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
                  <th className="px-3 py-2 text-left">Pembayaran</th>
                  <th className="px-3 py-2 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {record.masukItems.map((it, i) => (
                  <tr key={i} className={`border-b border-neutral-100 ${it.is_sample ? "bg-amber-50/60" : ""}`}>
                    <td className="px-3 py-2.5">{it.rokok}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{it.qty}</td>
                    <td className="px-3 py-2.5">
                      {it.is_sample
                        ? <SampleBadge />
                        : <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">{it.pembayaran}</span>
                      }
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {it.is_sample ? <span className="text-neutral-400">—</span> : fmtIDR(it.qty * it.harga)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-neutral-200 bg-neutral-50">
                  <td colSpan="3" className="px-3 py-2.5 text-xs font-semibold text-neutral-500">Total Penjualan</td>
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

function PenjualanForm({ initial, rokokList, salesList, onSubmit, onCancel }) {
  const today = new Date().toISOString().slice(0, 10)

  const [tanggal,       setTanggal]       = useState(initial?.tanggal || today)
  const [salesId,       setSalesId]       = useState(initial?.sales_id || "")
  const [tipePenjualan, setTipePenjualan] = useState(initial?.tipe_penjualan || "")
  const [setoranTipe,   setSetoranTipe]   = useState(initial?.setoran_tipe || "")
  const [setoranTotal,  setSetoranTotal]  = useState(initial?.setoran_total ?? "")

  const [keluarItems, setKeluarItems] = useState(
    initial?.keluarItems?.length
      ? initial.keluarItems.map((it) => ({ rokok_id: it.rokok_id, qty: String(it.qty), is_sample: it.is_sample }))
      : [{ rokok_id: "", qty: "", is_sample: false }, { rokok_id: "", qty: "", is_sample: false }]
  )
  const [masukItems, setMasukItems] = useState(
    initial?.masukItems?.length
      ? initial.masukItems.map((it) => ({ rokok_id: it.rokok_id, qty: String(it.qty), pembayaran: it.pembayaran, is_sample: it.is_sample }))
      : [{ rokok_id: "", qty: "", pembayaran: "Cash", is_sample: false }, { rokok_id: "", qty: "", pembayaran: "Cash", is_sample: false }]
  )

  const addKeluar    = () => setKeluarItems([...keluarItems, { rokok_id: "", qty: "", is_sample: false }])
  const removeKeluar = (idx) => setKeluarItems(keluarItems.filter((_, i) => i !== idx))
  const updateKeluar = (idx, field, val) => setKeluarItems(keluarItems.map((it, i) => i === idx ? { ...it, [field]: val } : it))

  const addMasuk    = () => setMasukItems([...masukItems, { rokok_id: "", qty: "", pembayaran: "Cash", is_sample: false }])
  const removeMasuk = (idx) => setMasukItems(masukItems.filter((_, i) => i !== idx))
  const updateMasuk = (idx, field, val) => setMasukItems(masukItems.map((it, i) => i === idx ? { ...it, [field]: val } : it))

  const priceProp     = tipePenjualan ? `harga_${tipePenjualan.toLowerCase()}` : null
  const validKeluar   = keluarItems.filter((it) => it.rokok_id && Number(it.qty) > 0)
  const validMasuk    = masukItems.filter((it) => it.rokok_id && Number(it.qty) > 0)
  const validMasukJual = validMasuk.filter((it) => !it.is_sample)
  const showSetoran   = validMasukJual.length > 0

  const expectedSetoran = validMasukJual.reduce((s, it) => {
    const r = rokokList.find((r) => r.id === it.rokok_id)
    return s + (r && priceProp ? (r[priceProp] || 0) * Number(it.qty) : 0)
  }, 0)
  const setoranNum      = Number(setoranTotal) || 0
  const setoranMatch    = setoranNum > 0 && setoranNum === expectedSetoran
  const setoranMismatch = setoranNum > 0 && setoranNum !== expectedSetoran

  const valid = tanggal && salesId && tipePenjualan && validKeluar.length > 0

  const submit = (e) => {
    e.preventDefault()
    if (!valid) return
    onSubmit({
      tanggal,
      sales_id:       salesId,
      tipe_penjualan: tipePenjualan,
      keluarItems: validKeluar.map((it) => ({
        rokok_id:  it.rokok_id,
        qty:       Number(it.qty),
        is_sample: it.is_sample,
      })),
      masukItems: validMasuk.map((it) => ({
        rokok_id:   it.rokok_id,
        qty:        Number(it.qty),
        harga:      it.is_sample || !priceProp ? 0 : (rokokList.find((r) => r.id === it.rokok_id)?.[priceProp] || 0),
        pembayaran: it.is_sample ? "Cash" : it.pembayaran,
        is_sample:  it.is_sample,
      })),
      setoran_tipe:  showSetoran ? (setoranTipe || null) : null,
      setoran_total: showSetoran && setoranTotal !== "" ? Number(setoranTotal) : null,
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
        <Field label="Tipe Penjualan">
          <SelectInput value={tipePenjualan} onChange={(e) => setTipePenjualan(e.target.value)}>
            <option value="">Pilih tipe</option>
            <option value="Toko">Toko</option>
            <option value="Grosir">Grosir</option>
            <option value="Perorangan">Perorangan</option>
          </SelectInput>
        </Field>
      </div>

      {/* Keluar */}
      <SectionDivider label="Keluar (Barang Dibawa)" />
      <div className="space-y-2">
        {keluarItems.map((item, idx) => {
          const selectedIds = keluarItems.map((it) => it.rokok_id).filter(Boolean)
          const available   = rokokList.filter((r) => r.aktif !== false && (!selectedIds.includes(r.id) || r.id === item.rokok_id))
          return (
            <div key={idx} className={`flex items-end gap-2 rounded-lg px-2 py-1.5 transition ${item.is_sample ? "bg-amber-50" : ""}`}>
              <div className="flex-1 min-w-0">
                <Field label={idx === 0 ? "Rokok" : ""}>
                  <SelectInput value={item.rokok_id} onChange={(e) => updateKeluar(idx, "rokok_id", e.target.value)}>
                    <option value="">Pilih rokok</option>
                    {available.map((r) => <option key={r.id} value={r.id}>{r.nama} (stok: {r.stok ?? 0})</option>)}
                  </SelectInput>
                </Field>
              </div>
              <div className="w-24 shrink-0">
                <Field label={idx === 0 ? "Qty" : ""}>
                  <input type="number" min="1" value={item.qty} onChange={(e) => updateKeluar(idx, "qty", e.target.value)} placeholder="0" className={inputCls} />
                </Field>
              </div>
              <div className="shrink-0 pb-0.5">
                {idx === 0 && <span className="mb-1.5 block text-xs font-medium text-neutral-600 invisible">s</span>}
                <SampleToggle checked={item.is_sample} onChange={(v) => updateKeluar(idx, "is_sample", v)} />
              </div>
              {keluarItems.length > 1 && (
                <div className="shrink-0 pb-0.5">
                  {idx === 0 && <span className="mb-1.5 block text-xs invisible">d</span>}
                  <IconButton icon={Trash2} onClick={() => removeKeluar(idx)} variant="danger" label="Hapus baris" />
                </div>
              )}
            </div>
          )
        })}
        <AddRowButton onClick={addKeluar} />
      </div>

      {/* Masuk */}
      <SectionDivider label="Masuk (Hasil Penjualan)" optional />
      <div className="space-y-2">
        {masukItems.map((item, idx) => {
          const selectedIds = masukItems.map((it) => it.rokok_id).filter(Boolean)
          const available   = rokokList.filter((r) => r.aktif !== false && (!selectedIds.includes(r.id) || r.id === item.rokok_id))
          return (
            <div key={idx} className={`flex items-end gap-2 rounded-lg px-2 py-1.5 transition ${item.is_sample ? "bg-amber-50" : ""}`}>
              <div className="flex-1 min-w-0">
                <Field label={idx === 0 ? "Rokok" : ""}>
                  <SelectInput value={item.rokok_id} onChange={(e) => updateMasuk(idx, "rokok_id", e.target.value)}>
                    <option value="">Pilih rokok</option>
                    {available.map((r) => <option key={r.id} value={r.id}>{r.nama}</option>)}
                  </SelectInput>
                </Field>
              </div>
              <div className="w-20 shrink-0">
                <Field label={idx === 0 ? "Qty" : ""}>
                  <input type="number" min="1" value={item.qty} onChange={(e) => updateMasuk(idx, "qty", e.target.value)} placeholder="0" className={inputCls} />
                </Field>
              </div>
              <div className="w-28 shrink-0">
                {idx === 0 && <span className="mb-1.5 block text-xs font-medium text-neutral-600">Pembayaran</span>}
                {item.is_sample
                  ? <div className="flex h-9 items-center justify-center rounded-lg border border-amber-200 bg-amber-100"><span className="text-xs font-medium text-amber-600">—</span></div>
                  : <SelectInput value={item.pembayaran} onChange={(e) => updateMasuk(idx, "pembayaran", e.target.value)}>
                      <option value="Cash">Cash</option>
                      <option value="Transfer">Transfer</option>
                      <option value="Hutang">Hutang</option>
                    </SelectInput>
                }
              </div>
              <div className="shrink-0 pb-0.5">
                {idx === 0 && <span className="mb-1.5 block text-xs font-medium text-neutral-600 invisible">s</span>}
                <SampleToggle checked={item.is_sample} onChange={(v) => updateMasuk(idx, "is_sample", v)} />
              </div>
              {masukItems.length > 1 && (
                <div className="shrink-0 pb-0.5">
                  {idx === 0 && <span className="mb-1.5 block text-xs invisible">d</span>}
                  <IconButton icon={Trash2} onClick={() => removeMasuk(idx)} variant="danger" label="Hapus baris" />
                </div>
              )}
            </div>
          )
        })}
        <AddRowButton onClick={addMasuk} />
      </div>

      {/* Setoran */}
      {showSetoran && (
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
                    (setoranMatch    ? " border-green-500 focus:border-green-600 focus:ring-green-500/10"
                    : setoranMismatch ? " border-red-400   focus:border-red-500   focus:ring-red-500/10"
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
