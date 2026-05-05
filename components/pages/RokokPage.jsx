"use client"

import { useMemo, useState, useEffect, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus, GripVertical, Save, X, MoveVertical, RotateCcw, ChevronDown, ChevronRight, Info } from "lucide-react"
import { fmtIDR } from "@/lib/utils"
import { addRokok, updateRokok, deleteRokok, toggleAktifRokok, tambahStok, updateRokokOrder } from "@/actions/rokok"
import { Card, PageHeader, PrimaryButton, IconButton, RowActions, Field, FormActions, Toggle, inputCls, useConfirmWithReason, Button } from "@/components/ui"
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

const SOURCE_LABEL = {
  stok_awal:          { label: "Stok Awal",          cls: "bg-blue-100 text-blue-700"       },
  supplier:           { label: "Masuk Supplier",      cls: "bg-emerald-100 text-emerald-700" },
  distribusi_sales:   { label: "Keluar Distribusi",  cls: "bg-red-100 text-red-700"         },
  retur_sales:        { label: "Kembali dari Sales", cls: "bg-amber-100 text-amber-700"     },
  retur:              { label: "Retur",               cls: "bg-amber-100 text-amber-700"     },
  konsinyasi_kembali: { label: "Kembali Titip Jual", cls: "bg-amber-100 text-amber-700"     },
  koreksi:            { label: "Koreksi",             cls: "bg-purple-100 text-purple-700"   },
}

