"use client"

import { useMemo, useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Plus, GripVertical, Save, X, MoveVertical } from "lucide-react"
import { fmtIDR } from "@/lib/utils"
import { addRokok, updateRokok, deleteRokok, toggleAktifRokok, tambahStok, updateRokokOrder } from "@/actions/rokok"
import { Card, PageHeader, PrimaryButton, RowActions, Field, FormActions, Toggle, inputCls, useConfirm } from "@/components/ui"
import DataTable from "@/components/DataTable"
import Modal from "@/components/Modal"

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

const PAGE_SIZE = 10

export default function RokokPage({ rokokList, distribusi, retur }) {
  const router = useRouter()
  const { confirm, ConfirmModal } = useConfirm()
  const [mode, setMode] = useState(null)
  const [editing, setEditing] = useState(null)
  const [stokTarget, setStokTarget] = useState(null)
  const [isSorting, setIsSorting] = useState(false)
  const [sortedList, setSortedList] = useState([])

  // Initialize sortedList when rokokList changes or isSorting is enabled
  useEffect(() => {
    setSortedList(rokokList)
  }, [rokokList])

  const rows = useMemo(() => {
    if (isSorting) return sortedList
    return [...rokokList]
  }, [rokokList, isSorting, sortedList])

  const isUsed = (id) =>
    distribusi.some((d) => d.barangKeluar.some((it) => it.rokok_id === id)) ||
    retur.some((r) => r.items.some((it) => it.rokok_id === id))

  const close = () => { setMode(null); setEditing(null) }

  const handleDelete = async (r) => {
    const ok = await confirm(`Hapus rokok "${r.nama}"? Data distribusi & retur tidak akan ikut terhapus.`, { title: "Hapus Rokok", variant: "danger", confirmLabel: "Ya, Hapus" })
    if (!ok) return
    await deleteRokok(r.id)
    router.refresh()
  }

  const handleToggle = async (id) => {
    await toggleAktifRokok(id)
    router.refresh()
  }

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = (event) => {
    const { active, over } = event
    if (active.id !== over.id) {
      setSortedList((items) => {
        const oldIndex = items.findIndex((it) => it.id === active.id)
        const newIndex = items.findIndex((it) => it.id === over.id)
        return arrayMove(items, oldIndex, newIndex)
      })
    }
  }

  const saveOrder = async () => {
    const items = sortedList.map((it, idx) => ({ id: it.id, urutan: idx }))
    await updateRokokOrder(items)
    setIsSorting(false)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rokok"
        subtitle={`${rokokList.length} jenis rokok terdaftar di master data.`}
        action={
          <div className="flex items-center gap-2">
            {isSorting ? (
              <>
                <button
                  onClick={() => { setIsSorting(false); setSortedList(rokokList) }}
                  className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-600 transition hover:bg-neutral-50"
                >
                  <X className="h-4 w-4" /> Batal
                </button>
                <PrimaryButton onClick={saveOrder} icon={Save}>
                  Simpan Urutan
                </PrimaryButton>
              </>
            ) : (
              <>
                <button
                  onClick={() => setIsSorting(true)}
                  className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-600 transition hover:bg-neutral-50"
                >
                  <MoveVertical className="h-4 w-4" /> Atur Urutan
                </button>
                <PrimaryButton onClick={() => { setEditing(null); setMode("add") }} icon={Plus}>
                  Tambah Rokok
                </PrimaryButton>
              </>
            )}
          </div>
        }
      />

      <Card>
        {isSorting ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
                    <th className="px-3 py-2.5 w-10"></th>
                    <th className="px-3 py-2.5">Nama Rokok</th>
                    <th className="px-3 py-2.5 text-right">Stok</th>
                    <th className="px-3 py-2.5 text-right">Harga Beli</th>
                  </tr>
                </thead>
                <tbody>
                  <SortableContext items={sortedList.map(it => it.id)} strategy={verticalListSortingStrategy}>
                    {sortedList.map((r) => (
                      <SortableRow key={r.id} r={r} />
                    ))}
                  </SortableContext>
                </tbody>
              </table>
            </div>
          </DndContext>
        ) : (
          <DataTable
            pageSize={PAGE_SIZE}
            rows={rows}
            empty="Belum ada rokok."
            columns={[
              { key: "no",    label: "No",    render: (_, idx) => idx + 1 },
              { key: "nama",  label: "Nama Rokok" },
              {
                key: "stok",  label: "Stok",  align: "right",
                render: (r) => (
                  <div className="flex items-center justify-end gap-2">
                    <span className={`font-semibold tabular-nums ${(r.stok ?? 0) < 50 ? "text-red-600" : (r.stok ?? 0) < 150 ? "text-amber-500" : "text-green-600"}`}>{r.stok ?? 0}</span>
                    <button
                      onClick={() => setStokTarget(r)}
                      title="Tambah stok barang masuk"
                      className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-emerald-50 text-emerald-600 transition hover:bg-emerald-100"
                    >
                      <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                    </button>
                  </div>
                ),
              },
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
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <p className="text-xs text-neutral-500">Stok: {r.stok ?? 0}</p>
                    <button
                      onClick={() => setStokTarget(r)}
                      title="Tambah stok barang masuk"
                      className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-emerald-50 text-emerald-600 transition hover:bg-emerald-100"
                    >
                      <Plus className="h-3 w-3" strokeWidth={2.5} />
                    </button>
                    <span className="text-xs text-neutral-400">·</span>
                    <p className="text-xs text-neutral-500">Beli: {fmtIDR(r.harga_beli)}</p>
                  </div>
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
        )}
      </Card>

      {/* Modal Tambah/Edit Rokok */}
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

      {/* Modal Tambah Stok */}
      {stokTarget && (
        <Modal
          title={`Tambah Stok — ${stokTarget.nama}`}
          onClose={() => setStokTarget(null)}
          width="max-w-sm"
        >
          <TambahStokForm
            rokok={stokTarget}
            onSubmit={async (qty) => {
              await tambahStok(stokTarget.id, qty)
              setStokTarget(null)
              router.refresh()
            }}
            onCancel={() => setStokTarget(null)}
          />
        </Modal>
      )}
      {ConfirmModal}
    </div>
  )
}

function SortableRow({ r }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: r.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : "auto",
    position: "relative",
  }

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`border-b border-neutral-100 last:border-0 hover:bg-neutral-50/60 ${isDragging ? "bg-white shadow-lg" : ""}`}
    >
      <td className="px-3 py-3">
        <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-neutral-400 hover:text-neutral-600 transition p-1">
          <GripVertical className="h-5 w-5" />
        </button>
      </td>
      <td className="px-3 py-3 text-neutral-800 font-medium">{r.nama}</td>
      <td className="px-3 py-3 text-right tabular-nums text-neutral-600">{r.stok ?? 0}</td>
      <td className="px-3 py-3 text-right tabular-nums text-neutral-600">{fmtIDR(r.harga_beli)}</td>
    </tr>
  )
}

