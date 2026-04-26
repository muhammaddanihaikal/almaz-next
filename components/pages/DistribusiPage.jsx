"use client"

import { useMemo, useState, Fragment } from "react"
import { useRouter } from "next/navigation"
import { Plus, Trash2, AlertCircle, CheckCircle, ChevronDown, ChevronUp } from "lucide-react"
import { fmtIDR, fmtTanggal, filterByDateRange, defaultDateRange, sortByDateDesc } from "@/lib/utils"
import { createSesi, updateSesiPagi, submitLaporanSore, editLaporanSore, deleteSesi } from "@/actions/distribusi"
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

export default function DistribusiPage({ sesiList, rokokList, salesList }) {
  const router  = useRouter()
  const [mode,    setMode]    = useState(null)
  const [editing, setEditing] = useState(null)
  const [detail,  setDetail]  = useState(null)
  const [laporanSesi,  setLaporanSesi]  = useState(null) // input laporan baru (status aktif)
  const [editLaporan,  setEditLaporan]  = useState(null) // edit laporan (status selesai)
  const [dateRange,   setDateRange]   = useState(defaultDateRange("bulan_ini"))
  const [salesFilter, setSalesFilter] = useState("")

  const rows = useMemo(() => {
    let filtered = filterByDateRange(sesiList, dateRange)
    if (salesFilter) filtered = filtered.filter((r) => r.sales_id === salesFilter)
    return sortByDateDesc(filtered)
  }, [sesiList, dateRange, salesFilter])

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
          <PrimaryButton onClick={() => { setEditing(null); setMode("add") }} icon={Plus}>
            Buat Sesi
          </PrimaryButton>
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
      </div>

      <Card>
        <DataTable
          key={`${dateRange?.start}-${dateRange?.end}-${salesFilter}`}
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
              key: "flag", label: "Flag",
              render: (r) => (
                <div className="flex flex-col gap-1">
                  {r.flagSetoran && <span className="flex items-center gap-1 text-xs text-red-600"><AlertCircle className="h-3 w-3" /> Selisih setoran</span>}
                  {r.flagQty     && <span className="flex items-center gap-1 text-xs text-orange-600"><AlertCircle className="h-3 w-3" /> Qty tidak cocok</span>}
                  {!r.flagSetoran && !r.flagQty && r.status === "selesai" && <span className="flex items-center gap-1 text-xs text-green-600"><CheckCircle className="h-3 w-3" /> OK</span>}
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
  return (
    <div className="space-y-5 text-sm">
      <div className="grid grid-cols-2 gap-3">
        <div><p className="text-xs text-neutral-500">Tanggal</p><p className="font-medium">{fmtTanggal(record.tanggal)}</p></div>
        <div><p className="text-xs text-neutral-500">Sales</p><p className="font-medium">{record.sales}</p></div>
        <div>
          <p className="text-xs text-neutral-500">Status</p>
          <Badge label={record.status === "selesai" ? "Selesai" : "Aktif"} colorClass={STATUS_COLOR[record.status]} />
        </div>
        {record.flagSetoran && <div className="flex items-center gap-1 text-red-600 text-xs"><AlertCircle className="h-3 w-3" /> Selisih setoran: {fmtIDR(record.nilaiPenjualan)} vs {fmtIDR(record.totalSetoran)}</div>}
        {record.flagQty     && <div className="flex items-center gap-1 text-orange-600 text-xs"><AlertCircle className="h-3 w-3" /> Qty barang tidak cocok</div>}
      </div>

      <Section title="Barang Keluar (Pagi)">
        <SimpleTable rows={record.barangKeluar} cols={["rokok", "qty"]} labels={["Rokok", "Qty"]} />
      </Section>

      {record.penjualan.length > 0 && (
        <Section title="Penjualan Langsung">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-neutral-200 text-neutral-500"><th className="pb-1.5 text-left">Rokok</th><th className="pb-1.5 text-left">Kategori</th><th className="pb-1.5 text-right">Qty</th><th className="pb-1.5 text-right">Harga</th><th className="pb-1.5 text-right">Total</th></tr></thead>
            <tbody>
              {record.penjualan.map((it, i) => (
                <tr key={i} className="border-b border-neutral-100">
                  <td className="py-1.5">{it.rokok}</td>
                  <td className="py-1.5"><Badge label={it.kategori} colorClass={KATEGORI_COLOR[it.kategori] || "bg-neutral-100 text-neutral-600"} /></td>
                  <td className="py-1.5 text-right tabular-nums">{it.qty}</td>
                  <td className="py-1.5 text-right tabular-nums">{fmtIDR(it.harga)}</td>
                  <td className="py-1.5 text-right tabular-nums">{fmtIDR(it.qty * it.harga)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-neutral-200 font-semibold">
                <td colSpan={4} className="py-1.5">Total</td>
                <td className="py-1.5 text-right tabular-nums">{fmtIDR(record.nilaiPenjualan)}</td>
              </tr>
            </tbody>
          </table>
        </Section>
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

      {record.barangKembali.length > 0 && (
        <Section title="Barang Kembali">
          <SimpleTable rows={record.barangKembali} cols={["rokok", "qty"]} labels={["Rokok", "Qty"]} />
        </Section>
      )}

      {record.konsinyasi.length > 0 && (
        <Section title="Konsinyasi">
          {record.konsinyasi.map((k, i) => (
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
          ))}
        </Section>
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

function SesiPagiForm({ initial, rokokList, salesList, onSubmit, onCancel }) {
  const today = new Date().toISOString().slice(0, 10)
  const [tanggal,  setTanggal]  = useState(initial?.tanggal || today)
  const [salesId,  setSalesId]  = useState(initial?.sales_id || "")
  const [catatan,  setCatatan]  = useState(initial?.catatan || "")
  const [items, setItems] = useState(
    initial?.barangKeluar?.length
      ? initial.barangKeluar.map((it) => ({ rokok_id: it.rokok_id, qty: it.qty }))
      : [{ rokok_id: "", qty: "" }, { rokok_id: "", qty: "" }]
  )
  const [error, setError] = useState("")

  const addItem    = () => setItems([...items, { rokok_id: "", qty: "" }])
  const removeItem = (idx) => setItems(items.filter((_, i) => i !== idx))
  const updateItem = (idx, field, val) => setItems(items.map((it, i) => i === idx ? { ...it, [field]: val } : it))

  const validItems = items.filter((it) => it.rokok_id && Number(it.qty) > 0)
  const usedRokokIds = new Set(validItems.map((it) => it.rokok_id))
  const hasDuplikat = usedRokokIds.size !== validItems.length
  const valid = tanggal && salesId && validItems.length >= 1 && !hasDuplikat

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
            options={[{ value: "", label: "Pilih sales" }, ...salesList.filter((s) => s.aktif !== false).map((s) => ({ value: s.id, label: s.nama }))]}
          />
        </Field>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Barang Dibawa</span>
        </div>
        {items.map((item, idx) => {
          const rokokData = rokokList.find((r) => r.id === item.rokok_id)
          const selectedIds = items.map((it) => it.rokok_id).filter(Boolean)
          const countThisId = selectedIds.filter((id) => id === item.rokok_id).length
          const isDupThisRow = countThisId > 1 || selectedIds.filter((id, i) => id === item.rokok_id && i < selectedIds.indexOf(item.rokok_id)).length > 0
          return (
            <div key={idx} className="flex items-end gap-3">
              <div className="flex-1">
                <Field label={idx === 0 ? "Rokok" : ""}>
                  <SelectInput value={item.rokok_id} onChange={(e) => updateItem(idx, "rokok_id", e.target.value)}>
                    <option value="">Pilih rokok</option>
                    {rokokList.filter((r) => r.aktif !== false && (r.id === item.rokok_id || !selectedIds.slice(0, idx).concat(selectedIds.slice(idx + 1)).includes(r.id))).map((r) => (
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
                <div className="pb-1">
                  <IconButton icon={Trash2} onClick={() => removeItem(idx)} variant="danger" label="Hapus baris" />
                </div>
              )}
            </div>
          )
        })}
        <button type="button" onClick={addItem} className="w-full rounded-lg border border-dashed border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-500 hover:border-neutral-400 hover:bg-neutral-50 hover:text-neutral-700">
          + Tambah Baris
        </button>
      </div>

      <Field label="Catatan (opsional)">
        <input type="text" value={catatan} onChange={(e) => setCatatan(e.target.value)} className={inputCls} placeholder="Opsional" />
      </Field>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {hasDuplikat && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-700">
          Rokok tidak boleh dipilih lebih dari sekali dalam satu sesi.
        </div>
      )}

      <FormActions onCancel={onCancel} disabled={!valid} submitLabel={initial ? "Simpan Perubahan" : "Buat Sesi"} />
    </form>
  )
}

// ─── Form Laporan Sore ────────────────────────────────────────────────────────

function LaporanSoreForm({ sesi, rokokList, isEdit = false, onSubmit, onCancel }) {
  // Pre-fill dari data sesi yang sudah ada (saat edit laporan)
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
    const validKonsinyasi = konsinyasiBaru.filter((k) => k.nama_toko && k.kategori && k.tanggal_jatuh_tempo && k.items.some((it) => it.rokok_id && Number(it.qty) > 0))

    // Hitung barang kembali otomatis
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

  return (
    <form onSubmit={submit} className="space-y-6">

      {/* Info barang dibawa */}
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">Barang Dibawa Sales</p>
        <div className="flex flex-wrap gap-2">
          {sesi.barangKeluar.map((it) => (
            <span key={it.rokok_id} className="inline-flex items-center gap-1 rounded-full bg-white border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-700">
              {it.rokok} <span className="text-neutral-400">×</span> <span className="font-semibold">{it.qty}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Penjualan Langsung */}
      <SectionCard title="Penjualan Langsung">
        <PenjualanLangsungInput
          penjualan={penjualan}
          setPenjualan={setPenjualan}
          rokokList={rokokList}
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


      {/* Konsinyasi Baru */}
      <SectionCard title="Konsinyasi Baru (Opsional)">
        {konsinyasiBaru.map((k, idx) => (
          <KonsinyasiBaruInput
            key={idx}
            data={k}
            rokokList={rokokList}
            onChange={(updated) => setKonsinyasiBaru(konsinyasiBaru.map((x, i) => i === idx ? updated : x))}
            onRemove={() => setKonsinyasiBaru(konsinyasiBaru.filter((_, i) => i !== idx))}
          />
        ))}
        <button
          type="button"
          onClick={() => setKonsinyasiBaru([...konsinyasiBaru, { nama_toko: "", kategori: "toko", tanggal_jatuh_tempo: "", catatan: "", items: [{ rokok_id: "", qty: "" }] }])}
          className="w-full rounded-lg border border-dashed border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-500 hover:border-neutral-400 hover:bg-neutral-50"
        >
          + Tambah Konsinyasi
        </button>
      </SectionCard>

      {/* Penyelesaian Konsinyasi */}
      {sesi.konsinyasi?.filter((k) => k.status === "aktif").length > 0 && (
        <SectionCard title="Penyelesaian Konsinyasi">
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
  // Start dari default (semua rokok keluar, kategori grosir+toko)
  const result = buildDefaultPenjualan(barangKeluar)
  // Pre-fill qty dari data yang sudah tersimpan
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

function PenjualanLangsungInput({ penjualan, setPenjualan, rokokList, barangKeluar = [], showPerorangan, setShowPerorangan }) {
  const categories = showPerorangan ? ["grosir", "toko", "perorangan"] : ["grosir", "toko"]
  const rokok_ids  = [...new Set(penjualan.map((it) => it.rokok_id))]

  // Map rokok_id -> qty dibawa
  const qtyDibawa = Object.fromEntries(barangKeluar.map((it) => [it.rokok_id, it.qty]))

  const updateQty = (rokok_id, kategori, val) => {
    setPenjualan(penjualan.map((it) =>
      it.rokok_id === rokok_id && it.kategori === kategori ? { ...it, qty: val } : it
    ))
  }

  // Hitung total qty terjual per rokok (semua kategori)
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
            <th className="pb-2 text-right pr-3">Dibawa</th>
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
                  <td className="py-2 pr-3 font-medium">{sample?.rokok}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-neutral-500 text-xs">{dibawa}</td>
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
                    <td colSpan={2 + categories.length} className="pb-1.5 pt-0">
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

function KonsinyasiBaruInput({ data, rokokList, onChange, onRemove }) {
  const [open, setOpen] = useState(true)

  const updateItem = (idx, field, val) =>
    onChange({ ...data, items: data.items.map((it, i) => i === idx ? { ...it, [field]: val } : it) })

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-3 space-y-3">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-2 text-sm font-medium text-neutral-700">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          {data.nama_toko || "Konsinyasi Baru"}
        </button>
        <IconButton icon={Trash2} onClick={onRemove} variant="danger" label="Hapus" />
      </div>
      {open && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Nama Toko">
              <input type="text" value={data.nama_toko} onChange={(e) => onChange({ ...data, nama_toko: e.target.value })} className={inputCls} placeholder="Nama toko" />
            </Field>
            <Field label="Kategori">
              <SelectInput value={data.kategori} onChange={(e) => onChange({ ...data, kategori: e.target.value })}>
                <option value="toko">Toko</option>
                <option value="grosir">Grosir</option>
              </SelectInput>
            </Field>
            <Field label="Jatuh Tempo">
              <input type="date" value={data.tanggal_jatuh_tempo} onChange={(e) => onChange({ ...data, tanggal_jatuh_tempo: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Catatan (opsional)">
              <input type="text" value={data.catatan} onChange={(e) => onChange({ ...data, catatan: e.target.value })} className={inputCls} placeholder="Opsional" />
            </Field>
          </div>
          {data.items.map((item, idx) => (
            <div key={idx} className="flex items-end gap-3">
              <div className="flex-1">
                <Field label={idx === 0 ? "Rokok" : ""}>
                  <SelectInput value={item.rokok_id} onChange={(e) => updateItem(idx, "rokok_id", e.target.value)}>
                    <option value="">Pilih rokok</option>
                    {rokokList.filter((r) => r.aktif !== false).map((r) => (
                      <option key={r.id} value={r.id}>{r.nama}</option>
                    ))}
                  </SelectInput>
                </Field>
              </div>
              <div className="w-24">
                <Field label={idx === 0 ? "Qty" : ""}>
                  <input type="number" min="1" value={item.qty} onChange={(e) => updateItem(idx, "qty", e.target.value)} placeholder="0" className={inputCls} />
                </Field>
              </div>
              {data.items.length > 1 && (
                <div className="pb-1">
                  <IconButton icon={Trash2} onClick={() => onChange({ ...data, items: data.items.filter((_, i) => i !== idx) })} variant="danger" label="Hapus" />
                </div>
              )}
            </div>
          ))}
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
