"use client"

import { useMemo, useState, useEffect, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Plus, Minus, GripVertical, Save, X, MoveVertical, RotateCcw, RefreshCcw, ChevronDown,
  ChevronRight, Info, Package, TrendingUp, ShoppingCart, Store, Users,
  CheckCircle, AlertCircle, Eye, Tag, Banknote
} from "lucide-react"
import { fmtIDR } from "@/lib/utils"
import { addRokok, updateRokok, deleteRokok, toggleAktifRokok, tambahStok, updateRokokOrder, tambahStokSampleBiasa, pindahStokSampleCukai } from "@/actions/rokok"
import { Card, PageHeader, PrimaryButton, IconButton, RowActions, Field, FormActions, Toggle, inputCls, useConfirm, useConfirmWithReason, Button, MoneyInput } from "@/components/ui"
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

function SkeletonText({ w = "w-24" }) {
  return <span className={`inline-block h-3.5 ${w} animate-pulse rounded bg-neutral-200`} />
}

export default function RokokPage({ role, rokokList, usedIds, mutasiHariIni = [] }) {
  const router = useRouter()
  const [isLocalPending, startLocalTransition] = useTransition()
  const { isPending, navigate } = useLoading()
  const { confirm, ConfirmModal } = useConfirm()
  const { confirmWithReason, ConfirmWithReasonModal } = useConfirmWithReason()
  const [localList, setLocalList] = useState(rokokList)
  const [mode, setMode] = useState(null)
  const [editing, setEditing] = useState(null)
  const [stokTarget,        setStokTarget]        = useState(null)
  const [sampleBiasaTarget, setSampleBiasaTarget] = useState(null)
  const [konversiTarget,    setKonversiTarget]    = useState(null)
  const [detailTarget,      setDetailTarget]      = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [isSorting, setIsSorting] = useState(false)
  const [sortedList, setSortedList] = useState([])
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    setLocalList(rokokList)
    setSortedList(rokokList)
  }, [rokokList])

  const upsertLocal = (record) => {
    if (!record?.id) return
    setLocalList((prev) =>
      prev.some((r) => r.id === record.id)
        ? prev.map((r) => r.id === record.id ? record : r)
        : [record, ...prev]
    )
  }
  const removeLocal = (id) => setLocalList((prev) => prev.filter((r) => r.id !== id))

  const rows = useMemo(() => {
    if (isSorting || isPending || isSaving) return sortedList
    return localList
  }, [localList, isSorting, sortedList, isPending, isSaving])

  const isUsed = (id) => usedIds.includes(id)

  const close = () => { setMode(null); setEditing(null) }

  const handleDelete = async (r) => {
    const alasan = await confirmWithReason(`Hapus rokok "${r.nama}"? Data distribusi & retur tidak akan ikut terhapus.`, { title: "Hapus Rokok", variant: "danger", confirmLabel: "Ya, Hapus" })
    if (!alasan) return
    removeLocal(r.id)
    deleteRokok(r.id, alasan).catch(async (error) => {
      upsertLocal(r)
      await confirm(error?.message || "Gagal menghapus rokok.", { title: "Gagal Hapus", hideCancel: true })
    })
  }

  const handleToggle = (id) => {
    setLocalList((prev) => prev.map((r) => r.id === id ? { ...r, aktif: !r.aktif } : r))
    toggleAktifRokok(id).catch(() => {
      setLocalList((prev) => prev.map((r) => r.id === id ? { ...r, aktif: !r.aktif } : r))
    })
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
              {
                key: "nama", label: "Nama Rokok",
                render: (r) => r._pending ? <SkeletonText w="w-28" /> : (
                  <div className="flex items-center gap-2">
                    <span className={r.aktif === false ? "text-neutral-400" : ""}>{r.nama}</span>
                    {r.aktif === false && (
                      <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-neutral-400">Nonaktif</span>
                    )}
                  </div>
                )
              },
              {
                key: "stok_total", label: "Total", align: "center",
                render: (r) => r._pending ? <SkeletonText w="w-10" /> : (
                  <span className={`text-sm font-bold tabular-nums ${r.aktif === false ? "text-neutral-400" : ((r.stok ?? 0) + (r.stok_sample_cukai ?? 0)) < 50 ? "text-red-600" : ((r.stok ?? 0) + (r.stok_sample_cukai ?? 0)) < 150 ? "text-amber-500" : "text-green-600"}`}>
                    {(r.stok ?? 0) + (r.stok_sample_cukai ?? 0)}
                  </span>
                ),
              },
              {
                key: "stok_rokok", label: "Stok Rokok", align: "center",
                render: (r) => r._pending ? <SkeletonText w="w-10" /> : (
                  <div className="inline-flex items-center gap-1.5">
                    <span className="inline-block w-14 text-right text-sm font-semibold tabular-nums text-neutral-800">{r.stok ?? 0}</span>
                    {role !== "staff" && r.aktif !== false && (
                      <button
                        onClick={() => setStokTarget(r)}
                        title="Tambah stok rokok"
                        className="inline-flex h-5 w-5 items-center justify-center rounded border border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ),
              },
              {
                key: "stok_sample_cukai", label: "Sample Cukai", align: "center",
                render: (r) => r._pending ? <SkeletonText w="w-10" /> : (
                  <div className="inline-flex items-center gap-1.5">
                    <span className="inline-block w-10 text-right text-sm font-semibold tabular-nums text-orange-600">{r.stok_sample_cukai ?? 0}</span>
                    {role !== "staff" && r.aktif !== false && (
                      <button
                        onClick={() => setKonversiTarget(r)}
                        title="Kelola stok sample cukai"
                        className="inline-flex h-5 w-5 items-center justify-center rounded border border-orange-200 bg-orange-50 text-orange-600 hover:bg-orange-100 transition"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ),
              },
              {
                key: "stok_sample_biasa", label: "Sample Biasa", align: "center",
                render: (r) => r._pending ? <SkeletonText w="w-10" /> : (
                  <div className="inline-flex items-center gap-1.5">
                    <span className="inline-block w-10 text-right text-sm font-semibold tabular-nums text-blue-600">{r.stok_sample_biasa ?? 0}</span>
                    {role !== "staff" && r.aktif !== false && (
                      <button
                        onClick={() => setSampleBiasaTarget(r)}
                        title="Tambah stok sample biasa"
                        className="inline-flex h-5 w-5 items-center justify-center rounded border border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 transition"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ),
              },
              {
                key: "actions", label: "", align: "right",
                render: (r) => {
                  if (r._pending) return (
                    <div className="flex items-center justify-end gap-2 pr-1">
                      <svg className="h-4 w-4 animate-spin text-neutral-400" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                      <span className="text-xs text-neutral-400">Menyimpan...</span>
                    </div>
                  )
                  return (
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
                      />
                      <button
                        onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                        className="inline-flex items-center justify-center h-7 w-7 rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 transition"
                        title="Lihat mutasi hari ini"
                      >
                        <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${expandedId === r.id ? "rotate-180" : ""}`} />
                      </button>
                    </div>
                  )
                },
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
                  <div className="flex items-center gap-2">
                    <p className={`font-medium ${r._pending || r.aktif !== false ? "text-neutral-900" : "text-neutral-400"}`}>{r._pending ? <SkeletonText w="w-28" /> : r.nama}</p>
                    {!r._pending && r.aktif === false && (
                      <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-neutral-400">Nonaktif</span>
                    )}
                  </div>
                  {r._pending ? (
                    <div className="flex items-center gap-2 mt-1">
                      <svg className="h-4 w-4 animate-spin text-neutral-400" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                      <span className="text-xs text-neutral-400">Menyimpan...</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <span className={`text-xs font-semibold tabular-nums ${r.aktif === false ? "text-neutral-400" : ((r.stok ?? 0) + (r.stok_sample_cukai ?? 0)) < 50 ? "text-red-600" : ((r.stok ?? 0) + (r.stok_sample_cukai ?? 0)) < 150 ? "text-amber-500" : "text-green-600"}`}>
                        Total: {(r.stok ?? 0) + (r.stok_sample_cukai ?? 0)}
                      </span>
                      <div className="h-3 w-px bg-neutral-200" />
                      <span className="text-[10px] font-medium text-neutral-500 tabular-nums">Jual: {r.stok ?? 0}</span>
                      {role !== "staff" && r.aktif !== false && (
                        <IconButton
                          onClick={() => setStokTarget(r)}
                          icon={Plus}
                          label="Tambah stok"
                          className="bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border-emerald-100"
                        />
                      )}
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
                  )}
                  {expandedId === r.id && (
                    <div className="mt-2">
                      <MutasiHariIni mutations={mutasiHariIni.filter(m => m.rokok_id === r.id)} />
                    </div>
                  )}
                </div>
                {!r._pending && role !== "staff" && (
                  <div className="flex items-center gap-2 shrink-0">
                    <RowActions
                      onEdit={() => { setEditing(r); setMode("edit") }}
                      onDelete={() => { handleDelete(r) }}
                      deleteDisabled={isUsed(r.id)}
                      deleteTitle="Rokok sudah digunakan di data distribusi/retur"
                    />
                  </div>
                )}
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
                const tempId = `temp-${Date.now()}`
                upsertLocal({ id: tempId, ...data, _pending: true })
                close()
                addRokok(data)
                  .then(() => router.refresh())
                  .catch(async (error) => {
                    removeLocal(tempId)
                    await confirm(error?.message || "Gagal menambah rokok.", { title: "Gagal Tambah", hideCancel: true })
                  })
              } else {
                const captured = editing
                close()
                const alasan = await confirmWithReason(`Edit rokok "${captured.nama}"?`, { title: "Edit Rokok", confirmLabel: "Ya, Simpan" })
                if (!alasan) return
                upsertLocal({ ...captured, ...data, _pending: true })
                updateRokok(captured.id, data, alasan)
                  .then(() => router.refresh())
                  .catch(async (error) => {
                    upsertLocal({ ...captured, _pending: false })
                    await confirm(error?.message || "Gagal mengedit rokok.", { title: "Gagal Edit", hideCancel: true })
                  })
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
              const captured = stokTarget
              upsertLocal({ ...captured, stok: (captured.stok ?? 0) + qty, _pending: true })
              setStokTarget(null)
              tambahStok(captured.id, qty, date, ket)
                .then(() => router.refresh())
                .catch(async (error) => {
                  upsertLocal({ ...captured, _pending: false })
                  await confirm(error?.message || "Gagal menambah stok.", { title: "Gagal Tambah Stok", hideCancel: true })
                })
            }}
            onCancel={() => setStokTarget(null)}
          />
        </Modal>
      )}
      {/* Modal Kelola Stok Sample Cukai */}
      {konversiTarget && (
        <Modal title={`Kelola Stok Sample Cukai — ${konversiTarget.nama}`} onClose={() => setKonversiTarget(null)} width="max-w-sm">
          <SampleCukaiManagement
            rokok={konversiTarget}
            onClose={() => setKonversiTarget(null)}
            upsertLocal={upsertLocal}
            confirm={confirm}
            router={router}
          />
        </Modal>
      )}


      {/* Modal Tambah Stok Sample Biasa */}
      {sampleBiasaTarget && (
        <Modal title={`Tambah Stok Sample Biasa — ${sampleBiasaTarget.nama}`} onClose={() => setSampleBiasaTarget(null)} width="max-w-sm">
          <TambahStokForm
            rokok={sampleBiasaTarget}
            isSampleBiasa={true}
            onSubmit={async (qty, date, ket) => {
              const captured = sampleBiasaTarget
              upsertLocal({ ...captured, stok_sample_biasa: (captured.stok_sample_biasa ?? 0) + qty, _pending: true })
              setSampleBiasaTarget(null)
              tambahStokSampleBiasa(captured.id, qty, date, ket)
                .then(() => router.refresh())
                .catch(async (error) => {
                  upsertLocal({ ...captured, _pending: false })
                  await confirm(error?.message || "Gagal tambah stok sample biasa.", { title: "Gagal Tambah", hideCancel: true })
                })
            }}
            onCancel={() => setSampleBiasaTarget(null)}
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
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Total Stok", value: (detailTarget.stok ?? 0) + (detailTarget.stok_sample_cukai ?? 0), color: "text-neutral-900", bg: "bg-neutral-50", border: "border-neutral-200", sub: "jual + sample cukai" },
                { label: "Stok Jual",  value: detailTarget.stok ?? 0, color: (detailTarget.stok ?? 0) < 50 ? "text-red-600" : (detailTarget.stok ?? 0) < 150 ? "text-amber-500" : "text-green-600", bg: "bg-white", border: "border-neutral-200", sub: "siap distribusi" },
                { label: "Sample Cukai", value: detailTarget.stok_sample_cukai ?? 0, color: "text-orange-600", bg: "bg-orange-50/50", border: "border-orange-100", sub: "dari stok reguler" },
                { label: "Sample Biasa", value: detailTarget.stok_sample_biasa ?? 0, color: "text-blue-600", bg: "bg-blue-50/50", border: "border-blue-100", sub: "dari distributor" },
              ].map((s) => (
                <div key={s.label} className={`rounded-xl border ${s.border} ${s.bg} p-3 shadow-sm`}>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-neutral-400 mb-1">{s.label}</p>
                  <p className={`text-xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
                  <p className="text-[10px] text-neutral-400 mt-0.5">{s.sub}</p>
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white p-3 shadow-sm text-right">
              <div className="flex items-center justify-end gap-2 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Status Produk</span>
                <div className={`p-1.5 rounded-lg ${detailTarget.aktif ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"}`}>
                  {detailTarget.aktif ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                </div>
              </div>
              <p className={`text-xl font-bold ${detailTarget.aktif ? "text-green-600" : "text-red-600"}`}>
                {detailTarget.aktif ? "Aktif" : "Nonaktif"}
              </p>
              <p className="text-xs text-neutral-500 mt-0.5">{detailTarget.aktif ? "Siap didistribusikan" : "Tidak muncul di form"}</p>
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

      {ConfirmModal}
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

function TambahStokForm({ rokok, isSampleBiasa = false, isSampleCukai = false, onSubmit, onCancel, initialMode = "in" }) {
  const [mode, setMode]       = useState(initialMode) // "in" or "out"
  const [slop, setSlop]       = useState("")
  const [bungkus, setBungkus] = useState("")
  const [tanggal, setTanggal] = useState(new Date().toISOString().split("T")[0])
  const [keterangan, setKeterangan] = useState("")

  const baseQty = (Number(slop) || 0) * 10 + (Number(bungkus) || 0)
  const totalBungkus = mode === "out" ? -baseQty : baseQty
  const valid = baseQty > 0

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

  const isOut = mode === "out"
  const themeCls = isOut 
    ? "border-rose-200 bg-rose-50/50 text-rose-600 focus:border-rose-500 focus:ring-rose-500/10" 
    : "border-emerald-200 bg-emerald-50/50 text-emerald-600 focus:border-emerald-500 focus:ring-emerald-500/10"

  return (
    <form onSubmit={submit} className="space-y-4">
      {/* TOGGLE MODE */}
      <div className="flex p-1 bg-neutral-100 rounded-xl">
        <button
          type="button"
          onClick={() => setMode("in")}
          className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all ${
            mode === "in" 
              ? "bg-white text-emerald-600 shadow-sm border border-neutral-200" 
              : "text-neutral-400 hover:text-neutral-600"
          }`}
        >
          <Plus className="h-3.5 w-3.5" />
          TAMBAH (+)
        </button>
        <button
          type="button"
          onClick={() => setMode("out")}
          className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all ${
            mode === "out" 
              ? "bg-white text-rose-600 shadow-sm border border-neutral-200" 
              : "text-neutral-400 hover:text-neutral-600"
          }`}
        >
          <Minus className="h-3.5 w-3.5" />
          KURANGI (-)
        </button>
      </div>

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
            <p className="text-lg font-bold tabular-nums text-neutral-900">
              {isSampleBiasa ? (rokok.stok_sample_biasa ?? 0) : 
               isSampleCukai ? (rokok.stok_sample_cukai ?? 0) : 
               (rokok.stok ?? 0)} 
              <span className="text-[10px] font-normal text-neutral-500 uppercase ml-1">Bks</span>
            </p>
          </div>
          <div className={`rounded-xl border p-2.5 transition-colors ${isOut ? "border-rose-100 bg-rose-50/30" : "border-emerald-100 bg-emerald-50/30"}`}>
            <div className="flex items-center gap-1.5 mb-0.5">
              {isOut ? <Minus className="h-3 w-3 text-rose-500" /> : <Plus className="h-3 w-3 text-emerald-500" />}
              <span className={`text-[9px] font-bold uppercase tracking-wider ${isOut ? "text-rose-500" : "text-emerald-500"}`}>
                {isOut ? "Pengurangan" : "Tambahan"}
              </span>
            </div>
            <p className={`text-lg font-bold tabular-nums ${isOut ? "text-rose-600" : "text-emerald-600"}`}>
              {isOut ? "-" : "+"}{baseQty} <span className="text-[10px] font-normal text-neutral-500 uppercase">Bks</span>
            </p>
          </div>
        </div>
      </section>

      {/* SECTION 2: INPUT JUMLAH */}
      <section className="space-y-1.5">
        <div className="flex items-center gap-2 px-1">
          <div className={`h-3 w-1 rounded-full ${isOut ? "bg-rose-500" : "bg-emerald-500"}`} />
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Input Jumlah</h4>
        </div>
        <div className="pt-1">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Slop (x10)">
              <div className="relative">
                <input
                  type="number"
                  value={slop}
                  onChange={(e) => setSlop(e.target.value)}
                  placeholder="0"
                  className={`${inputCls} pl-10 pr-4 text-lg font-semibold tabular-nums ${themeCls}`}
                  autoFocus
                />
                <Package className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 ${isOut ? "text-rose-400" : "text-emerald-400"}`} />
              </div>
            </Field>
            <Field label="Bungkus">
              <div className="relative">
                <input
                  type="number"
                  value={bungkus}
                  onChange={(e) => setBungkus(e.target.value)}
                  placeholder="0"
                  className={`${inputCls} pl-10 pr-4 text-lg font-semibold tabular-nums ${themeCls}`}
                />
                <div className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 rounded flex items-center justify-center text-[10px] font-bold uppercase ${isOut ? "bg-rose-100 text-rose-500" : "bg-emerald-100 text-emerald-500"}`}>
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
        <div className={`rounded-xl border-2 p-2.5 flex items-center justify-between border-dashed transition-colors ${isOut ? "border-rose-500/20 bg-rose-500/5" : "border-emerald-500/10 bg-emerald-500/5"}`}>
          <div className="flex items-center gap-2.5">
            <div className={`p-1.5 rounded-lg text-white shadow-sm transition-colors ${isOut ? "bg-rose-500" : "bg-emerald-500"}`}>
              {isOut ? <Minus className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1">Estimasi Stok Akhir</p>
              <p className={`text-xl font-black tabular-nums transition-colors ${isOut ? "text-rose-700" : "text-emerald-700"}`}>
                {(isSampleBiasa ? (rokok.stok_sample_biasa ?? 0) : 
                  isSampleCukai ? (rokok.stok_sample_cukai ?? 0) : 
                  (rokok.stok ?? 0)) + totalBungkus}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="pt-1">
        <FormActions 
          onCancel={onCancel} 
          disabled={!valid} 
          loading={loading} 
          submitLabel={isOut ? "Simpan Pengurangan" : "Simpan Tambahan"} 
          variant={isOut ? "danger" : "primary"}
        />
      </div>
    </form>
  )
}


// ─── Form Konversi ke Sample Cukai ───────────────────────────────────────────

function SampleCukaiManagement({ rokok, onClose, upsertLocal, confirm, router }) {
  const [tab, setTab] = useState("to_sample") // "to_sample" | "to_jual"

  const handleTransfer = async (qty, direction, catatan) => {
    const captured = rokok
    const newStok = direction === "to_sample" ? (captured.stok ?? 0) - qty : (captured.stok ?? 0) + qty
    const newSample = direction === "to_sample" ? (captured.stok_sample_cukai ?? 0) + qty : (captured.stok_sample_cukai ?? 0) - qty
    
    upsertLocal({ ...captured, stok: newStok, stok_sample_cukai: newSample, _pending: true })
    onClose()
    
    pindahStokSampleCukai(captured.id, qty, direction, catatan)
      .then(() => router.refresh())
      .catch(async (error) => {
        upsertLocal({ ...captured, _pending: false })
        await confirm(error?.message || "Gagal memindahkan stok.", { title: "Gagal Pindah", hideCancel: true })
      })
  }

  return (
    <div className="space-y-6">
      <div className="flex p-1 bg-neutral-100 rounded-xl">
        <button
          onClick={() => setTab("to_sample")}
          className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
            tab === "to_sample" ? "bg-white text-orange-600 shadow-sm border border-neutral-200" : "text-neutral-400 hover:text-neutral-600"
          }`}
        >
          <RefreshCcw className="h-3.5 w-3.5" />
          Ke Sample
        </button>
        <button
          onClick={() => setTab("to_jual")}
          className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
            tab === "to_jual" ? "bg-white text-blue-600 shadow-sm border border-neutral-200" : "text-neutral-400 hover:text-neutral-600"
          }`}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Ke Stok Jual
        </button>
      </div>

      <TransferSampleForm
        rokok={rokok}
        direction={tab}
        onCancel={onClose}
        onSubmit={(qty, catatan) => handleTransfer(qty, tab, catatan)}
      />
    </div>
  )
}


function TransferSampleForm({ rokok, direction, onSubmit, onCancel }) {
  const [qty,      setQty]     = useState("")
  const [catatan,  setCatatan] = useState("")
  const [loading,  setLoading] = useState(false)

  const isToSample = direction === "to_sample"
  const maxQty     = isToSample ? (rokok.stok ?? 0) : (rokok.stok_sample_cukai ?? 0)
  const qtyNum     = Number(qty) || 0
  const valid      = qtyNum > 0 && qtyNum <= maxQty

  const submit = async (e) => {
    e.preventDefault()
    if (!valid || loading) return
    setLoading(true)
    try { await onSubmit(qtyNum, catatan) }
    finally { setLoading(false) }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className={`rounded-xl border p-2.5 transition-colors ${!isToSample ? "border-blue-200 bg-blue-50/50" : "border-neutral-200 bg-neutral-50"}`}>
          <p className={`text-[9px] font-bold uppercase tracking-wider mb-1 ${!isToSample ? "text-blue-500" : "text-neutral-400"}`}>Stok Jual</p>
          <p className={`text-lg font-bold tabular-nums ${!isToSample ? "text-blue-700" : "text-neutral-700"}`}>{rokok.stok ?? 0}</p>
        </div>
        <div className={`rounded-xl border p-2.5 transition-colors ${isToSample ? "border-orange-100 bg-orange-50" : "border-blue-100 bg-blue-50"}`}>
          <p className={`text-[9px] font-bold uppercase tracking-wider mb-1 ${isToSample ? "text-orange-400" : "text-blue-400"}`}>{isToSample ? "Pindah Ke Sample" : "Kembali Ke Stok"}</p>
          <p className={`text-lg font-bold tabular-nums ${isToSample ? "text-orange-600" : "text-blue-600"}`}>{qtyNum > 0 ? `-${qtyNum}` : "0"}</p>
        </div>
        <div className={`rounded-xl border p-2.5 transition-colors ${isToSample ? "border-orange-200 bg-orange-50/50" : "border-neutral-200 bg-neutral-50"}`}>
          <p className={`text-[9px] font-bold uppercase tracking-wider mb-1 ${isToSample ? "text-orange-500" : "text-neutral-400"}`}>Sample Cukai</p>
          <p className={`text-lg font-bold tabular-nums ${isToSample ? "text-orange-700" : "text-neutral-700"}`}>{rokok.stok_sample_cukai ?? 0}</p>
        </div>
      </div>
      
      <Field label={`Berapa yang ingin dikurangi dari ${isToSample ? 'Stok Jual' : 'Sample Cukai'}?`}>
        <input
          type="number" min="1" max={maxQty}
          value={qty} onChange={(e) => setQty(e.target.value)}
          placeholder="0" className={inputCls} autoFocus
        />
        {qtyNum > maxQty && (
          <p className="mt-1 text-xs text-red-500">Melebihi stok yang tersedia ({maxQty})</p>
        )}
      </Field>

      <Field label="Catatan (opsional)">
        <input type="text" value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="Opsional" className={inputCls} />
      </Field>

      <FormActions 
        onCancel={onCancel} 
        disabled={!valid} 
        loading={loading} 
        submitLabel={isToSample ? "Pindahkan ke Sample" : "Kembalikan ke Stok"} 
      />
    </form>
  )
}

// ─── Form Tambah/Edit Rokok ───────────────────────────────────────────────────

function RokokForm({ initial, rokokList, onSubmit, onCancel }) {
  const [nama, setNama]                     = useState(initial?.nama || "")
  const [stok, setStok]                     = useState(initial?.stok || "")
  const [aktif, setAktif]                   = useState(initial?.aktif !== false)
  const isNonaktif = initial && !aktif
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
    <form onSubmit={submit} className="space-y-6">
      {/* SECTION 1: INFORMASI DASAR */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 px-1">
          <div className="h-4 w-1 bg-neutral-900 rounded-full" />
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">Informasi Dasar</h4>
        </div>
        
        <div className="space-y-4 rounded-2xl border border-neutral-200 bg-neutral-50/30 p-4">
          <Field label="Nama Produk">
            <div className="relative">
              <input 
                type="text" 
                value={nama} 
                onChange={(e) => setNama(e.target.value)} 
                placeholder="Misal: Marlboro Merah" 
                className={`${inputCls} pl-10 border-neutral-200 focus:border-neutral-900`}
                required
              />
              <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
            </div>
            {isDuplicate && (
              <div className="flex items-center gap-1.5 mt-2 text-red-600 bg-red-50 px-2 py-1 rounded-md border border-red-100">
                <AlertCircle className="h-3.5 w-3.5" />
                <p className="text-[10px] font-medium uppercase tracking-wide">Nama produk sudah digunakan</p>
              </div>
            )}
          </Field>

          {isNonaktif && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              Produk nonaktif — stok dan harga tidak bisa diubah. Aktifkan dulu untuk mengedit.
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <Field label={initial ? "Stok Saat Ini" : "Stok Awal"}>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  value={stok}
                  onChange={(e) => setStok(e.target.value)}
                  disabled={isNonaktif}
                  className={`${inputCls} pl-10 border-neutral-200 focus:border-neutral-900 tabular-nums${isNonaktif ? " opacity-50 cursor-not-allowed bg-neutral-50" : ""}`}
                />
                <Package className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              </div>
            </Field>
            <Field label="Status Produk">
              <div className="flex items-center gap-3 h-10 px-3 bg-white rounded-lg border border-neutral-200">
                <Toggle checked={aktif} onChange={setAktif} />
                <span className={`text-xs font-bold uppercase tracking-wider ${aktif ? "text-green-600" : "text-neutral-400"}`}>
                  {aktif ? "Aktif" : "Nonaktif"}
                </span>
              </div>
            </Field>
          </div>
        </div>
      </section>

      {/* SECTION 2: HARGA */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 px-1">
          <div className="h-4 w-1 bg-emerald-500 rounded-full" />
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">Daftar Harga Jual</h4>
        </div>

        <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4${isNonaktif ? " opacity-50 pointer-events-none" : ""}`}>
          <Field label="Harga Beli (Modal)">
            <div className="relative group">
              <MoneyInput
                value={hargaBeli}
                onChange={setHargaBeli}
                placeholder="0"
                disabled={isNonaktif}
                className={`${inputCls} pl-10 border-neutral-200 focus:border-emerald-500 font-bold tabular-nums`}
              />
              <ShoppingCart className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400 group-focus-within:text-emerald-500 transition-colors" />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-neutral-300 uppercase tracking-widest">Modal</div>
            </div>
          </Field>

          <Field label="Harga Grosir">
            <div className="relative group">
              <MoneyInput
                value={hargaGrosir}
                onChange={setHargaGrosir}
                placeholder="0"
                disabled={isNonaktif}
                className={`${inputCls} pl-10 border-neutral-200 focus:border-indigo-500 font-bold tabular-nums`}
              />
              <TrendingUp className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400 group-focus-within:text-indigo-500 transition-colors" />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-neutral-300 uppercase tracking-widest">Grosir</div>
            </div>
          </Field>

          <Field label="Harga Toko">
            <div className="relative group">
              <MoneyInput
                value={hargaToko}
                onChange={setHargaToko}
                placeholder="0"
                disabled={isNonaktif}
                className={`${inputCls} pl-10 border-neutral-200 focus:border-blue-500 font-bold tabular-nums`}
              />
              <Store className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400 group-focus-within:text-blue-500 transition-colors" />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-neutral-300 uppercase tracking-widest">Toko</div>
            </div>
          </Field>

          <Field label="Harga Perorangan">
            <div className="relative group">
              <MoneyInput
                value={hargaPerorangan}
                onChange={setHargaPerorangan}
                placeholder="0"
                disabled={isNonaktif}
                className={`${inputCls} pl-10 border-neutral-200 focus:border-violet-500 font-bold tabular-nums`}
              />
              <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400 group-focus-within:text-violet-500 transition-colors" />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-neutral-300 uppercase tracking-widest">Retail</div>
            </div>
          </Field>
        </div>
      </section>

      <div className="pt-2 border-t border-neutral-100">
        <FormActions 
          onCancel={onCancel} 
          disabled={!valid} 
          loading={loading} 
          submitLabel={initial ? "Simpan Perubahan" : "Tambah Produk Baru"} 
        />
      </div>
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