// ─── Form Tambah Stok ─────────────────────────────────────────────────────────

function TambahStokForm({ rokok, onSubmit, onCancel }) {
  const [slop, setSlop]     = useState("")
  const [bungkus, setBungkus] = useState("")

  const totalBungkus = (Number(slop) || 0) * 10 + (Number(bungkus) || 0)
  const valid = totalBungkus > 0

  const submit = (e) => {
    e.preventDefault()
    if (!valid) return
    onSubmit(totalBungkus)
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {/* Info stok saat ini */}
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 flex items-center justify-between">
        <span className="text-sm text-neutral-600">Stok saat ini</span>
        <span className="text-lg font-semibold tabular-nums text-neutral-900">{rokok.stok ?? 0} bungkus</span>
      </div>

      {/* Input slop & bungkus */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">Jumlah Masuk</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Slop (1 slop = 10 bungkus)">
            <input
              type="number"
              min="0"
              value={slop}
              onChange={(e) => setSlop(e.target.value)}
              placeholder="0"
              className={inputCls}
              autoFocus
            />
          </Field>
          <Field label="Bungkus (satuan)">
            <input
              type="number"
              min="0"
              value={bungkus}
              onChange={(e) => setBungkus(e.target.value)}
              placeholder="0"
              className={inputCls}
            />
          </Field>
        </div>
      </div>

      {/* Preview total */}
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-center justify-between">
        <span className="text-sm text-emerald-700">Total tambahan</span>
        <span className="text-base font-semibold tabular-nums text-emerald-700">+{totalBungkus} bungkus</span>
      </div>

      {/* Preview stok sesudah */}
      <div className="rounded-lg border border-neutral-200 bg-white px-4 py-3 flex items-center justify-between">
        <span className="text-sm text-neutral-600">Stok setelah tambah</span>
        <span className="text-lg font-semibold tabular-nums text-neutral-900">{(rokok.stok ?? 0) + totalBungkus} bungkus</span>
      </div>

      <FormActions onCancel={onCancel} disabled={!valid} submitLabel="Simpan Stok" />
    </form>
  )
}

// ─── Form Tambah/Edit Rokok ───────────────────────────────────────────────────

function RokokForm({ initial, rokokList, onSubmit, onCancel }) {
  const [nama, setNama]                     = useState(initial?.nama || "")
  const [stok, setStok]                     = useState(initial?.stok || "")
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
