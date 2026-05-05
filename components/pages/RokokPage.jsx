"use client"

import { useMemo, useState, useEffect, useTransition } from "react"
import { useRouter } from "next/navigation"
import { 
  Plus, GripVertical, Save, X, MoveVertical, RotateCcw, ChevronDown, 
  ChevronRight, Info, Package, TrendingUp, ShoppingCart, Store, Users, 
  CheckCircle, AlertCircle, Eye
} from "lucide-react"
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
                    <IconButton
                      onClick={() => setDetailTarget(r)}
                      icon={Eye}
                      label="Detail"
                      className="bg-white text-neutral-500 hover:bg-neutral-50 border-neutral-200 shadow-sm"
                    />
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
                      <Eye className="h-3 w-3" />
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
          title={`Detail Rokok — ${detailTarget.nama}`}
          onClose={() => setDetailTarget(null)}
          width="max-w-md"
        >
          <div className="space-y-6">
            {/* Header Info: Stok & Status */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
                    <Package className="h-4 w-4" />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Stok Tersedia</span>
                </div>
                <p className={`text-2xl font-bold tabular-nums ${(detailTarget.stok ?? 0) < 50 ? "text-red-600" : (detailTarget.stok ?? 0) < 150 ? "text-amber-500" : "text-green-600"}`}>
                  {detailTarget.stok ?? 0}
                </p>
                <p className="text-xs text-neutral-500 mt-1">bungkus di gudang</p>
              </div>

              <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm text-right">
                <div className="flex items-center justify-end gap-2 mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Status Produk</span>
                  <div className={`p-1.5 rounded-lg ${detailTarget.aktif ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"}`}>
                    {detailTarget.aktif ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                  </div>
                </div>
                <p className={`text-2xl font-bold ${detailTarget.aktif ? "text-green-600" : "text-red-600"}`}>
                  {detailTarget.aktif ? "Aktif" : "Nonaktif"}
                </p>
                <p className="text-xs text-neutral-500 mt-1">{detailTarget.aktif ? "Siap didistribusikan" : "Tidak muncul di form"}</p>
              </div>
            </div>

            {/* Pricing Section */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <TrendingUp className="h-4 w-4 text-neutral-400" />
                <h4 className="text-sm font-bold text-neutral-700">Daftar Harga Jual</h4>
              </div>
              
              <div className="grid grid-cols-1 gap-2">
                {[
                  { label: "Harga Beli",       value: detailTarget.harga_beli,       icon: ShoppingCart, bg: "bg-neutral-50", text: "text-neutral-600" },
                  { label: "Harga Grosir",     value: detailTarget.harga_grosir,     icon: TrendingUp,   bg: "bg-indigo-50/50", text: "text-indigo-700" },
                  { label: "Harga Toko",        value: detailTarget.harga_toko,       icon: Store,        bg: "bg-blue-50/50",   text: "text-blue-700" },
                  { label: "Harga Perorangan", value: detailTarget.harga_perorangan, icon: Users,        bg: "bg-violet-50/50", text: "text-violet-700" },
                ].map((p) => (
                  <div key={p.label} className={`flex items-center justify-between rounded-xl border border-neutral-200/60 ${p.bg} px-4 py-3.5 transition-all hover:border-neutral-300`}>
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg bg-white shadow-sm ${p.text}`}>
                        <p.icon className="h-4 w-4" />
                      </div>
                      <span className="text-sm font-medium text-neutral-600">{p.label}</span>
                    </div>
                    <span className="text-lg font-bold tabular-nums text-neutral-900">{fmtIDR(p.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-8 pt-4 border-t border-neutral-100 flex justify-end">
            <Button
              variant="secondary"
              onClick={() => setDetailTarget(null)}
              className="px-8 shadow-sm"
            >
              Tutup
            </Button>
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
    try {
      await onSubmit(totalBungkus, tanggal, keterangan)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3.5">
      {/* SECTION 1: INFORMASI STOK */}
      <section className="space-y-2">
        <div className="flex items-center gap-2 px-1">
          <div className="h-3 w-1 bg-blue-500 rounded-full" />
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Informasi Stok</h4>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-2.5">
            <div className="flex items-center gap-1.5 mb-0.5">
              <Package className="h-3 w-3 text-neutral-400" />
              <span className="text-[9px] font-bold uppercase tracking-wider text-neutral-400">Stok Saat Ini</span>
            </div>
            <p className="text-lg font-bold tabular-nums text-neutral-900">{rokok.stok ?? 0} <span className="text-[10px] font-normal text-neutral-500 uppercase">Bks</span></p>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/30 p-2.5">
            <div className="flex items-center gap-1.5 mb-0.5">
              <Plus className="h-3 w-3 text-emerald-500" />
              <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-500">Tambahan</span>
            </div>
            <p className="text-lg font-bold tabular-nums text-emerald-600">+{totalBungkus} <span className="text-[10px] font-normal text-neutral-500 uppercase">Bks</span></p>
          </div>
        </div>
      </section>

      {/* SECTION 2: INPUT JUMLAH */}
      <section className="space-y-1.5">
        <div className="flex items-center gap-2 px-1">
          <div className="h-3 w-1 bg-emerald-500 rounded-full" />
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Input Jumlah</h4>
        </div>
        <div className="pt-1">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Slop (x10)">
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  value={slop}
                  onChange={(e) => setSlop(e.target.value)}
                  placeholder="0"
                  className={`${inputCls} pl-10 pr-4 text-lg font-semibold tabular-nums border-neutral-200 focus:border-emerald-500 focus:ring-emerald-500/10`}
                  autoFocus
                />
                <Package className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              </div>
            </Field>
            <Field label="Bungkus">
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  value={bungkus}
                  onChange={(e) => setBungkus(e.target.value)}
                  placeholder="0"
                  className={`${inputCls} pl-10 pr-4 text-lg font-semibold tabular-nums border-neutral-200 focus:border-emerald-500 focus:ring-emerald-500/10`}
                />
                <div className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 rounded bg-neutral-100 flex items-center justify-center text-[10px] font-bold text-neutral-500 uppercase">
                  B
                </div>
              </div>
            </Field>
          </div>
        </div>
      </section>

      {/* SECTION 3: DETAIL PENGISIAN */}
      <section className="space-y-1.5">
        <div className="flex items-center gap-2 px-1">
          <div className="h-3 w-1 bg-amber-500 rounded-full" />
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Detail</h4>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tanggal">
            <input
              type="date"
              value={tanggal}
              onChange={(e) => setTanggal(e.target.value)}
              className={`${inputCls} h-9 text-xs`}
              required
            />
          </Field>
          <Field label="Keterangan">
            <input
              type="text"
              value={keterangan}
              onChange={(e) => setKeterangan(e.target.value)}
              placeholder="Opsional..."
              className={`${inputCls} h-9 text-xs`}
            />
          </Field>
        </div>
      </section>

      {/* SECTION 4: KONFIRMASI */}
      <div className="pt-1">
        <div className="rounded-xl border-2 border-emerald-500/10 bg-emerald-500/5 p-2.5 flex items-center justify-between border-dashed">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-emerald-500 text-white shadow-sm">
              <CheckCircle className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-600/70 leading-none mb-1">Stok Akhir</p>
              <p className="text-[10px] font-medium text-neutral-500 italic leading-none">Estimasi total</p>
            </div>
          </div>
          <div className="text-right leading-none">
            <p className="text-xl font-black tabular-nums text-emerald-700">{(rokok.stok ?? 0) + totalBungkus}</p>
            <p className="text-[8px] font-bold text-emerald-600 tracking-wider">BUNGKUS</p>
          </div>
        </div>
      </div>

      <div className="pt-1">
        <FormActions onCancel={onCancel} disabled={!valid} loading={loading} submitLabel="Simpan Stok" />
      </div>
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
