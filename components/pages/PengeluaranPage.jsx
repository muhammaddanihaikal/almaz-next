"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Eye } from "lucide-react"
import { fmtIDR, fmtTanggal, filterByDateRange, defaultDateRange, sortByDateDesc, downloadExcel } from "@/lib/utils"
import { addPengeluaran, updatePengeluaran, deletePengeluaran } from "@/actions/pengeluaran"
import { Card, PageHeader, DateFilter, DownloadButton, PrimaryButton, Field, FormActions, RowActions, inputCls, useConfirmWithReason } from "@/components/ui"
import DataTable from "@/components/DataTable"
import Modal from "@/components/Modal"

const PAGE_SIZE = 10

const SUMBER_LABEL = {
  penjualan: "Uang Penjualan",
  lainnya: "Di Luar Penjualan",
}

export default function PengeluaranPage({ role, pengeluaranList, sesiList, titipJualList }) {
  const router = useRouter()
  const { confirmWithReason, ConfirmWithReasonModal } = useConfirmWithReason()
  const [mode, setMode] = useState(null)
  const [editing, setEditing] = useState(null)
  const [detail, setDetail] = useState(null)
  const [dateRange, setDateRange] = useState(defaultDateRange("bulan_ini"))

  const rows = useMemo(
    () => sortByDateDesc(filterByDateRange(pengeluaranList, dateRange)),
    [pengeluaranList, dateRange]
  )

  const totalPengeluaran = useMemo(() => rows.reduce((s, r) => s + r.jumlah, 0), [rows])
  const totalPengeluaranPenjualan = useMemo(
    () => rows.filter((r) => r.sumber === "penjualan").reduce((s, r) => s + r.jumlah, 0),
    [rows]
  )

  const handleDownload = () => {
    const label = dateRange?.start ? `${dateRange.start}_${dateRange.end}` : "semua-waktu"
    downloadExcel(rows, `pengeluaran-${label}`, [
      { label: "No",         value: (_, i) => i + 1 },
      { label: "Tanggal",    value: (r) => r.tanggal },
      { label: "Sumber",     value: (r) => SUMBER_LABEL[r.sumber] ?? r.sumber },
      { label: "Keterangan", value: (r) => r.keterangan },
      { label: "Jumlah",     value: (r) => r.jumlah },
    ])
  }

  const close = () => { setMode(null); setEditing(null) }

  const handleDelete = async (r) => {
    const alasan = await confirmWithReason(`Hapus pengeluaran "${r.keterangan}"?`, { title: "Hapus Pengeluaran", variant: "danger", confirmLabel: "Ya, Hapus" })
    if (!alasan) return
    await deletePengeluaran(r.id, alasan)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pengeluaran"
        subtitle={`Daftar pengeluaran${dateRange?.start ? ` — ${fmtTanggal(dateRange.start)} s/d ${fmtTanggal(dateRange.end)}` : " — semua waktu"}.`}
        action={
          <div className="flex items-center gap-2">
            <DownloadButton onClick={handleDownload} disabled={!rows.length} />
            {role !== "staff" && (
              <PrimaryButton onClick={() => { setEditing(null); setMode("add") }} icon={Plus}>
                Catat Pengeluaran
              </PrimaryButton>
            )}
          </div>
        }
      />

      <div className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
          <label className="text-sm font-medium text-neutral-600 sm:w-14">Waktu:</label>
          <DateFilter value={dateRange} onChange={setDateRange} />
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-neutral-100 pt-3 text-sm">
          <div className="text-neutral-600">
            Pengeluaran (penjualan):{" "}
            <span className="font-semibold text-red-600">{fmtIDR(totalPengeluaranPenjualan)}</span>
          </div>
          <div className="text-neutral-600">
            Pengeluaran (lainnya):{" "}
            <span className="font-semibold text-orange-500">{fmtIDR(totalPengeluaran - totalPengeluaranPenjualan)}</span>
          </div>
        </div>
      </div>

      <Card>
        <DataTable
          key={`${dateRange?.start}-${dateRange?.end}`}
          pageSize={PAGE_SIZE}
          rows={rows}
          empty={dateRange?.start ? `Tidak ada pengeluaran dari ${fmtTanggal(dateRange.start)} s/d ${fmtTanggal(dateRange.end)}.` : "Belum ada data pengeluaran."}
          columns={[
            { key: "no",         label: "No",         render: (_, idx) => idx + 1 },
            { key: "tanggal",    label: "Tanggal",    render: (r) => fmtTanggal(r.tanggal) },
            {
              key: "sumber", label: "Sumber",
              render: (r) => (
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                  r.sumber === "penjualan"
                    ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20"
                    : "bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-600/20"
                }`}>
                  {SUMBER_LABEL[r.sumber] ?? r.sumber}
                </span>
              ),
            },
            { key: "keterangan", label: "Keterangan", render: (r) => <span className="whitespace-pre-wrap">{r.keterangan}</span> },
            { key: "jumlah",     label: "Jumlah",     align: "right", render: (r) => <span className="font-medium text-red-600">{fmtIDR(r.jumlah)}</span> },
            {
              key: "actions", label: "", align: "right",
              render: (r) => (
                <div className="flex items-center justify-end gap-1">
                  <button
                    onClick={() => setDetail(r)}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 transition"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Detail
                  </button>
                  <RowActions
                    onEdit={role !== "staff" ? () => { setEditing(r); setMode("edit") } : null}
                    onDelete={role !== "staff" ? () => handleDelete(r) : null}
                  />
                </div>
              ),
            },
          ]}
          mobileRender={(r) => (
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium text-neutral-900">{r.keterangan}</p>
                <div className="mt-0.5 flex items-center gap-2">
                  <p className="text-xs text-neutral-500">{fmtTanggal(r.tanggal)}</p>
                  <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium ${
                    r.sumber === "penjualan"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-orange-50 text-orange-700"
                  }`}>
                    {r.sumber === "penjualan" ? "Penjualan" : "Lainnya"}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-sm font-medium text-red-600 mr-1">{fmtIDR(r.jumlah)}</span>
                <button
                  onClick={() => setDetail(r)}
                  className="rounded p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                >
                  <Eye className="h-4 w-4" />
                </button>
                <RowActions
                  onEdit={() => { setEditing(r); setMode("edit") }}
                  onDelete={() => handleDelete(r)}
                />
              </div>
            </div>
          )}
        />
      </Card>

      {detail && (
        <Modal title="Detail Pengeluaran" onClose={() => setDetail(null)}>
          <PengeluaranDetail
            row={detail}
            sesiList={sesiList}
            titipJualList={titipJualList}
            pengeluaranList={pengeluaranList}
            onClose={() => setDetail(null)}
          />
        </Modal>
      )}

      {mode && (
        <Modal title={mode === "add" ? "Tambah Pengeluaran" : "Edit Pengeluaran"} onClose={close}>
          <PengeluaranForm
            initial={editing}
            onSubmit={async (data) => {
              if (mode === "add") {
                await addPengeluaran(data)
                close()
                router.refresh()
              } else {
                close()
                const alasan = await confirmWithReason(`Edit pengeluaran "${editing.keterangan}"?`, { title: "Edit Pengeluaran", confirmLabel: "Ya, Simpan" })
                if (!alasan) return
                await updatePengeluaran(editing.id, data, alasan)
                router.refresh()
              }
            }}
            onCancel={close}
          />
        </Modal>
      )}
      {ConfirmWithReasonModal}
    </div>
  )
}

