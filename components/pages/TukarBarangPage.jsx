"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Trash2, ArrowDown, ArrowUp } from "lucide-react"
import { fmtTanggal, filterByDateRange, defaultDateRange, sortByDateDesc, fmtIDR } from "@/lib/utils"
import { addTukarBarang, updateTukarBarang, deleteTukarBarang } from "@/actions/tukar-barang"
import {
  Card, PageHeader, DateFilter, PrimaryButton, Field, FormActions, SelectInput,
  SearchableSelect, inputCls, RowActions, IconButton, useConfirmWithReason, Button, MoneyInput,
} from "@/components/ui"
import DataTable from "@/components/DataTable"
import Modal from "@/components/Modal"

const PAGE_SIZE = 10

function SelisihBadge({ selisih }) {
  if (selisih === 0) return <span className="inline-flex items-center rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-700">Setara</span>
  if (selisih > 0)   return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700"><ArrowUp className="h-3 w-3" />+{fmtIDR(selisih)}</span>
  return <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700"><ArrowDown className="h-3 w-3" />{fmtIDR(selisih)}</span>
}

export default function TukarBarangPage({ list, sesiList, rokokList, tokoList }) {
  const router = useRouter()
  const { confirmWithReason, ConfirmWithReasonModal } = useConfirmWithReason()
  const [mode, setMode]       = useState(null)
  const [editing, setEditing] = useState(null)
  const [detail, setDetail]   = useState(null)
  const [dateRange, setDateRange] = useState(defaultDateRange("bulan_ini"))
  const [tokoFilter, setTokoFilter] = useState("")
  const [deletingId, setDeletingId] = useState(null)

  const rows = useMemo(() => {
    let filtered = filterByDateRange(list, dateRange)
    if (tokoFilter) filtered = filtered.filter((r) => r.toko_id === tokoFilter)
    return sortByDateDesc(filtered)
  }, [list, dateRange, tokoFilter])

  const close = () => { setMode(null); setEditing(null) }

  const handleDelete = async (r) => {
    const result = await confirmWithReason("Hapus data tukar barang ini? Stok dan pengeluaran terkait akan ikut dibatalkan.", {
      title: "Hapus Tukar Barang",
      variant: "danger",
      confirmLabel: "Ya, Hapus",
    })
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
        subtitle={`Rokok yang ditukar antara toko dan sales${dateRange?.start ? ` — ${fmtTanggal(dateRange.start)} s/d ${fmtTanggal(dateRange.end)}` : " — semua waktu"}.`}
        action={
          <PrimaryButton onClick={() => { setEditing(null); setMode("add") }} icon={Plus}>
            Input Tukar Barang
          </PrimaryButton>
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
            <SearchableSelect
              value={tokoFilter}
              onChange={(e) => setTokoFilter(e.target.value)}
              placeholder="Semua Toko"
              options={[{ value: "", label: "Semua Toko" }, ...tokoList.map((t) => ({ value: t.id, label: t.nama }))]}
            />
          </div>
        </div>
      </div>

      <Card>
        <DataTable
          key={`${dateRange?.start}-${dateRange?.end}-${tokoFilter}`}
          pageSize={PAGE_SIZE}
          rows={rows}
          empty={dateRange?.start ? `Tidak ada tukar barang dari ${fmtTanggal(dateRange.start)} s/d ${fmtTanggal(dateRange.end)}.` : "Belum ada tukar barang."}
          columns={[
            { key: "no",      label: "No",     render: (_, idx) => idx + 1 },
            { key: "tanggal", label: "Tanggal", render: (r) => fmtTanggal(r.tanggal) },
            { key: "toko",    label: "Toko",    render: (r) => r.nama_toko },
            { key: "sales",   label: "Sales",   render: (r) => r.nama_sales },
            { key: "masuk",   label: "Dari Toko", render: (r) => (
              <div className="space-y-0.5">
                {r.itemsMasuk.map((it, i) => <div key={i} className="text-xs text-neutral-700">{i + 1}. {it.rokok} ×{it.qty}</div>)}
              </div>
            )},
            { key: "keluar",  label: "Dari Sales", render: (r) => (
              <div className="space-y-0.5">
                {r.itemsKeluar.map((it, i) => <div key={i} className="text-xs text-neutral-700">{i + 1}. {it.rokok} ×{it.qty}</div>)}
              </div>
            )},
            { key: "selisih", label: "Selisih", align: "right", render: (r) => <SelisihBadge selisih={r.selisih_uang} /> },
            { key: "actions", label: "", align: "right", render: (r) => (
              <RowActions
                onDetail={() => setDetail(r)}
                onEdit={() => { setEditing(r); setMode("edit") }}
                onDelete={() => handleDelete(r)}
                deleteLoading={deletingId === r.id}
              />
            )},
          ]}
        />
      </Card>

      {detail && (
        <Modal title="Detail Tukar Barang" onClose={() => setDetail(null)} width="max-w-4xl">
          <TukarDetail record={detail} />
        </Modal>
      )}

      {mode && (
        <Modal title={mode === "add" ? "Input Tukar Barang" : "Edit Tukar Barang"} onClose={close} width="max-w-5xl">
          <TukarForm
            initial={editing}
            sesiList={sesiList}
            rokokList={rokokList}
            tokoList={tokoList}
            onSubmit={async (data, alasan) => {
              if (mode === "add") await addTukarBarang(data)
              else                await updateTukarBarang(editing.id, data, alasan)
              close()
              router.refresh()
            }}
            onCancel={close}
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
        <div><p className="text-xs text-neutral-500">Tanggal</p><p className="font-medium">{fmtTanggal(record.tanggal)}</p></div>
        <div><p className="text-xs text-neutral-500">Toko</p><p className="font-medium">{record.nama_toko}</p></div>
        <div><p className="text-xs text-neutral-500">Sales</p><p className="font-medium">{record.nama_sales}</p></div>
        <div><p className="text-xs text-neutral-500">Selisih</p><SelisihBadge selisih={record.selisih_uang} /></div>
      </div>
      {record.catatan && (
        <div className="text-sm">
          <p className="text-xs text-neutral-500">Catatan</p>
          <p className="font-medium">{record.catatan}</p>
        </div>
      )}

      <ItemsTable title="Rokok dari Toko (kembalian)" items={record.itemsMasuk} total={record.totalMasuk} />
      <ItemsTable title="Rokok dari Sales (diberikan)" items={record.itemsKeluar} total={record.totalKeluar} />

      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-neutral-600">Nilai dari sales − Nilai dari toko</span>
          <span className="font-semibold tabular-nums">{fmtIDR(record.totalKeluar)} − {fmtIDR(record.totalMasuk)}</span>
        </div>
        <div className="mt-1 flex items-center justify-between border-t border-neutral-200 pt-1">
          <span className="font-semibold text-neutral-700">Selisih</span>
          <span className="font-bold tabular-nums">{record.selisih_uang === 0 ? "Setara" : (record.selisih_uang > 0 ? "+" : "") + fmtIDR(record.selisih_uang)}</span>
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          {record.selisih_uang > 0 && "Toko bayar tambahan ke sales — masuk sebagai pemasukan."}
          {record.selisih_uang < 0 && "Sales kasih kembalian ke toko — tercatat otomatis sebagai pengeluaran."}
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

function hargaDefault(rokok, kategoriToko) {
  if (!rokok) return 0
  return kategoriToko === "grosir" ? rokok.harga_grosir : rokok.harga_toko
}

function TukarForm({ initial, sesiList, rokokList, tokoList, onSubmit, onCancel }) {
  const today = new Date().toISOString().slice(0, 10)
  const [tanggal, setTanggal] = useState(initial?.tanggal || today)
  const [tokoId,  setTokoId]  = useState(initial?.toko_id || "")
  const [sesiId,  setSesiId]  = useState(initial?.sesi_id || "")
  const [catatan, setCatatan] = useState(initial?.catatan || "")
  const [alasan,  setAlasan]  = useState("")

  const [itemsMasuk,  setItemsMasuk]  = useState(
    initial ? initial.itemsMasuk.map((it) => ({ rokok_id: it.rokok_id, qty: String(it.qty), harga_satuan: String(it.harga_satuan) }))
            : [{ rokok_id: "", qty: "", harga_satuan: "" }]
  )
  const [itemsKeluar, setItemsKeluar] = useState(
    initial ? initial.itemsKeluar.map((it) => ({ rokok_id: it.rokok_id, qty: String(it.qty), harga_satuan: String(it.harga_satuan) }))
            : [{ rokok_id: "", qty: "", harga_satuan: "" }]
  )
  const [loading, setLoading] = useState(false)

  const sesiHariIni = useMemo(
    () => sesiList.filter((s) => s.tanggal === tanggal),
    [sesiList, tanggal]
  )
  const tokoSelected = tokoList.find((t) => t.id === tokoId)
  const kategoriToko = tokoSelected?.kategori || "toko"

  const updateItem = (setter, list, idx, field, val) => {
    setter(list.map((it, i) => (i === idx ? { ...it, [field]: val } : it)))
  }
  const updateRokok = (setter, list, idx, rokok_id) => {
    const rokok = rokokList.find((r) => r.id === rokok_id)
    const harga = hargaDefault(rokok, kategoriToko)
    setter(list.map((it, i) => (i === idx ? { ...it, rokok_id, harga_satuan: it.harga_satuan || String(harga) } : it)))
  }
  const addRow = (setter, list)        => setter([...list, { rokok_id: "", qty: "", harga_satuan: "" }])
  const removeRow = (setter, list, idx) => setter(list.filter((_, i) => i !== idx))

  const validMasuk  = itemsMasuk.filter((it) => it.rokok_id && Number(it.qty) > 0)
  const validKeluar = itemsKeluar.filter((it) => it.rokok_id && Number(it.qty) > 0)

  const totalMasuk  = validMasuk.reduce((s, it)  => s + Number(it.qty) * Number(it.harga_satuan || 0), 0)
  const totalKeluar = validKeluar.reduce((s, it) => s + Number(it.qty) * Number(it.harga_satuan || 0), 0)
  const selisih     = totalKeluar - totalMasuk

  const valid = tanggal && tokoId && sesiId
    && validMasuk.length > 0 && validKeluar.length > 0
    && (initial ? alasan.trim().length > 0 : true)

  const submit = async (e) => {
    e.preventDefault()
    if (!valid || loading) return
    setLoading(true)
    try {
      await onSubmit({
        tanggal,
        sesi_id: sesiId,
        toko_id: tokoId,
        catatan: catatan.trim() || null,
        itemsMasuk:  validMasuk.map((it)  => ({ rokok_id: it.rokok_id, qty: Number(it.qty), harga_satuan: Number(it.harga_satuan || 0) })),
        itemsKeluar: validKeluar.map((it) => ({ rokok_id: it.rokok_id, qty: Number(it.qty), harga_satuan: Number(it.harga_satuan || 0) })),
      }, alasan.trim() || undefined)
    } finally {
      setLoading(false)
    }
  }

  const renderItems = (items, setter, kind) => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
          {kind === "masuk" ? "Rokok dari Toko (kembalian)" : "Rokok dari Sales (diberikan ke toko)"}
        </span>
        <span className="text-xs text-neutral-500">
          Total: <span className="font-semibold tabular-nums">{fmtIDR(items.filter(it => it.rokok_id && Number(it.qty) > 0).reduce((s, it) => s + Number(it.qty) * Number(it.harga_satuan || 0), 0))}</span>
        </span>
      </div>
      {items.map((item, idx) => {
        const selectedIds = items.map((it) => it.rokok_id).filter(Boolean)
        const available   = rokokList.filter((r) => r.aktif !== false && (!selectedIds.includes(r.id) || r.id === item.rokok_id))
        const rokok       = rokokList.find((r) => r.id === item.rokok_id)
        const standar     = hargaDefault(rokok, kategoriToko)
        return (
          <div key={idx} className="grid grid-cols-12 items-end gap-2">
            <div className="col-span-12 sm:col-span-6">
              <Field label={idx === 0 ? "Rokok" : ""}>
                <SelectInput value={item.rokok_id} onChange={(e) => updateRokok(setter, items, idx, e.target.value)}>
                  <option value="">Pilih rokok</option>
                  {available.map((r) => <option key={r.id} value={r.id}>{r.nama}</option>)}
                </SelectInput>
              </Field>
            </div>
            <div className="col-span-3 sm:col-span-2">
              <Field label={idx === 0 ? "Qty" : ""}>
                <input type="number" min="1" value={item.qty}
                  onChange={(e) => updateItem(setter, items, idx, "qty", e.target.value)}
                  placeholder="0" className={inputCls} />
              </Field>
            </div>
            <div className="col-span-7 sm:col-span-3">
              <Field label={idx === 0 ? "Harga Satuan" : ""}>
                <MoneyInput value={item.harga_satuan}
                  onChange={(v) => updateItem(setter, items, idx, "harga_satuan", v)}
                  className={inputCls} placeholder={standar ? `Standar: ${standar.toLocaleString("id-ID")}` : "0"} />
              </Field>
              {rokok && Number(item.harga_satuan) !== standar && Number(item.harga_satuan) > 0 && (
                <p className="mt-0.5 text-[10px] text-amber-600">Standar: {fmtIDR(standar)}</p>
              )}
            </div>
            <div className="col-span-2 sm:col-span-1 pb-1 flex justify-end">
              {items.length > 1 && (
                <IconButton icon={Trash2} onClick={() => removeRow(setter, items, idx)} variant="danger" label="Hapus baris" />
              )}
            </div>
          </div>
        )
      })}
      <Button type="button" onClick={() => addRow(setter, items)} variant="secondary" className="w-full border-dashed">
        + Tambah Baris
      </Button>
    </div>
  )

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="Tanggal">
          <input type="date" value={tanggal} onChange={(e) => { setTanggal(e.target.value); setSesiId("") }} className={inputCls} required />
        </Field>
        <Field label="Toko">
          <SearchableSelect
            value={tokoId}
            onChange={(e) => setTokoId(e.target.value)}
            placeholder="Pilih toko"
            options={[{ value: "", label: "Pilih toko" }, ...tokoList.filter((t) => t.aktif !== false).map((t) => ({ value: t.id, label: t.nama }))]}
          />
        </Field>
        <Field label="Sesi Sales (hari itu)">
          <SearchableSelect
            value={sesiId}
            onChange={(e) => setSesiId(e.target.value)}
            placeholder={sesiHariIni.length === 0 ? "Tidak ada sesi" : "Pilih sales"}
            disabled={sesiHariIni.length === 0}
            options={[
              { value: "", label: sesiHariIni.length === 0 ? "Tidak ada sesi pada tanggal ini" : "Pilih sales" },
              ...sesiHariIni.map((s) => ({ value: s.id, label: `${s.sales}${s.status === "selesai" ? " (selesai)" : ""}` })),
            ]}
          />
        </Field>
      </div>

      <div className="rounded-lg border border-neutral-200 p-4">
        {renderItems(itemsMasuk, setItemsMasuk, "masuk")}
      </div>
      <div className="rounded-lg border border-neutral-200 p-4">
        {renderItems(itemsKeluar, setItemsKeluar, "keluar")}
      </div>

      <div className="rounded-lg border-2 border-neutral-900 bg-neutral-50 p-4 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-neutral-600">Nilai sales (keluar) − Nilai toko (masuk)</span>
          <span className="font-medium tabular-nums">{fmtIDR(totalKeluar)} − {fmtIDR(totalMasuk)}</span>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="font-semibold">Selisih</span>
          <SelisihBadge selisih={selisih} />
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          {selisih > 0 && "Toko bayar tambahan ke sales — akan masuk sebagai pemasukan."}
          {selisih < 0 && "Sales kasih kembalian ke toko — otomatis dicatat sebagai pengeluaran."}
          {selisih === 0 && "Setara, tidak ada pertukaran uang."}
        </p>
      </div>

      <Field label="Catatan (opsional)">
        <input type="text" value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="Catatan tambahan..." className={inputCls} />
      </Field>

      {initial && (
        <Field label="Alasan Perubahan">
          <input type="text" value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder="Alasan kenapa data diubah..." className={inputCls} required />
        </Field>
      )}

      <FormActions
        onCancel={onCancel}
        disabled={!valid}
        loading={loading}
        submitLabel={initial ? "Simpan Perubahan" : "Simpan Tukar Barang"}
      />
    </form>
  )
}
