"use client"

import { useMemo, useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Plus, GripVertical, Save, X, MoveVertical, RotateCcw } from "lucide-react"
import { fmtIDR } from "@/lib/utils"
import { addRokok, updateRokok, deleteRokok, toggleAktifRokok, tambahStok, updateRokokOrder } from "@/actions/rokok"
import { Card, PageHeader, PrimaryButton, IconButton, RowActions, Field, FormActions, Toggle, inputCls, useConfirm, Button } from "@/components/ui"
import DataTable from "@/components/DataTable"
import Modal from "@/components/Modal"
import { useLoading } from "@/components/LoadingProvider"

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

export default function RokokPage({ rokokList, usedIds }) {
  const router = useRouter()
  const [isLocalPending, startLocalTransition] = useTransition()
  const { isPending, navigate } = useLoading()
  const { confirm, ConfirmModal } = useConfirm()
  const [mode, setMode] = useState(null)
  const [editing, setEditing] = useState(null)
  const [stokTarget, setStokTarget] = useState(null)
  const [isSorting, setIsSorting] = useState(false)
  const [sortedList, setSortedList] = useState([])
  const [isSaving, setIsSaving] = useState(false)

  // Initialize sortedList when rokokList changes or isSorting is enabled
  useEffect(() => {
    setSortedList(rokokList)
  }, [rokokList])

  const rows = useMemo(() => {
    // During transition or sorting, keep the local sortedList
    if (isSorting || isPending || isSaving) return sortedList
    return [...rokokList]
  }, [rokokList, isSorting, sortedList, isPending, isSaving])

  const isUsed = (id) => usedIds.includes(id)

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
    setIsSaving(true)
    try {
      const items = sortedList.map((it, idx) => ({ id: it.id, urutan: idx }))
      const res = await updateRokokOrder(items)
      if (res?.success) {
        startLocalTransition(() => {
          setIsSorting(false)
          router.refresh()
        })
      } else {
        alert(res?.error || "Gagal menyimpan urutan.")
      }
    } catch (err) {
      alert("Terjadi kesalahan sistem saat menyimpan urutan.")
    } finally {
      setIsSaving(false)
    }
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
                <Button
                  variant="secondary"
                  onClick={() => { setIsSorting(false); setSortedList(rokokList) }}
                  icon={X}
                >
                  Batal
                </Button>
                <PrimaryButton 
                  onClick={saveOrder} 
                  loading={isSaving || isLocalPending}
                  icon={Save}
                >
                  Simpan Urutan
                </PrimaryButton>
              </>
            ) : (
              <>
                <Button
                  variant="secondary"
                  onClick={() => setIsSorting(true)}
                  icon={MoveVertical}
                >
                  Atur Urutan
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    navigate("/rokok/mutasi")
                  }}
                  icon={RotateCcw}
                  loading={isPending}
                >
                  Mutasi Stok
                </Button>
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
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 flex items-center gap-3 text-amber-800 text-sm animate-in fade-in slide-in-from-top-2 duration-300">
              <MoveVertical className="h-4 w-4" />
              <span>Geser ikon titik-titik di sebelah kiri untuk mengatur urutan rokok, lalu tekan <b>Simpan Urutan</b>.</span>
            </div>
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
          </div>
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
                    <IconButton
                      onClick={() => setStokTarget(r)}
                      icon={Plus}
                      label="Tambah stok barang masuk"
                      className="bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border-emerald-100"
                    />
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
                    <IconButton
                      onClick={() => setStokTarget(r)}
                      icon={Plus}
                      label="Tambah stok barang masuk"
                      className="bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border-emerald-100"
                    />
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
            onSubmit={async (qty, date, ket) => {
              await tambahStok(stokTarget.id, qty, date, ket)
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
    opacity: isDragging ? 0.8 : 1,
    scale: isDragging ? 1.02 : 1,
  }

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`border-b border-neutral-100 last:border-0 hover:bg-neutral-50/60 transition-colors ${isDragging ? "bg-white shadow-xl ring-1 ring-black/5" : ""}`}
    >
      <td className="px-3 py-3 w-10">
        <button 
          {...attributes} 
          {...listeners} 
          className="cursor-grab active:cursor-grabbing text-neutral-400 hover:text-emerald-600 transition-colors p-2 rounded-md hover:bg-emerald-50"
        >
          <GripVertical className="h-5 w-5" />
        </button>
      </td>
      <td className="px-3 py-3">
        <span className="font-medium text-neutral-900">{r.nama}</span>
      </td>
      <td className="px-3 py-3 text-right tabular-nums text-neutral-600">{r.stok ?? 0}</td>
      <td className="px-3 py-3 text-right tabular-nums text-neutral-600 font-medium">{fmtIDR(r.harga_beli)}</td>
    </tr>
  )
}

// ─── Form Tambah Stok ─────────────────────────────────────────────────────────

function TambahStokForm({ rokok, onSubmit, onCancel }) {
  const [slop, setSlop]     = useState("")
  const [bungkus, setBungkus] = useState("")
  const [tanggal, setTanggal] = useState(new Date().toISOString().split("T")[0])
  const [keterangan, setKeterangan] = useState("")

  const totalBungkus = (Number(slop) || 0) * 10 + (Number(bungkus) || 0)
  const valid = totalBungkus > 0

  const [loading, setLoading] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    if (!valid || loading) return
    setLoading(true)
    try {
      await onSubmit(totalBungkus, tanggal, keterangan)
    } finally {
      setLoading(false)
    }
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Tanggal Masuk">
          <input
            type="date"
            value={tanggal}
            onChange={(e) => setTanggal(e.target.value)}
            className={inputCls}
            required
          />
        </Field>
        <Field label="Keterangan (Opsional)">
          <input
            type="text"
            value={keterangan}
            onChange={(e) => setKeterangan(e.target.value)}
            placeholder="Misal: Stok dari Supplier A"
            className={inputCls}
          />
        </Field>
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

      <FormActions onCancel={onCancel} disabled={!valid} loading={loading} submitLabel="Simpan Stok" />
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

  const [loading, setLoading] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    if (!valid || loading) return
    setLoading(true)
    try {
      await onSubmit({ nama: nama.trim(), stok: Number(stok), harga_beli: Number(hargaBeli), harga_grosir: Number(hargaGrosir), harga_toko: Number(hargaToko), harga_perorangan: Number(hargaPerorangan) })
    } finally {
      setLoading(false)
    }
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
      <FormActions onCancel={onCancel} disabled={!valid} loading={loading} submitLabel={initial ? "Simpan Perubahan" : "Tambah Rokok"} />
    </form>
  )
}
