"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { addRetail, updateRetail, deleteRetail, toggleAktifRetail } from "@/actions/retail"
import { Card, PageHeader, PrimaryButton, RowActions, Field, FormActions, Toggle, SelectInput, inputCls, useConfirm } from "@/components/ui"
import DataTable from "@/components/DataTable"
import Modal from "@/components/Modal"

const PAGE_SIZE = 10

const KATEGORI_COLOR = {
  grosir: "bg-violet-100 text-violet-700",
  retail: "bg-blue-100 text-blue-700",
}

export default function RetailPage({ retailList, titipJualList }) {
  const router = useRouter()
  const { confirm, ConfirmModal } = useConfirm()
  const [mode,    setMode]    = useState(null)
  const [editing, setEditing] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  const rows = useMemo(
    () => [...retailList].sort((a, b) => a.nama.localeCompare(b.nama, "id")),
    [retailList]
  )

  const isUsed = (id) => titipJualList.some((k) => k.retail_id === id)

  const close = () => { setMode(null); setEditing(null) }

  const handleDelete = async (t) => {
    const ok = await confirm(`Hapus retail "${t.nama}"?`, { title: "Hapus Retail", variant: "danger", confirmLabel: "Ya, Hapus" })
    if (!ok) return

    setDeletingId(t.id)
    try {
      await deleteRetail(t.id)
      router.refresh()
    } finally {
      setDeletingId(null)
    }
  }

  const handleToggle = async (id) => {
    await toggleAktifRetail(id)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Master Retail"
        subtitle={`${retailList.length} retail terdaftar — digunakan untuk titip jual.`}
        action={
          <PrimaryButton onClick={() => { setEditing(null); setMode("add") }} icon={Plus}>
            Tambah Retail
          </PrimaryButton>
        }
      />

      <Card>
        <DataTable
          pageSize={PAGE_SIZE}
          rows={rows}
          empty="Belum ada data retail."
          columns={[
            { key: "no",       label: "No",       render: (_, idx) => idx + 1 },
            { key: "nama",     label: "Nama Retail" },
            { key: "alamat",   label: "Alamat",   render: (r) => r.alamat || <span className="text-neutral-400">—</span> },
            {
              key: "kategori", label: "Kategori Default",
              render: (r) => (
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${KATEGORI_COLOR[r.kategori] || "bg-neutral-100 text-neutral-600"}`}>
                  {r.kategori}
                </span>
              ),
            },
            {
              key: "aktif", label: "Aktif", align: "center",
              render: (r) => <Toggle checked={r.aktif ?? true} onChange={() => handleToggle(r.id)} />,
            },
            {
              key: "actions", label: "", align: "right",
              render: (r) => (
                <RowActions
                  onEdit={() => { setEditing(r); setMode("edit") }}
                  onDelete={() => handleDelete(r)}
                  deleteDisabled={isUsed(r.id)}
                  deleteTitle="Retail sudah digunakan di data konsinyasi"
                  deleteLoading={deletingId === r.id}
                />
              ),
            },
          ]}
          mobileRender={(r) => (
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium text-neutral-900">{r.nama}</p>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${KATEGORI_COLOR[r.kategori] || "bg-neutral-100 text-neutral-600"}`}>
                    {r.kategori}
                  </span>
                </div>
                {r.alamat && <p className="text-xs text-neutral-500">{r.alamat}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Toggle checked={r.aktif ?? true} onChange={() => handleToggle(r.id)} />
                <RowActions
                  onEdit={() => { setEditing(r); setMode("edit") }}
                  onDelete={() => handleDelete(r)}
                  deleteDisabled={isUsed(r.id)}
                  deleteTitle="Retail sudah digunakan di data konsinyasi"
                />
              </div>
            </div>
          )}
        />
      </Card>

      {mode && (
        <Modal title={mode === "add" ? "Tambah Retail" : "Edit Retail"} onClose={close} width="max-w-lg">
          <RetailForm
            initial={editing}
            retailList={retailList}
            onSubmit={async (data) => {
              if (mode === "add") await addRetail(data)
              else await updateRetail(editing.id, data)
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

function RetailForm({ initial, retailList, onSubmit, onCancel }) {
  const [nama,     setNama]     = useState(initial?.nama     || "")
  const [alamat,   setAlamat]   = useState(initial?.alamat   || "")
  const [kategori, setKategori] = useState(initial?.kategori || "retail")
  const [loading,  setLoading]  = useState(false)

  const isDuplicate = retailList.some(
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
      <Field label="Nama Retail">
        <input
          type="text" value={nama} onChange={(e) => setNama(e.target.value)}
          placeholder="Contoh: Toko Maju Jaya" className={inputCls} required autoFocus
        />
        {isDuplicate && <p className="mt-1 text-xs text-red-600">Nama retail sudah terdaftar.</p>}
      </Field>
      <Field label="Kategori Default">
        <SelectInput value={kategori} onChange={(e) => setKategori(e.target.value)}>
          <option value="retail">Retail</option>
          <option value="grosir">Grosir</option>
        </SelectInput>
      </Field>
      <Field label="Alamat (opsional)">
        <input
          type="text" value={alamat} onChange={(e) => setAlamat(e.target.value)}
          placeholder="Alamat retail" className={inputCls}
        />
      </Field>
      <FormActions onCancel={onCancel} disabled={!valid} loading={loading} submitLabel={initial ? "Simpan Perubahan" : "Tambah Retail"} />
    </form>
  )
}