export default function RokokPage({ role, rokokList, usedIds, mutasiHariIni = [] }) {
  const router = useRouter()
  const [isLocalPending, startLocalTransition] = useTransition()
  const { isPending, navigate } = useLoading()
  const { confirmWithReason, ConfirmWithReasonModal } = useConfirmWithReason()
  const [mode, setMode] = useState(null)
  const [editing, setEditing] = useState(null)
  const [stokTarget, setStokTarget] = useState(null)
  const [detailTarget, setDetailTarget] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [isSorting, setIsSorting] = useState(false)
  const [sortedList, setSortedList] = useState([])
  const [isSaving, setIsSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

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
    const alasan = await confirmWithReason(`Hapus rokok "${r.nama}"? Data distribusi & retur tidak akan ikut terhapus.`, { title: "Hapus Rokok", variant: "danger", confirmLabel: "Ya, Hapus" })
    if (!alasan) return
    setDeletingId(r.id)
    try {
      await deleteRokok(r.id, alasan)
      router.refresh()
    } finally {
      setDeletingId(null)
    }
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
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  onClick={() => navigate("/rokok/mutasi")}
                  icon={RotateCcw}
                  loading={isPending}
                >
                  Mutasi Stok
                </Button>
                {role !== "staff" && (
                  <>
                    <Button
                      variant="secondary"
                      onClick={() => setIsSorting(true)}
                      icon={MoveVertical}
                    >
                      Atur Urutan
                    </Button>
                    <PrimaryButton 
                      onClick={() => { setEditing(null); setMode("add") }} 
                      icon={Plus}
                    >
                      Tambah Rokok
                    </PrimaryButton>
                  </>
                )}
              </div>
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
              { key: "no",   label: "No",         render: (_, idx) => idx + 1 },
              { key: "nama", label: "Nama Rokok" },
              {
                key: "stok", label: "Stok", align: "right",
                render: (r) => (
                  <div className="flex items-center justify-end gap-2">
                    <span className={`font-semibold tabular-nums ${(r.stok ?? 0) < 50 ? "text-red-600" : (r.stok ?? 0) < 150 ? "text-amber-500" : "text-green-600"}`}>{r.stok ?? 0}</span>
                    {role !== "staff" && (
                      <IconButton onClick={() => setStokTarget(r)} icon={Plus} label="Tambah stok" className="bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border-emerald-100" />
                    )}
                  </div>
                ),
              },
              {
                key: "actions", label: "", align: "right",
                render: (r) => (
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => setDetailTarget(r)}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 transition"
                    >
                      <Info className="h-3.5 w-3.5" />
                      Detail
                    </button>
                    <RowActions
                      onEdit={role !== "staff" ? () => { setEditing(r); setMode("edit") } : null}
                      onDelete={role !== "staff" ? () => handleDelete(r) : null}
                      deleteDisabled={isUsed(r.id)}
                      deleteTitle="Rokok sudah digunakan di data distribusi/retur"
                      deleteLoading={deletingId === r.id}
                    />
                    <button
                      onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                      className="inline-flex items-center justify-center h-7 w-7 rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 transition"
                      title="Lihat mutasi hari ini"
                    >
                      <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${expandedId === r.id ? "rotate-180" : ""}`} />
                    </button>
                  </div>
                ),
              },
            ]}
            rowExtra={(r) => expandedId === r.id ? (
              <tr>
                <td colSpan={99} className="bg-neutral-50 px-4 py-3 border-b border-neutral-100">
                  <MutasiHariIni mutations={mutasiHariIni.filter(m => m.rokok_id === r.id)} />
                </td>
              </tr>
            ) : null}
            mobileRender={(r) => (
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-neutral-900">{r.nama}</p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className={`text-xs font-semibold tabular-nums ${(r.stok ?? 0) < 50 ? "text-red-600" : (r.stok ?? 0) < 150 ? "text-amber-500" : "text-green-600"}`}>
                      Stok: {r.stok ?? 0}
                    </span>
                    <IconButton
                      onClick={() => setStokTarget(r)}
                      icon={Plus}
                      label="Tambah stok"
                      className="bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border-emerald-100"
                    />
                    <button
                      onClick={() => setDetailTarget(r)}
                      className="inline-flex items-center gap-0.5 text-xs text-neutral-500 hover:text-neutral-700"
                    >
                      <Info className="h-3 w-3" />
                      Detail
                    </button>
                    <button
                      onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                      className="inline-flex items-center gap-0.5 text-xs text-neutral-500 hover:text-neutral-700"
                    >
                      <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${expandedId === r.id ? "rotate-180" : ""}`} />
                      Mutasi
                    </button>
                  </div>
                  {expandedId === r.id && (
                    <div className="mt-2">
                      <MutasiHariIni mutations={mutasiHariIni.filter(m => m.rokok_id === r.id)} />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <RowActions
                    onEdit={() => { setEditing(r); setMode("edit") }}
                    onDelete={() => { handleDelete(r) }}
                    deleteDisabled={isUsed(r.id)}
                    deleteTitle="Rokok sudah digunakan di data distribusi/retur"
                    deleteLoading={deletingId === r.id}
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
              if (mode === "add") {
                await addRokok(data)
                close()
                router.refresh()
              } else {
                close()
                const alasan = await confirmWithReason(`Edit rokok "${editing.nama}"?`, { title: "Edit Rokok", confirmLabel: "Ya, Simpan" })
                if (!alasan) return
                await updateRokok(editing.id, data, alasan)
                router.refresh()
              }
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
      {/* Modal Detail */}
      {detailTarget && (
        <Modal
          title={`Detail — ${detailTarget.nama}`}
          onClose={() => setDetailTarget(null)}
          width="max-w-sm"
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3">
              <span className="text-sm text-neutral-600">Stok</span>
              <span className={`text-sm font-semibold tabular-nums ${(detailTarget.stok ?? 0) < 50 ? "text-red-600" : (detailTarget.stok ?? 0) < 150 ? "text-amber-500" : "text-green-600"}`}>
                {detailTarget.stok ?? 0} bungkus
              </span>
            </div>
            {[
              { label: "Harga Beli",       value: detailTarget.harga_beli },
              { label: "Harga Grosir",     value: detailTarget.harga_grosir },
              { label: "Harga Toko",       value: detailTarget.harga_toko },
              { label: "Harga Perorangan", value: detailTarget.harga_perorangan },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3">
                <span className="text-sm text-neutral-600">{label}</span>
                <span className="text-sm font-semibold tabular-nums text-neutral-900">{fmtIDR(value)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3">
              <span className="text-sm text-neutral-600">Status</span>
              <span className={`text-sm font-semibold ${detailTarget.aktif ? "text-green-600" : "text-red-500"}`}>
                {detailTarget.aktif ? "Aktif" : "Nonaktif"}
              </span>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={() => setDetailTarget(null)}
              className="rounded-md px-4 py-2 text-sm font-medium text-neutral-700 border border-neutral-200 hover:bg-neutral-50 transition"
            >
              Tutup
            </button>
          </div>
        </Modal>
      )}

      {ConfirmWithReasonModal}
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
  const [aktif, setAktif]                   = useState(initial?.aktif !== false)
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
      await onSubmit({ nama: nama.trim(), stok: Number(stok), aktif, harga_beli: Number(hargaBeli), harga_grosir: Number(hargaGrosir), harga_toko: Number(hargaToko), harga_perorangan: Number(hargaPerorangan) })
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
      <div className="grid grid-cols-2 gap-4">
        <Field label={initial ? "Stok" : "Stok Awal"}>
          <input type="number" min="0" value={stok} onChange={(e) => setStok(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Status">
          <div className="flex items-center gap-2 h-10">
            <Toggle checked={aktif} onChange={setAktif} />
            <span className="text-sm text-neutral-600">{aktif ? "Aktif" : "Nonaktif"}</span>
          </div>
        </Field>
      </div>
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

// ─── Mutasi Hari Ini (accordion) ──────────────────────────────────────────────

function MutasiHariIni({ mutations }) {
  if (!mutations || mutations.length === 0) {
    return <p className="text-xs text-neutral-400 italic py-1">Belum ada mutasi stok hari ini.</p>
  }

  return (
    <div className="space-y-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Mutasi Hari Ini</p>
      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px]">
            <thead>
              <tr className="bg-neutral-50/80 border-b border-neutral-200 text-neutral-500">
                <th className="px-3 py-2 font-semibold">Waktu</th>
                <th className="px-3 py-2 font-semibold">User</th>
                <th className="px-3 py-2 font-semibold">Source</th>
                <th className="px-3 py-2 font-semibold">Keterangan</th>
                <th className="px-3 py-2 font-semibold text-right">Qty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {mutations.map((m) => {
                const src = SOURCE_LABEL[m.source] ?? { label: m.source, cls: "bg-neutral-100 text-neutral-600" }
                return (
                  <tr key={m.id} className="hover:bg-neutral-50/50 transition-colors">
                    <td className="px-3 py-2.5 text-neutral-400 tabular-nums">{m.createdAt.slice(11)}</td>
                    <td className="px-3 py-2.5 font-bold text-neutral-800">{m.user_name}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-tight ${src.cls}`}>
                        {src.label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-neutral-600 italic">{m.keterangan || "—"}</td>
                    <td className={`px-3 py-2.5 text-right font-bold tabular-nums ${m.jenis === "in" ? "text-emerald-600" : "text-red-600"}`}>
                      {m.jenis === "in" ? "+" : "-"}{m.qty}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
