"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { addSales, updateSales, deleteSales, toggleAktifSales } from "@/actions/sales"
import { Card, PageHeader, PrimaryButton, RowActions, Field, FormActions, Toggle, inputCls, useConfirm } from "@/components/ui"
import DataTable from "@/components/DataTable"
import Modal from "@/components/Modal"

const PAGE_SIZE = 10

export default function SalesPage({ salesList, sesiList }) {
  const router = useRouter()
  const { confirm, ConfirmModal } = useConfirm()
  const [mode, setMode] = useState(null)
  const [editing, setEditing] = useState(null)

  const rows = useMemo(
    () => [...salesList].sort((a, b) => a.nama.localeCompare(b.nama, "id")),
    [salesList]
  )

  const isUsed = (id) => sesiList.some((s) => s.sales_id === id)

  const close = () => { setMode(null); setEditing(null) }

  const handleDelete = async (s) => {
    const ok = await confirm(`Hapus sales "${s.nama}"?`, { title: "Hapus Sales", variant: "danger", confirmLabel: "Ya, Hapus" })
    if (!ok) return
    await deleteSales(s.id)
    router.refresh()
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
          <PrimaryButton onClick={() => { setEditing(null); setMode("add") }} icon={Plus}>
            Tambah Sales
          </PrimaryButton>
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
                  deleteTitle="Sales sudah digunakan di data distribusi/retur"
                />
              ),
            },
          ]}
          mobileRender={(r) => (
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-medium text-neutral-900">{r.nama}</p>
                {r.no_hp && <p className="text-xs text-neutral-500">{r.no_hp}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Toggle checked={r.aktif ?? true} onChange={() => handleToggle(r.id)} />
                <RowActions
                  onEdit={() => { setEditing(r); setMode("edit") }}
                  onDelete={() => handleDelete(r)}
                  deleteDisabled={isUsed(r.id)}
                  deleteTitle="Sales sudah digunakan di data distribusi/retur"
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
      await onSubmit({ nama: nama.trim(), no_hp: noHp.trim() })
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
      <FormActions onCancel={onCancel} disabled={!valid} loading={loading} submitLabel={initial ? "Simpan Perubahan" : "Tambah Sales"} />
    </form>
  )
}
