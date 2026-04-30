"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { fmtTanggal, filterByDateRange, defaultDateRange, sortByDateDesc, downloadExcel } from "@/lib/utils"
import { saveAbsensi, deleteAbsensi } from "@/actions/absensi"
import { Card, PageHeader, DateFilter, DownloadButton, PrimaryButton, Field, FormActions, SelectInput, RowActions, inputCls, useConfirm } from "@/components/ui"
import DataTable from "@/components/DataTable"
import Modal from "@/components/Modal"

const PAGE_SIZE = 10

const STATUS_LABEL = { hadir: "Hadir", izin: "Izin", alpha: "Alpha", sakit: "Sakit" }
const STATUS_COLOR = {
  hadir: "bg-green-100 text-green-700",
  izin:  "bg-yellow-100 text-yellow-700",
  alpha: "bg-red-100 text-red-700",
  sakit: "bg-blue-100 text-blue-700",
}

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOR[status] || "bg-neutral-100 text-neutral-600"}`}>
      {STATUS_LABEL[status] || status}
    </span>
  )
}

function groupByDate(absensiList) {
  const map = new Map()
  for (const a of absensiList) {
    if (!map.has(a.tanggal)) map.set(a.tanggal, [])
    map.get(a.tanggal).push(a)
  }
  return [...map.entries()].map(([tanggal, records]) => ({ tanggal, records }))
}

export default function AbsensiPage({ absensiList, salesList }) {
  const router = useRouter()
  const { confirm, ConfirmModal } = useConfirm()
  const [mode, setMode] = useState(null)
  const [editingTanggal, setEditingTanggal] = useState(null)
  const [detail, setDetail] = useState(null)
  const [dateRange, setDateRange] = useState(defaultDateRange("minggu_ini"))
  const [deletingId, setDeletingId] = useState(null)

  const filteredFlat = useMemo(() => filterByDateRange(absensiList, dateRange), [absensiList, dateRange])
  const rows = useMemo(() => sortByDateDesc(groupByDate(filteredFlat)), [filteredFlat])

  const handleDownload = () => {
    const label = dateRange?.start ? `${dateRange.start}_${dateRange.end}` : "semua-waktu"
    const flat = rows.flatMap((row) =>
      row.records.map((rec) => {
        const s = salesList.find((s) => s.id === rec.sales_id)
        return { tanggal: row.tanggal, sales: s?.nama || "-", status: STATUS_LABEL[rec.status] || rec.status, alasan: rec.reason || "" }
      })
    )
    downloadExcel(flat, `absensi-${label}`, [
      { label: "Tanggal", value: (r) => r.tanggal },
      { label: "Sales",   value: (r) => r.sales },
      { label: "Status",  value: (r) => r.status },
      { label: "Alasan",  value: (r) => r.alasan },
    ])
  }

  const close = () => { setMode(null); setEditingTanggal(null) }

  const handleDelete = async (tanggal) => {
    const ok = await confirm(`Hapus semua data absensi tanggal ${fmtTanggal(tanggal)}?`, { title: "Hapus Absensi", variant: "danger", confirmLabel: "Ya, Hapus" })
    if (!ok) return
    
    setDeletingId(tanggal)
    try {
      await deleteAbsensi(tanggal)
      router.refresh()
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Absensi Sales"
        subtitle={`Rekap kehadiran sales harian${dateRange?.start ? ` — ${fmtTanggal(dateRange.start)} s/d ${fmtTanggal(dateRange.end)}` : " — semua waktu"}.`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <DownloadButton onClick={handleDownload} disabled={!rows.length} />
            <PrimaryButton onClick={() => { setEditingTanggal(null); setMode("add") }} icon={Plus}>
              Input Absensi
            </PrimaryButton>
          </div>
        }
      />

      <div className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:flex-row sm:items-center sm:gap-6">
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
          <label className="text-sm font-medium text-neutral-600 sm:w-14">Waktu:</label>
          <DateFilter value={dateRange} onChange={setDateRange} />
        </div>
      </div>

      <Card>
        <DataTable
          key={`${dateRange?.start}-${dateRange?.end}`}
          pageSize={PAGE_SIZE}
          rows={rows}
          empty={dateRange?.start ? `Tidak ada absensi dari ${fmtTanggal(dateRange.start)} s/d ${fmtTanggal(dateRange.end)}.` : "Belum ada data absensi."}
          columns={[
            { key: "no",      label: "No",      render: (_, idx) => idx + 1 },
            { key: "tanggal", label: "Tanggal", render: (r) => fmtTanggal(r.tanggal) },
            {
              key: "rekap", label: "Rekap Kehadiran",
              render: (r) => {
                const hadir = r.records.filter((a) => a.status === "hadir").length
                const izin  = r.records.filter((a) => a.status === "izin").length
                const sakit = r.records.filter((a) => a.status === "sakit").length
                const alpha = r.records.filter((a) => a.status === "alpha").length
                return (
                  <div className="flex flex-wrap gap-1.5">
                    {hadir > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">{hadir} Hadir</span>}
                    {izin  > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-700">{izin} Izin</span>}
                    {sakit > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">{sakit} Sakit</span>}
                    {alpha > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">{alpha} Alpha</span>}
                  </div>
                )
              },
            },
            { key: "total", label: "Total", align: "right", render: (r) => <span className="text-sm text-neutral-500">{r.records.length} sales</span> },
            {
              key: "actions", label: "", align: "right",
              render: (r) => (
                <RowActions
                  onDetail={() => setDetail(r)}
                  onEdit={() => { setEditingTanggal(r.tanggal); setMode("edit") }}
                  onDelete={() => handleDelete(r.tanggal)}
                />
              ),
            },
          ]}
          mobileRender={(r) => {
            const hadir = r.records.filter((a) => a.status === "hadir").length
            const izin  = r.records.filter((a) => a.status === "izin").length
            const sakit = r.records.filter((a) => a.status === "sakit").length
            const alpha = r.records.filter((a) => a.status === "alpha").length
            return (
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-neutral-900">{fmtTanggal(r.tanggal)}</p>
                    <p className="text-xs text-neutral-500">{r.records.length} sales</p>
                  </div>
                  <RowActions
                    onDetail={() => setDetail(r)}
                    onEdit={() => { setEditingTanggal(r.tanggal); setMode("edit") }}
                    onDelete={() => { handleDelete(r.tanggal) }}
                    deleteLoading={deletingId === r.tanggal}
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {hadir > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">{hadir} Hadir</span>}
                  {izin  > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-700">{izin} Izin</span>}
                  {sakit > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">{sakit} Sakit</span>}
                  {alpha > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">{alpha} Alpha</span>}
                </div>
              </div>
            )
          }}
        />
      </Card>

      {detail && (
        <Modal title={`Detail Absensi — ${fmtTanggal(detail.tanggal)}`} onClose={() => setDetail(null)} width="max-w-2xl">
          <div className="space-y-2">
            {detail.records.map((rec) => {
              const s = salesList.find((s) => s.id === rec.sales_id)
              return (
                <div key={rec.id} className="space-y-1 rounded-lg border border-neutral-100 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-neutral-800">{s?.nama || "—"}</span>
                    <StatusBadge status={rec.status} />
                  </div>
                  {rec.reason && <p className="text-xs text-neutral-500">Alasan: {rec.reason}</p>}
                </div>
              )
            })}
          </div>
        </Modal>
      )}

      {mode && (
        <Modal
          title={mode === "add" ? "Input Absensi" : `Edit Absensi — ${fmtTanggal(editingTanggal)}`}
          onClose={close}
          width="max-w-3xl"
        >
          <AbsensiForm
            tanggal={editingTanggal}
            absensiList={absensiList}
            salesList={salesList}
            onSubmit={async (tanggal, records) => {
              await saveAbsensi(tanggal, records)
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

function AbsensiForm({ tanggal: initialTanggal, absensiList, salesList, onSubmit, onCancel }) {
  const isEdit = !!initialTanggal
  const today = new Date().toISOString().slice(0, 10)
  const [tanggal, setTanggal] = useState(initialTanggal || today)

  // Logika Daftar Sales:
  // 1. Jika Mode Edit: Tampilkan sales yang memiliki record pada tanggal tersebut (agar data lama tidak hilang)
  // 2. Jika Mode Input (Add): HANYA tampilkan sales yang statusnya "aktif"
  const displaySales = useMemo(() => {
    if (isEdit) {
      const existingIds = absensiList.filter((a) => a.tanggal === initialTanggal).map((a) => a.sales_id)
      return salesList.filter((s) => existingIds.includes(s.id))
    }
    return salesList.filter((s) => s.aktif !== false)
  }, [salesList, absensiList, initialTanggal, isEdit])

  const [statuses, setStatuses] = useState(() => {
    const map = {}
    displaySales.forEach((s) => {
      if (isEdit) {
        // Mode Edit: Ikuti data yang sudah ada
        const existing = absensiList.find((a) => a.tanggal === initialTanggal && a.sales_id === s.id)
        map[s.id] = existing?.status || "hadir"
      } else {
        // Mode Input: Selalu default ke "hadir"
        map[s.id] = "hadir"
      }
    })
    return map
  })

  const [reasons, setReasons] = useState(() => {
    const map = {}
    displaySales.forEach((s) => {
      if (isEdit) {
        const existing = absensiList.find((a) => a.tanggal === initialTanggal && a.sales_id === s.id)
        map[s.id] = existing?.reason || ""
      } else {
        map[s.id] = ""
      }
    })
    return map
  })

  const handleTanggalChange = (newTanggal) => {
    if (isEdit) return // Tanggal tidak bisa diubah di mode edit (sesuai props disabled)
    setTanggal(newTanggal)
    
    // Di mode Input (Add), kita tetap biarkan default "hadir" 
    // meskipun user pindah tanggal, sesuai permintaan user.
  }

  const valid = tanggal && displaySales.length > 0

  const [loading, setLoading] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    if (!valid || loading) return
    setLoading(true)
    try {
      const records = displaySales.map((s) => {
        const rec = { sales_id: s.id, status: statuses[s.id] || "hadir" }
        if (statuses[s.id] !== "hadir" && reasons[s.id]) rec.reason = reasons[s.id]
        return rec
      })
      await onSubmit(tanggal, records)
    } finally {
      setLoading(false)
    }
  }

  if (displaySales.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-neutral-500">
          {isEdit ? "Data sales untuk tanggal ini tidak ditemukan." : "Belum ada sales aktif yang terdaftar."}
        </p>
        <div className="flex justify-end">
          <Button type="button" onClick={onCancel} variant="secondary">Tutup</Button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Tanggal">
        <input type="date" value={tanggal} onChange={(e) => handleTanggalChange(e.target.value)} className={inputCls} disabled={!!initialTanggal} required />
      </Field>
      <div className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Status Kehadiran</span>
        {displaySales.map((s) => {
          const status = statuses[s.id] || "hadir"
          return (
            <div key={s.id} className="space-y-2 rounded-lg border border-neutral-100 bg-neutral-50 px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-neutral-800">{s.nama}</span>
                <div className="w-36">
                  <SelectInput value={status} onChange={(e) => setStatuses((prev) => ({ ...prev, [s.id]: e.target.value }))}>
                    <option value="hadir">Hadir</option>
                    <option value="izin">Izin</option>
                    <option value="sakit">Sakit</option>
                    <option value="alpha">Alpha</option>
                  </SelectInput>
                </div>
              </div>
              {status !== "hadir" && (
                <input
                  type="text"
                  value={reasons[s.id] || ""}
                  onChange={(e) => setReasons((prev) => ({ ...prev, [s.id]: e.target.value }))}
                  placeholder="Misal: Sakit, Keperluan..."
                  className={inputCls}
                />
              )}
            </div>
          )
        })}
      </div>
      <FormActions onCancel={onCancel} disabled={!valid} loading={loading} submitLabel={initialTanggal ? "Simpan Perubahan" : "Simpan Absensi"} />
    </form>
  )
}