function PengeluaranDetail({ row, sesiList, titipJualList, pengeluaranList, onClose }) {
  // Anchor ke awal bulan dari tanggal pengeluaran (selaras dengan getPosisiUang di server / audit log)
  const startTgl = useMemo(() => {
    const d = new Date(row.tanggal)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    return `${y}-${m}-01`
  }, [row.tanggal])
  
  const penjualanSaatItu = useMemo(() => {
    const fromSesi = sesiList
      .filter((s) => s.tanggal >= startTgl && s.tanggal <= row.tanggal)
      .reduce((s, sesi) => s + sesi.penjualan.reduce((ss, it) => ss + it.qty * it.harga, 0), 0)
    const fromTitip = titipJualList
      .filter((k) => k.status === "selesai" && k.tanggal_selesai >= startTgl && k.tanggal_selesai <= row.tanggal)
      .reduce((s, k) => s + (k.nilaiTerjual ?? 0), 0)
    return fromSesi + fromTitip
  }, [sesiList, titipJualList, row.tanggal, startTgl])

  // Pengeluaran sumber=penjualan yang terjadi SEBELUM pengeluaran ini secara kronologis
  // (tanggal lebih awal, atau tanggal sama tapi createdAt lebih awal)
  const pengeluaranSebelumnya = useMemo(() =>
    pengeluaranList
      .filter((p) => {
        if (p.sumber !== "penjualan") return false
        if (p.tanggal < startTgl || p.tanggal > row.tanggal) return false
        if (p.id === row.id) return false
        if (p.tanggal < row.tanggal) return true
        return (p.createdAt ?? "") < (row.createdAt ?? "")
      })
      .reduce((s, p) => s + p.jumlah, 0),
    [pengeluaranList, row.tanggal, row.id, row.createdAt, startTgl]
  )

  const uangPenjualanTersedia = penjualanSaatItu - pengeluaranSebelumnya
  const isDariPenjualan = row.sumber === "penjualan"
  const pengeluaranDikurangkan = isDariPenjualan ? row.jumlah : 0
  const sisaSaatItu = uangPenjualanTersedia - pengeluaranDikurangkan

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-neutral-500">Tanggal</span>
          <span className="font-medium text-neutral-900">{fmtTanggal(row.tanggal)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-neutral-500">Sumber Dana</span>
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
            row.sumber === "penjualan"
              ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20"
              : "bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-600/20"
          }`}>
            {SUMBER_LABEL[row.sumber] ?? row.sumber}
          </span>
        </div>
        <div className="flex items-start justify-between gap-4 text-sm">
          <span className="text-neutral-500 shrink-0">Keterangan</span>
          <span className="font-medium text-neutral-900 text-right whitespace-pre-wrap">{row.keterangan}</span>
        </div>
        <div className="flex items-center justify-between text-sm border-t border-neutral-100 pt-3">
          <span className="text-neutral-500">Jumlah</span>
          <span className="text-lg font-bold text-red-600">{fmtIDR(row.jumlah)}</span>
        </div>
      </div>

      <div className="rounded-lg bg-neutral-50 border border-neutral-200 p-3 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-2">
          Posisi Uang Penjualan pada saat itu
        </p>
        <div className="flex items-center justify-between text-sm">
          <span className="text-neutral-600">Uang Penjualan</span>
          <span className="font-semibold text-emerald-600">{fmtIDR(uangPenjualanTersedia)}</span>
        </div>
        {isDariPenjualan ? (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="text-neutral-600">Pengeluaran ini</span>
              <span className="font-semibold text-red-600">- {fmtIDR(pengeluaranDikurangkan)}</span>
            </div>
            <div className="flex items-center justify-between text-sm border-t border-neutral-200 pt-2">
              <span className="font-medium text-neutral-700">Sisa Uang Penjualan</span>
              <span className={`font-bold ${sisaSaatItu >= 0 ? "text-neutral-900" : "text-red-700"}`}>
                {fmtIDR(sisaSaatItu)}
              </span>
            </div>
          </>
        ) : (
          <p className="text-xs text-neutral-500 border-t border-neutral-200 pt-2">
            Pengeluaran ini menggunakan dana di luar penjualan, jadi <span className="font-medium text-neutral-700">tidak mengurangi uang penjualan</span>.
          </p>
        )}
      </div>

      <div className="flex justify-end pt-1">
        <button
          onClick={onClose}
          className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          Tutup
        </button>
      </div>
    </div>
  )
}

function PengeluaranForm({ initial, onSubmit, onCancel }) {
  const today = new Date().toISOString().slice(0, 10)
  const [tanggal,    setTanggal]    = useState(initial?.tanggal || today)
  const [keterangan, setKeterangan] = useState(initial?.keterangan || "")
  const [jumlah,     setJumlah]     = useState(initial?.jumlah || "")
  const [sumber,     setSumber]     = useState(initial?.sumber || "penjualan")
  const [loading,    setLoading]    = useState(false)

  const valid = tanggal && keterangan.trim().length > 0 && Number(jumlah) > 0

  const submit = async (e) => {
    e.preventDefault()
    if (!valid || loading) return
    setLoading(true)
    try {
      await onSubmit({ tanggal, keterangan: keterangan.trim(), jumlah: Number(jumlah), sumber })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Tanggal">
        <input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} className={inputCls} required autoFocus />
      </Field>
      <Field label="Sumber Dana">
        <div className="flex gap-3">
          {[
            { value: "penjualan", label: "Uang Penjualan" },
            { value: "lainnya",   label: "Di Luar Penjualan" },
          ].map((opt) => (
            <label key={opt.value} className={`flex flex-1 cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
              sumber === opt.value
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400"
            }`}>
              <input
                type="radio"
                name="sumber"
                value={opt.value}
                checked={sumber === opt.value}
                onChange={() => setSumber(opt.value)}
                className="sr-only"
              />
              <span className={`h-3.5 w-3.5 shrink-0 rounded-full border-2 ${
                sumber === opt.value ? "border-white bg-white" : "border-neutral-400"
              }`} />
              {opt.label}
            </label>
          ))}
        </div>
      </Field>
      <Field label="Jumlah (Rp)">
        <input type="number" min="1" value={jumlah} onChange={(e) => setJumlah(e.target.value)} placeholder="0" className={inputCls} required />
      </Field>
      <Field label="Keterangan">
        <textarea
          rows={3}
          value={keterangan}
          onChange={(e) => setKeterangan(e.target.value)}
          placeholder="Misal: Bensin, Makan siang, Servis motor..."
          className={`${inputCls} resize-none`}
          required
        />
      </Field>
      <FormActions onCancel={onCancel} disabled={!valid} loading={loading} submitLabel={initial ? "Simpan Perubahan" : "Tambah Pengeluaran"} />
    </form>
  )
}
