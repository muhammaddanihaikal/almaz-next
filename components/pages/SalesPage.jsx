"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { addSales, updateSales, deleteSales, toggleAktifSales } from "@/actions/sales"
import { Card, PageHeader, PrimaryButton, RowActions, Field, FormActions, Toggle, inputCls, useConfirm } from "@/components/ui"
import DataTable from "@/components/DataTable"
import Modal from "@/components/Modal"

const PAGE_SIZE = 10
const KATEGORI_COLOR = {
  grosir: "bg-violet-100 text-violet-700",
  toko:   "bg-blue-100 text-blue-700",
}

export default function SalesPage({ role, salesList, sesiList }) {
  const router = useRouter()
  const { confirm, ConfirmModal } = useConfirm()
  const [mode, setMode] = useState(null)
  const [editing, setEditing] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  const rows = useMemo(
    () => [...salesList].sort((a, b) => a.nama.localeCompare(b.nama, "id")),
    [salesList]
  )

  const isUsed = (id) => sesiList.some((s) => s.sales_id === id)

  const close = () => { setMode(null); setEditing(null) }

  const handleDelete = async (s) => {
    const ok = await confirm(`Hapus sales "${s.nama}"?`, { title: "Hapus Sales", variant: "danger", confirmLabel: "Ya, Hapus" })
    if (!ok) return
    
    setDeletingId(s.id)
    try {
      await deleteSales(s.id)
      router.refresh()
    } finally {
      setDeletingId(null)
    }
  }

  const handleToggle = async (id) => {
    await toggleAktifSales(id)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales"
        subtitle={`${salesList.length} sales terdaftar.`}
        action={
          role !== "staff" && (
            <PrimaryButton onClick={() => { setEditing(null); setMode("add") }} icon={Plus}>
              Tambah Sales
            </PrimaryButton>
          )
        }
      />

      <Card>
        <DataTable
          pageSize={PAGE_SIZE}
          rows={rows}
          empty="Belum ada sales."
          columns={[
            { key: "no",    label: "No",         render: (_, idx) => idx + 1 },
            { key: "nama",  label: "Nama Sales" },
            { key: "no_hp", label: "No HP",       render: (r) => r.no_hp || <span className="text-neutral-400">—</span> },
            {
              key: "kategori", label: "Kategori",
              render: (r) => (
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${KATEGORI_COLOR[r.kategori] || "bg-neutral-100 text-neutral-600"}`}>
                  {r.kategori}
                </span>
              ),
            },
            {
              key: "aktif", label: "Aktif", align: "center",
              render: (r) => <Toggle checked={r.aktif ?? true} onChange={() => handleToggle(r.id)} disabled={role === "staff"} />,
            },
            {
              key: "actions", label: "", align: "right",
              render: (r) => (
                <RowActions
                  onEdit={role !== "staff" ? () => { setEditing(r); setMode("edit") } : null}
                  onDelete={role !== "staff" ? () => handleDelete(r) : null}
                  deleteDisabled={isUsed(r.id)}
                  deleteTitle="Sales sudah digunakan di data distribusi/retur"
                  deleteLoading={deletingId === r.id}
                />
              ),
            },
          ]}
          mobileRender={(r) => (
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-medium text-neutral-900">{r.nama}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${KATEGORI_COLOR[r.kategori] || "bg-neutral-100 text-neutral-600"}`}>
                    {r.kategori}
                  </span>
                  {r.no_hp && <p className="text-xs text-neutral-500">{r.no_hp}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Toggle checked={r.aktif ?? true} onChange={() => handleToggle(r.id)} disabled={role === "staff"} />
                <RowActions
                  onEdit={role !== "staff" ? () => { setEditing(r); setMode("edit") } : null}
                  onDelete={role !== "staff" ? () => handleDelete(r) : null}
                  deleteDisabled={isUsed(r.id)}
                  deleteTitle="Sales sudah digunakan di data distribusi/retur"
                  deleteLoading={deletingId === r.id}
                />
              </div>
            </div>
          )}
        />
      </Card>

      {mode && (
        <Modal title={mode === "add" ? "Tambah Sales" : "Edit Sales"} onClose={close}>
          <SalesForm
            initial={editing}
            salesList={salesList}
            onSubmit={async (data) => {
              if (mode === "add") await addSales(data)
              else await updateSales(editing.id, data)
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

function SalesForm({ initial, salesList, onSubmit, onCancel }) {
  const [nama, setNama] = useState(initial?.nama || "")
  const [noHp, setNoHp] = useState(initial?.no_hp || "")
  const [kategori, setKategori] = useState(initial?.kategori || "grosir")
  const [loading, setLoading] = useState(false)

  const isDuplicate = salesList.some(
    (s) => s.nama.toLowerCase() === nama.trim().toLowerCase() && s.id !== initial?.id
  )
  const valid = nama.trim().length > 0 && !isDuplicate

  const submit = async (e) => {
    e.preventDefault()
    if (!valid || loading) return
    setLoading(true)
    try {
      await onSubmit({ nama: nama.trim(), no_hp: noHp.trim(), kategori })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Nama Sales">
        <input type="text" value={nama} onChange={(e) => setNama(e.target.value)} placeholder="Misal: Budi Santoso" className={inputCls} autoFocus required />
        {isDuplicate && <p className="mt-1 text-xs text-red-600">Nama sales sudah terdaftar.</p>}
      </Field>
      <Field label="No HP">
        <input type="text" value={noHp} onChange={(e) => setNoHp(e.target.value)} placeholder="Misal: 0812-3456-7890" className={inputCls} />
      </Field>
      <Field label="Kategori Default">
        <div className="flex gap-4">
          {["grosir", "toko"].map((k) => (
            <label key={k} className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="kategori"
                value={k}
                checked={kategori === k}
                onChange={(e) => setKategori(e.target.value)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-neutral-300"
              />
              <span className="capitalize">{k}</span>
            </label>
          ))}
        </div>
      </Field>
      <FormActions onCancel={onCancel} disabled={!valid} loading={loading} submitLabel={initial ? "Simpan Perubahan" : "Tambah Sales"} />
    </form>
  )
}
