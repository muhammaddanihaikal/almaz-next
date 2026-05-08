"use client"

import { useMemo, useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { addToko, updateToko, deleteToko, toggleAktifToko } from "@/actions/toko"
import { Card, PageHeader, PrimaryButton, RowActions, Field, FormActions, Toggle, SelectInput, inputCls, useConfirm } from "@/components/ui"
import DataTable from "@/components/DataTable"
import Modal from "@/components/Modal"

const PAGE_SIZE = 10

const KATEGORI_COLOR = {
  grosir: "bg-violet-100 text-violet-700",
  toko:   "bg-blue-100 text-blue-700",
}

function SkeletonText({ w = "w-24" }) {
  return <div className={`h-3.5 ${w} animate-pulse rounded bg-neutral-200`} />
}

export default function TokoPage({ role, tokoList, usedTokoIds = [] }) {
  const router = useRouter()
  const { confirm, ConfirmModal } = useConfirm()
  const [localList, setLocalList] = useState(tokoList)
  const [mode,    setMode]    = useState(null)
  const [editing, setEditing] = useState(null)

  useEffect(() => { setLocalList(tokoList) }, [tokoList])

  const upsertLocal = (record) => {
    if (!record?.id) return
    setLocalList((prev) =>
      prev.some((r) => r.id === record.id)
        ? prev.map((r) => r.id === record.id ? record : r)
        : [record, ...prev]
    )
  }
  const removeLocal = (id) => setLocalList((prev) => prev.filter((r) => r.id !== id))

  const rows = useMemo(() => {
    const pending = localList.filter((r) => r._pending)
    const rest = localList.filter((r) => !r._pending).sort((a, b) => a.nama.localeCompare(b.nama, "id"))
    return [...pending, ...rest]
  }, [localList])

  const usedSet = useMemo(() => new Set(usedTokoIds), [usedTokoIds])
  const isUsed = (id) => usedSet.has(id)

  const close = () => { setMode(null); setEditing(null) }

  const handleDelete = async (t) => {
    const ok = await confirm(`Hapus toko "${t.nama}"?`, { title: "Hapus Toko", variant: "danger", confirmLabel: "Ya, Hapus" })
    if (!ok) return
    removeLocal(t.id)
    deleteToko(t.id).catch(async (error) => {
      upsertLocal(t)
      await confirm(error?.message || "Gagal menghapus toko.", { title: "Gagal Hapus", hideCancel: true })
    })
  }

  const handleToggle = (id) => {
    setLocalList((prev) => prev.map((t) => t.id === id ? { ...t, aktif: !t.aktif } : t))
    toggleAktifToko(id).catch(() => {
      setLocalList((prev) => prev.map((t) => t.id === id ? { ...t, aktif: !t.aktif } : t))
    })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Master Toko"
        subtitle={`${tokoList.length} toko terdaftar — digunakan untuk titip jual.`}
        action={
          role !== "staff" && (
            <PrimaryButton onClick={() => { setEditing(null); setMode("add") }} icon={Plus}>
              Tambah Toko
            </PrimaryButton>
          )
        }
      />

      <Card>
        <DataTable
          pageSize={PAGE_SIZE}
          rows={rows}
          empty="Belum ada data toko."
          columns={[
            { key: "no",       label: "No",       render: (_, idx) => idx + 1 },
            { key: "nama",     label: "Nama Toko", render: (r) => r._pending ? <SkeletonText w="w-28" /> : r.nama },
            { key: "alamat",   label: "Alamat",    render: (r) => r._pending ? <SkeletonText w="w-32" /> : r.alamat || <span className="text-neutral-400">—</span> },
            {
              key: "kategori", label: "Kategori Default",
              render: (r) => r._pending ? <SkeletonText w="w-16" /> : (
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${KATEGORI_COLOR[r.kategori] || "bg-neutral-100 text-neutral-600"}`}>
                  {r.kategori}
                </span>
              ),
            },
            {
              key: "aktif", label: "Aktif", align: "center",
              render: (r) => r._pending ? <SkeletonText w="w-8" /> : <Toggle checked={r.aktif ?? true} onChange={() => handleToggle(r.id)} disabled={role === "staff"} />,
            },
            {
              key: "actions", label: "", align: "right",
              render: (r) => {
                if (r._pending) return (
                  <div className="flex items-center justify-end gap-2 pr-1">
                    <svg className="h-4 w-4 animate-spin text-neutral-400" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    <span className="text-xs text-neutral-400">Menyimpan...</span>
                  </div>
                )
                return (
                  <RowActions
                    onEdit={role !== "staff" ? () => { setEditing(r); setMode("edit") } : null}
                    onDelete={role !== "staff" ? () => handleDelete(r) : null}
                    deleteDisabled={isUsed(r.id)}
                    deleteTitle="Toko sudah digunakan di data konsinyasi"
                  />
                )
              },
            },
          ]}
          mobileRender={(r) => (
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium text-neutral-900">{r._pending ? <SkeletonText w="w-28" /> : r.nama}</p>
                  {!r._pending && (
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${KATEGORI_COLOR[r.kategori] || "bg-neutral-100 text-neutral-600"}`}>
                      {r.kategori}
                    </span>
                  )}
                </div>
                {r.alamat && !r._pending && <p className="text-xs text-neutral-500">{r.alamat}</p>}
              </div>
              {!r._pending && (
                <div className="flex items-center gap-2 shrink-0">
                  <Toggle checked={r.aktif ?? true} onChange={() => handleToggle(r.id)} disabled={role === "staff"} />
                  <RowActions
                    onEdit={role !== "staff" ? () => { setEditing(r); setMode("edit") } : null}
                    onDelete={role !== "staff" ? () => handleDelete(r) : null}
                    deleteDisabled={isUsed(r.id)}
                    deleteTitle="Toko sudah digunakan di data konsinyasi"
                  />
                </div>
              )}
            </div>
          )}
        />
      </Card>

      {mode && (
        <Modal title={mode === "add" ? "Tambah Toko" : "Edit Toko"} onClose={close} width="max-w-lg">
          <TokoForm
            initial={editing}
            tokoList={tokoList}
            onSubmit={async (data) => {
              if (mode === "add") {
                const tempId = `temp-${Date.now()}`
                upsertLocal({ id: tempId, ...data, aktif: true, _pending: true })
                close()
                addToko(data)
                  .then(() => router.refresh())
                  .catch(async (error) => {
                    removeLocal(tempId)
                    await confirm(error?.message || "Gagal menambah toko.", { title: "Gagal Tambah", hideCancel: true })
                  })
              } else {
                const captured = editing
                upsertLocal({ ...captured, ...data, _pending: true })
                close()
                updateToko(captured.id, data)
                  .then(() => router.refresh())
                  .catch(async (error) => {
                    upsertLocal({ ...captured, _pending: false })
                    await confirm(error?.message || "Gagal mengedit toko.", { title: "Gagal Edit", hideCancel: true })
                  })
              }
            }}
            onCancel={close}
          />
        </Modal>
      )}
      {ConfirmModal}
    </div>
  )
}

