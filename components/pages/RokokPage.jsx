"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { fmtIDR } from "@/lib/utils"
import { addRokok, updateRokok, deleteRokok, toggleAktifRokok } from "@/actions/rokok"
import { Card, PageHeader, PrimaryButton, RowActions, Field, FormActions, Toggle, inputCls } from "@/components/ui"
import DataTable from "@/components/DataTable"
import Modal from "@/components/Modal"

const PAGE_SIZE = 10

export default function RokokPage({ rokokList, distribusi, retur }) {
  const router = useRouter()
  const [mode, setMode] = useState(null)
  const [editing, setEditing] = useState(null)

  const rows = useMemo(
    () => [...rokokList].sort((a, b) => a.nama.localeCompare(b.nama, "id")),
    [rokokList]
  )


  const isUsed = (id) =>
    distribusi.some((d) => d.barangKeluar.some((it) => it.rokok_id === id)) ||
    retur.some((r) => r.items.some((it) => it.rokok_id === id))

  const close = () => { setMode(null); setEditing(null) }

  const handleDelete = async (r) => {
    if (!window.confirm(`Hapus rokok "${r.nama}"?\n\nData distribusi & retur tidak akan ikut terhapus.`)) return
    await deleteRokok(r.id)
    router.refresh()
  }

  const handleToggle = async (id) => {
    await toggleAktifRokok(id)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rokok"
        subtitle={`${rokokList.length} jenis rokok terdaftar di master data.`}
        action={
          <PrimaryButton onClick={() => { setEditing(null); setMode("add") }} icon={Plus}>
            Tambah Rokok
          </PrimaryButton>
        }
      />

      <Card>
        <DataTable
          pageSize={PAGE_SIZE}
          rows={rows}
          empty="Belum ada rokok."
          columns={[
            { key: "no",    label: "No",    render: (_, idx) => idx + 1 },
            { key: "nama",  label: "Nama Rokok" },
            { key: "stok",  label: "Stok",  align: "right", render: (r) => r.stok ?? 0 },
            { key: "beli",  label: "Harga Beli", align: "right", render: (r) => fmtIDR(r.harga_beli) },
            {
              key: "grosir", label: "Grosir", align: "right",
              render: (r) => (
                <div>
                  <div>{fmtIDR(r.harga_grosir)}</div>
                  <div className="text-xs text-emerald-600 font-medium">+{fmtIDR(r.harga_grosir - r.harga_beli)}</div>
                </div>
              ),
            },
            {
              key: "toko", label: "Toko", align: "right",
              render: (r) => (
                <div>
                  <div>{fmtIDR(r.harga_toko)}</div>
                  <div className="text-xs text-emerald-600 font-medium">+{fmtIDR(r.harga_toko - r.harga_beli)}</div>
                </div>
              ),
            },
            {
              key: "perorangan", label: "Perorangan", align: "right",
              render: (r) => (
                <div>
                  <div>{fmtIDR(r.harga_perorangan)}</div>
                  <div className="text-xs text-emerald-600 font-medium">+{fmtIDR(r.harga_perorangan - r.harga_beli)}</div>
                </div>
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
                  deleteTitle="Rokok sudah digunakan di data distribusi/retur"
                />
              ),
            },
          ]}
          mobileRender={(r) => (
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-medium text-neutral-900">{r.nama}</p>
                <p className="text-xs text-neutral-500">Stok: {r.stok ?? 0} · Beli: {fmtIDR(r.harga_beli)}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Toggle checked={r.aktif ?? true} onChange={() => handleToggle(r.id)} />
                <RowActions
                  onEdit={() => { setEditing(r); setMode("edit") }}
                  onDelete={() => handleDelete(r)}
                  deleteDisabled={isUsed(r.id)}
                  deleteTitle="Rokok sudah digunakan di data distribusi/retur"
                />
              </div>
            </div>
          )}
        />
      </Card>

      {mode && (
        <Modal title={mode === "add" ? "Tambah Rokok" : "Edit Rokok"} onClose={close} width="max-w-lg">
          <RokokForm
            initial={editing}
            rokokList={rokokList}
            onSubmit={async (data) => {
              if (mode === "add") await addRokok(data)
              else await updateRokok(editing.id, data)
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

function RokokForm({ initial, rokokList, onSubmit, onCancel }) {
  const [nama, setNama]                     = useState(initial?.nama || "")
  const [stok, setStok]                     = useState(initial?.stok ?? 0)
  const [hargaBeli, setHargaBeli]           = useState(initial?.harga_beli || "")
  const [hargaGrosir, setHargaGrosir]       = useState(initial?.harga_grosir || "")
  const [hargaToko, setHargaToko]           = useState(initial?.harga_toko || "")
  const [hargaPerorangan, setHargaPerorangan] = useState(initial?.harga_perorangan || "")

  const isDuplicate = rokokList.some(
    (r) => r.nama.toLowerCase() === nama.trim().toLowerCase() && r.id !== initial?.id
  )
  const valid = nama.trim() && hargaBeli && hargaGrosir && hargaToko && hargaPerorangan && !isDuplicate

  const submit = (e) => {
    e.preventDefault()
    if (!valid) return
    onSubmit({ nama: nama.trim(), stok: Number(stok), harga_beli: Number(hargaBeli), harga_grosir: Number(hargaGrosir), harga_toko: Number(hargaToko), harga_perorangan: Number(hargaPerorangan) })
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Nama Rokok">
        <input type="text" value={nama} onChange={(e) => setNama(e.target.value)} placeholder="Misal: Marlboro Red" className={inputCls} autoFocus required />
        {isDuplicate && <p className="mt-1 text-xs text-red-600">Nama rokok sudah terdaftar.</p>}
      </Field>
      <Field label="Stok Awal">
        <input type="number" min="0" value={stok} onChange={(e) => setStok(e.target.value)} className={inputCls} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Harga Beli">
          <input type="number" min="0" value={hargaBeli} onChange={(e) => setHargaBeli(e.target.value)} className={inputCls} required />
        </Field>
        <Field label="Harga Grosir">
          <input type="number" min="0" value={hargaGrosir} onChange={(e) => setHargaGrosir(e.target.value)} className={inputCls} required />
        </Field>
        <Field label="Harga Toko">
          <input type="number" min="0" value={hargaToko} onChange={(e) => setHargaToko(e.target.value)} className={inputCls} required />
        </Field>
        <Field label="Harga Perorangan">
          <input type="number" min="0" value={hargaPerorangan} onChange={(e) => setHargaPerorangan(e.target.value)} className={inputCls} required />
        </Field>
      </div>
      <FormActions onCancel={onCancel} disabled={!valid} submitLabel={initial ? "Simpan Perubahan" : "Tambah Rokok"} />
    </form>
  )
}
