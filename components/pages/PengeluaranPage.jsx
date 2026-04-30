"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { fmtIDR, fmtTanggal, filterByDateRange, defaultDateRange, sortByDateDesc, downloadExcel } from "@/lib/utils"
import { addPengeluaran, updatePengeluaran, deletePengeluaran } from "@/actions/pengeluaran"
import { Card, PageHeader, DateFilter, DownloadButton, PrimaryButton, Field, FormActions, RowActions, inputCls, useConfirm } from "@/components/ui"
import DataTable from "@/components/DataTable"
import Modal from "@/components/Modal"

const PAGE_SIZE = 10

export default function PengeluaranPage({ pengeluaranList }) {
  const router = useRouter()
  const { confirm, ConfirmModal } = useConfirm()
  const [mode, setMode] = useState(null)
  const [editing, setEditing] = useState(null)
  const [dateRange, setDateRange] = useState(defaultDateRange("bulan_ini"))
  const [deletingId, setDeletingId] = useState(null)

  const rows = useMemo(
    () => sortByDateDesc(filterByDateRange(pengeluaranList, dateRange)),
    [pengeluaranList, dateRange]
  )

  const totalPengeluaran = useMemo(() => rows.reduce((s, r) => s + r.jumlah, 0), [rows])

  const handleDownload = () => {
    const label = dateRange?.start ? `${dateRange.start}_${dateRange.end}` : "semua-waktu"
    downloadExcel(rows, `pengeluaran-${label}`, [
      { label: "No",         value: (_, i) => i + 1 },
      { label: "Tanggal",    value: (r) => r.tanggal },
      { label: "Keterangan", value: (r) => r.keterangan },
      { label: "Jumlah",     value: (r) => r.jumlah },
    ])
  }

  const close = () => { setMode(null); setEditing(null) }

  const handleDelete = async (r) => {
    const ok = await confirm(`Hapus pengeluaran "${r.keterangan}"?`, { title: "Hapus Pengeluaran", variant: "danger", confirmLabel: "Ya, Hapus" })
    if (!ok) return
    
    setDeletingId(r.id)
    try {
      await deletePengeluaran(r.id)
      router.refresh()
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pengeluaran"
        subtitle={`Daftar pengeluaran dari uang penjualan${dateRange?.start ? ` — ${fmtTanggal(dateRange.start)} s/d ${fmtTanggal(dateRange.end)}` : " — semua waktu"}.`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <DownloadButton onClick={handleDownload} disabled={!rows.length} />
            <PrimaryButton onClick={() => { setEditing(null); setMode("add") }} icon={Plus}>
              Tambah Pengeluaran
            </PrimaryButton>
          </div>
        }
      />

      <div className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:flex-row sm:items-center sm:gap-6">
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
          <label className="text-sm font-medium text-neutral-600 sm:w-14">Waktu:</label>
          <DateFilter value={dateRange} onChange={setDateRange} />
        </div>
        {rows.length > 0 && (
          <div className="ml-auto text-sm font-medium text-neutral-700">
            Total: <span className="font-semibold text-red-600">{fmtIDR(totalPengeluaran)}</span>
          </div>
        )}
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
            { key: "keterangan", label: "Keterangan", render: (r) => r.keterangan },
            { key: "jumlah",     label: "Jumlah",     align: "right", render: (r) => <span className="font-medium text-red-600">{fmtIDR(r.jumlah)}</span> },
            {
              key: "actions", label: "", align: "right",
              render: (r) => (
                <RowActions
                  onEdit={() => { setEditing(r); setMode("edit") }}
                  onDelete={() => handleDelete(r)}
                />
              ),
            },
          ]}
          mobileRender={(r) => (
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-medium text-neutral-900">{r.keterangan}</p>
                <p className="text-xs text-neutral-500">{fmtTanggal(r.tanggal)}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm font-medium text-red-600">{fmtIDR(r.jumlah)}</span>
                <RowActions
                  onEdit={() => { setEditing(r); setMode("edit") }}
                  onDelete={() => handleDelete(r)}
                />
              </div>
            </div>
          )}
        />
      </Card>

      {mode && (
        <Modal title={mode === "add" ? "Tambah Pengeluaran" : "Edit Pengeluaran"} onClose={close}>
          <PengeluaranForm
            initial={editing}
            onSubmit={async (data) => {
              if (mode === "add") await addPengeluaran(data)
              else await updatePengeluaran(editing.id, data)
              close()
              router.refresh()
            }}
            onCancel={close}
          />
        </Modal>
      )}
      {ConfirmModal}
    </div>
  )
}

function PengeluaranForm({ initial, onSubmit, onCancel }) {
  const today = new Date().toISOString().slice(0, 10)
  const [tanggal,    setTanggal]    = useState(initial?.tanggal || today)
  const [keterangan, setKeterangan] = useState(initial?.keterangan || "")
  const [jumlah,     setJumlah]     = useState(initial?.jumlah || "")
  const [loading,    setLoading]    = useState(false)

  const valid = tanggal && keterangan.trim().length > 0 && Number(jumlah) > 0

  const submit = async (e) => {
    e.preventDefault()
    if (!valid || loading) return
    setLoading(true)
    try {
      await onSubmit({ tanggal, keterangan: keterangan.trim(), jumlah: Number(jumlah) })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Tanggal">
        <input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} className={inputCls} required autoFocus />
      </Field>
      <Field label="Jumlah (Rp)">
        <input type="number" min="1" value={jumlah} onChange={(e) => setJumlah(e.target.value)} placeholder="0" className={inputCls} required />
      </Field>
      <Field label="Keterangan">
        <input type="text" value={keterangan} onChange={(e) => setKeterangan(e.target.value)} placeholder="Misal: Bensin, Makan siang, Servis motor..." className={inputCls} required />
      </Field>
      <FormActions onCancel={onCancel} disabled={!valid} loading={loading} submitLabel={initial ? "Simpan Perubahan" : "Tambah Pengeluaran"} />
    </form>
  )
}
