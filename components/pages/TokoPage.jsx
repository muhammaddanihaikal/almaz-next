"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { addToko, updateToko, deleteToko } from "@/actions/toko"
import { Card, PageHeader, PrimaryButton, Field, FormActions, SelectInput, inputCls, RowActions } from "@/components/ui"
import DataTable from "@/components/DataTable"
import Modal from "@/components/Modal"

const TIPE_COLOR = {
  Toko:   "bg-blue-100 text-blue-700",
  Grosir: "bg-violet-100 text-violet-700",
}

function TipeBadge({ tipe }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TIPE_COLOR[tipe] || "bg-neutral-100 text-neutral-600"}`}>
      {tipe}
    </span>
  )
}

export default function TokoPage({ tokoList }) {
  const router = useRouter()
  const [mode,    setMode]    = useState(null)
  const [editing, setEditing] = useState(null)

  const close = () => { setMode(null); setEditing(null) }

  const handleDelete = async (t) => {
    if (!window.confirm(`Hapus toko "${t.nama}"?`)) return
    await deleteToko(t.id)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Master Toko"
        subtitle="Daftar toko dan distributor pelanggan."
        action={
          <PrimaryButton onClick={() => { setEditing(null); setMode("add") }} icon={Plus}>
            Tambah Toko
          </PrimaryButton>
        }
      />

      <Card>
        <DataTable
          rows={tokoList}
          empty="Belum ada data toko."
          columns={[
            { key: "no",     label: "No",     render: (_, idx) => idx + 1 },
            { key: "nama",   label: "Nama",   render: (r) => <span className="font-medium">{r.nama}</span> },
            { key: "tipe",   label: "Tipe",   render: (r) => <TipeBadge tipe={r.tipe} /> },
            { key: "alamat", label: "Alamat", render: (r) => r.alamat || <span className="text-neutral-400">—</span> },
            {
              key: "aktif", label: "Status",
              render: (r) => r.aktif
                ? <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">Aktif</span>
                : <span className="inline-flex items-center rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-500">Nonaktif</span>,
            },
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
                <div className="flex items-center gap-2">
                  <span className="font-medium text-neutral-900">{r.nama}</span>
                  <TipeBadge tipe={r.tipe} />
                  {!r.aktif && <span className="text-xs text-neutral-400">(nonaktif)</span>}
                </div>
                {r.alamat && <p className="mt-0.5 text-xs text-neutral-500">{r.alamat}</p>}
              </div>
              <RowActions
                onEdit={() => { setEditing(r); setMode("edit") }}
                onDelete={() => handleDelete(r)}
              />
            </div>
          )}
        />
      </Card>

      {mode && (
        <Modal title={mode === "add" ? "Tambah Toko" : "Edit Toko"} onClose={close} width="max-w-lg">
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
  const [nama,   setNama]   = useState(initial?.nama   || "")
  const [tipe,   setTipe]   = useState(initial?.tipe   || "")
  const [alamat, setAlamat] = useState(initial?.alamat || "")
  const [aktif,  setAktif]  = useState(initial?.aktif  ?? true)

  const valid = nama.trim() && tipe

  const submit = (e) => {
    e.preventDefault()
    if (!valid) return
    onSubmit({ nama: nama.trim(), tipe, alamat: alamat.trim(), aktif })
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Nama Toko">
        <input
          type="text" value={nama} onChange={(e) => setNama(e.target.value)}
          placeholder="Contoh: Toko Maju Jaya" className={inputCls} required autoFocus
        />
      </Field>
      <Field label="Tipe">
        <SelectInput value={tipe} onChange={(e) => setTipe(e.target.value)}>
          <option value="">Pilih tipe</option>
          <option value="Toko">Toko</option>
          <option value="Grosir">Grosir</option>
        </SelectInput>
      </Field>
      <Field label="Alamat">
        <input
          type="text" value={alamat} onChange={(e) => setAlamat(e.target.value)}
          placeholder="Alamat toko (opsional)" className={inputCls}
        />
      </Field>
      {initial && (
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-neutral-700">Status Aktif</span>
          <button
            type="button"
            onClick={() => setAktif(!aktif)}
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${aktif ? "bg-neutral-900" : "bg-neutral-300"}`}
          >
            <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${aktif ? "translate-x-[18px]" : "translate-x-0.5"}`} />
          </button>
        </div>
      )}
      <FormActions onCancel={onCancel} disabled={!valid} submitLabel={initial ? "Simpan Perubahan" : "Tambah Toko"} />
    </form>
  )
}