function TokoForm({ initial, tokoList, onSubmit, onCancel }) {
  const [nama,     setNama]     = useState(initial?.nama     || "")
  const [alamat,   setAlamat]   = useState(initial?.alamat   || "")
  const [kategori, setKategori] = useState(initial?.kategori || "toko")
  const [loading,  setLoading]  = useState(false)

  const isDuplicate = tokoList.some(
    (t) => t.nama.toLowerCase() === nama.trim().toLowerCase() && t.id !== initial?.id
  )
  const valid = nama.trim().length > 0 && !isDuplicate

  const submit = async (e) => {
    e.preventDefault()
    if (!valid || loading) return
    setLoading(true)
    try {
      await onSubmit({ nama: nama.trim(), alamat: alamat.trim(), kategori })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Nama Toko">
        <input
          type="text" value={nama} onChange={(e) => setNama(e.target.value)}
          placeholder="Contoh: Toko Maju Jaya" className={inputCls} required autoFocus
        />
        {isDuplicate && <p className="mt-1 text-xs text-red-600">Nama toko sudah terdaftar.</p>}
      </Field>
      <Field label="Kategori Default">
        <SelectInput value={kategori} onChange={(e) => setKategori(e.target.value)}>
          <option value="toko">Toko</option>
          <option value="grosir">Grosir</option>
        </SelectInput>
      </Field>
      <Field label="Alamat (opsional)">
        <input
          type="text" value={alamat} onChange={(e) => setAlamat(e.target.value)}
          placeholder="Alamat toko" className={inputCls}
        />
      </Field>
      <FormActions onCancel={onCancel} disabled={!valid} loading={loading} submitLabel={initial ? "Simpan Perubahan" : "Tambah Toko"} />
    </form>
  )
}
