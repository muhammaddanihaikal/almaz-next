"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { addToko, updateToko, deleteToko, toggleAktifToko } from "@/actions/toko"
import { Card, PageHeader, PrimaryButton, RowActions, Field, FormActions, Toggle, SelectInput, inputCls } from "@/components/ui"
import DataTable from "@/components/DataTable"
import Modal from "@/components/Modal"

const PAGE_SIZE = 10

export default function TokoPage({ tokoList, distribusi, retur }) {
  const router = useRouter()
  const [mode, setMode] = useState(null)
  const [editing, setEditing] = useState(null)

  const rows = useMemo(
    () => [...tokoList].sort((a, b) => a.nama.localeCompare(b.nama, "id")),
    [tokoList]
  )

  const isUsed = (id) =>
    distribusi.some((d) => d.toko_id === id) || retur.some((r) => r.toko_id === id)

  const close = () => { setMode(null); setEditing(null) }

  const handleDelete = async (t) => {
    if (!window.confirm(`Hapus toko "${t.nama}"?`)) return
    await deleteToko(t.id)
    router.refresh()
  }

  const handleToggle = async (id) => {
    await toggleAktifToko(id)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Toko"
        subtitle={`${tokoList.length} toko terdaftar di master data.`}
        action={
          <PrimaryButton onClick={() => { setEditing(null); setMode("add") }} icon={Plus}>
            Tambah Toko
          </PrimaryButton>
        }
      />

      <Card>
        <DataTable
          pageSize={PAGE_SIZE}
          rows={rows}
          empty="Belum ada toko."
          columns={[
            { key: "no",   label: "No",   render: (_, idx) => idx + 1 },
            { key: "nama", label: "Nama Toko" },
            { key: "no_hp", label: "No HP", render: (r) => r.no_hp || <span className="text-neutral-400">—</span> },
            { key: "tipe",  label: "Tipe",  render: (r) => <span className="capitalize">{r.tipe_harga}</span> },
            { key: "alamat", label: "Alamat", render: (r) => r.alamat || <span className="text-neutral-400">—</span> },
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
                  deleteTitle="Toko sudah digunakan di data distribusi/retur"
                />
              ),
            },
          ]}
          mobileRender={(r) => (
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-medium text-neutral-900">{r.nama}</p>
                <p className="text-xs capitalize text-neutral-500">{r.tipe_harga}</p>
                {r.no_hp && <p className="text-xs text-neutral-500">{r.no_hp}</p>}
                {r.alamat && <p className="mt-1 text-xs text-neutral-500">{r.alamat}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Toggle checked={r.aktif ?? true} onChange={() => handleToggle(r.id)} />
                <RowActions
                  onEdit={() => { setEditing(r); setMode("edit") }}
                  onDelete={() => handleDelete(r)}
                  deleteDisabled={isUsed(r.id)}
                  deleteTitle="Toko sudah digunakan di data distribusi/retur"
                />
              </div>
            </div>
          )}
        />
      </Card>

      {mode && (
        <Modal title={mode === "add" ? "Tambah Toko" : "Edit Toko"} onClose={close}>
          <TokoForm
            initial={editing}
            onSubmit={async (data) => {
              if (mode === "add") await addToko(data)
              else await updateToko(editing.id, data)
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

function TokoForm({ initial, onSubmit, onCancel }) {
  const [nama, setNama]           = useState(initial?.nama || "")
  const [tipeHarga, setTipeHarga] = useState(initial?.tipe_harga || "toko")
  const [noHp, setNoHp]           = useState(initial?.no_hp || "")
  const [alamat, setAlamat]       = useState(initial?.alamat || "")
  const valid = nama.trim().length > 0

  const submit = (e) => {
    e.preventDefault()
    if (!valid) return
    onSubmit({ nama: nama.trim(), tipe_harga: tipeHarga, no_hp: noHp.trim(), alamat: alamat.trim() })
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Nama Toko">
        <input type="text" value={nama} onChange={(e) => setNama(e.target.value)} placeholder="Misal: Warung Mak Siti" className={inputCls} autoFocus required />
      </Field>
      <Field label="No HP">
        <input type="text" value={noHp} onChange={(e) => setNoHp(e.target.value)} placeholder="Misal: 0812-3456-7890" className={inputCls} />
      </Field>
      <Field label="Tipe">
        <SelectInput value={tipeHarga} onChange={(e) => setTipeHarga(e.target.value)}>
          <option value="toko">Toko</option>
          <option value="grosir">Grosir</option>
        </SelectInput>
      </Field>
      <Field label="Alamat">
        <input type="text" value={alamat} onChange={(e) => setAlamat(e.target.value)} placeholder="Misal: Jl. Mawar No. 12, Bandung" className={inputCls} />
      </Field>
      <FormActions onCancel={onCancel} disabled={!valid} submitLabel={initial ? "Simpan Perubahan" : "Tambah Toko"} />
    </form>
  )
}
