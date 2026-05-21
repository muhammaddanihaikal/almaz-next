"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertCircle, Clock, Search, CheckCircle, ChevronDown } from "lucide-react"
import { fmtIDR, fmtTanggal, defaultDateRange } from "@/lib/utils"
import { settleTitipJual, partialSettleTitipJual, editSettlement, revertSettlement, editTitipJualDetail, deleteTitipJual, getTitipJualListByDateRange } from "@/actions/titip_jual"
import { Card, PageHeader, SelectInput, Field, FormActions, inputCls, useConfirm, useConfirmWithReason, DateFilter, Button, IconButton } from "@/components/ui"
import DataTable from "@/components/DataTable"
import Modal from "@/components/Modal"
import SettlementForm from "@/components/SettlementForm"
import RokokItemsTooltip from "@/components/RokokItemsTooltip"

const PAGE_SIZE = 10

const KATEGORI_COLOR = {
  grosir: "bg-violet-100 text-violet-700",
  toko:   "bg-blue-100 text-blue-700",
}

const STATUS_COLOR = {
  aktif:   "bg-yellow-100 text-yellow-700",
  selesai: "bg-green-100 text-green-700",
}

function Badge({ label, colorClass }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colorClass}`}>
      {label}
    </span>
  )
}

function TabButton({ active, onClick, children }) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      className={`px-5 py-2.5 h-auto rounded-none text-sm font-medium border-b-2 transition-colors ${
        active
          ? "border-neutral-900 text-neutral-900 bg-transparent"
          : "border-transparent text-neutral-500 hover:text-neutral-700 bg-transparent"
      }`}
    >
      {children}
    </Button>
  )
}

function SkeletonText({ w = "w-24" }) {
  return <div className={`h-3.5 ${w} animate-pulse rounded bg-neutral-200`} />
}

export default function KonsinyasiPage({ role, titipJualList, salesList }) {
  const router = useRouter()
  const [localList, setLocalList] = useState(titipJualList)
  const [activeTab,    setActiveTab]    = useState("aktif")
  const [search,       setSearch]       = useState("")
  const [salesFilter,  setSalesFilter]  = useState("")
  const [statusAktifFilter, setStatusAktifFilter] = useState("")
  const [dateRange, setDateRange] = useState(defaultDateRange("minggu_ini"))
  const [expandedHariIni, setExpandedHariIni] = useState(false)
  const [expandedSegera,  setExpandedSegera]  = useState(false)
  const [showAllHariIni,  setShowAllHariIni]  = useState(false)
  const [showAllSegera,   setShowAllSegera]   = useState(false)
  const { confirm, ConfirmModal }                     = useConfirm()
  const { confirmWithReason, ConfirmWithReasonModal } = useConfirmWithReason()
  const [settling,          setSettling]          = useState(null)
  const [editingSettlement, setEditingSettlement] = useState(null)
  const [editingDetail,     setEditingDetail]     = useState(null)
  const [detail,            setDetail]            = useState(null)
  const [isFetchingRange,   setIsFetchingRange]   = useState(false)

  useEffect(() => { setLocalList(titipJualList) }, [titipJualList])

  // Fetch ulang dari server ketika filter tanggal berubah,
  // agar data historical (selesai > 30 hari lalu) ikut masuk.
  useEffect(() => {
    if (!dateRange?.start || !dateRange?.end) return
    setIsFetchingRange(true)
    getTitipJualListByDateRange(dateRange.start, dateRange.end)
      .then((fresh) => {
        setLocalList((prev) => {
          // Pertahankan data di luar range (aktif + selesai di luar filter)
          const freshIds = new Set(fresh.map((r) => r.id))
          const outside = prev.filter((r) => !freshIds.has(r.id) && r.status === "aktif")
          return [...outside, ...fresh].sort((a, b) =>
            a.tanggal_jatuh_tempo.localeCompare(b.tanggal_jatuh_tempo)
          )
        })
      })
      .catch((err) => console.error("[KonsinyasiPage] fetch range error", err))
      .finally(() => setIsFetchingRange(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange?.start, dateRange?.end])

  const upsertLocal = (record) => {
    if (!record?.id) return
    setLocalList((prev) =>
      prev.some((r) => r.id === record.id)
        ? prev.map((r) => r.id === record.id ? record : r)
        : [record, ...prev]
    )
  }
  const removeLocal = (id) => setLocalList((prev) => prev.filter((r) => r.id !== id))

  const konsinyasiList = localList

  const jatuhTempoHariIni = konsinyasiList.filter((k) => k.status === "aktif" && !k._pending && k.selisihHari <= 0)
  const jatuhTempoSegera  = konsinyasiList.filter((k) => k.status === "aktif" && !k._pending && k.selisihHari > 0 && k.selisihHari <= 3)

  const visibleHariIni = showAllHariIni ? jatuhTempoHariIni : jatuhTempoHariIni.slice(0, 5)
  const visibleSegera  = showAllSegera ? jatuhTempoSegera : jatuhTempoSegera.slice(0, 5)

  const { rows, countAktif, countSelesai } = useMemo(() => {
    const listAktif   = konsinyasiList.filter(r => r.status === "aktif")
    const listSelesai = konsinyasiList.filter(r => r.status === "selesai")

    // Apply filters to Aktif
    let filteredAktif = [...listAktif]
    if (statusAktifFilter) {
      if (statusAktifFilter === "terlewat") filteredAktif = filteredAktif.filter(r => r.selisihHari < 0)
      else if (statusAktifFilter === "hari_ini") filteredAktif = filteredAktif.filter(r => r.selisihHari === 0)
      else if (statusAktifFilter === "segera") filteredAktif = filteredAktif.filter(r => r.selisihHari > 0 && r.selisihHari <= 3)
      else if (statusAktifFilter === "aman") filteredAktif = filteredAktif.filter(r => r.selisihHari > 3)
    }

    // Apply filters to Selesai (always respect date)
    let filteredSelesai = [...listSelesai]
    if (dateRange?.start && dateRange?.end) {
      filteredSelesai = filteredSelesai.filter((r) => {
        const tgl = r.tanggal_selesai || r.tanggal_jatuh_tempo
        return tgl >= dateRange.start && tgl <= dateRange.end
      })
    }

    // Common filters (sales & search)
    const applyCommonFilters = (items) => {
      let temp = [...items]
      if (salesFilter) temp = temp.filter((r) => r.sales_id === salesFilter)
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        temp = temp.filter(
          (r) => r.sales.toLowerCase().includes(q) || r.nama_toko.toLowerCase().includes(q)
        )
      }
      return temp
    }

    const finalAktif   = applyCommonFilters(filteredAktif)
    const finalSelesai = applyCommonFilters(filteredSelesai)

    return {
      rows: activeTab === "aktif" ? finalAktif : finalSelesai,
      countAktif: finalAktif.length,
      countSelesai: finalSelesai.length
    }
  }, [konsinyasiList, activeTab, salesFilter, search, statusAktifFilter, dateRange])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Titip Jual"
        subtitle="Daftar semua transaksi titip jual sales."
      />

      {jatuhTempoHariIni.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-white overflow-hidden shadow-sm">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setExpandedHariIni(!expandedHariIni)}
            className="w-full h-auto flex items-center justify-between px-3 py-2 hover:bg-red-50/50 transition-colors rounded-none"
          >
            <div className="flex items-center gap-2.5">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <span className="text-sm font-semibold text-neutral-900">Jatuh Tempo Hari Ini</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">{jatuhTempoHariIni.length}</span>
              <ChevronDown className={`h-4 w-4 text-neutral-400 transition-transform ${expandedHariIni ? "rotate-180" : ""}`} />
            </div>
          </Button>

          {expandedHariIni && (
            <div className="border-t border-red-100 p-3 bg-red-50/30">
              <div className="space-y-1.5">
                {visibleHariIni.map((k) => (
                  <div key={k.id} className="flex items-center justify-between text-[11px] text-red-700">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">{k.sales} → {k.nama_toko} ({k.kategori})</span>
                      <span className="text-[10px] text-red-500 font-semibold">Jatuh Tempo: {fmtTanggal(k.tanggal_jatuh_tempo)}</span>
                    </div>
                    <span className="tabular-nums font-bold">{fmtIDR(k.nilaiTotal)}</span>
                  </div>
                ))}
              </div>

              {jatuhTempoHariIni.length > 5 && (
                <div className="mt-3 border-t border-red-100/50 pt-2 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setShowAllHariIni(!showAllHariIni)}
                    className="text-[11px] font-bold text-red-600 hover:text-red-800 transition-colors flex items-center gap-1 focus:outline-none"
                  >
                    {showAllHariIni ? (
                      <span>− Sembunyikan sebagian</span>
                    ) : (
                      <span>+ Tampilkan {jatuhTempoHariIni.length - 5} data lainnya</span>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {jatuhTempoSegera.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-white overflow-hidden shadow-sm">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setExpandedSegera(!expandedSegera)}
            className="w-full h-auto flex items-center justify-between px-3 py-2 hover:bg-amber-50/50 transition-colors rounded-none"
          >
            <div className="flex items-center gap-2.5">
              <Clock className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-semibold text-neutral-900">Jatuh Tempo Segera (3 Hari)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-600 px-1.5 text-[10px] font-bold text-white">{jatuhTempoSegera.length}</span>
              <ChevronDown className={`h-4 w-4 text-neutral-400 transition-transform ${expandedSegera ? "rotate-180" : ""}`} />
            </div>
          </Button>

          {expandedSegera && (
            <div className="border-t border-amber-100 p-3 bg-amber-50/30">
              <div className="space-y-1.5">
                {visibleSegera.map((k) => (
                  <div key={k.id} className="flex items-center justify-between text-[11px] text-amber-800">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">{k.sales} → {k.nama_toko} ({k.kategori}) — {k.selisihHari} hari lagi</span>
                      <span className="text-[10px] text-amber-600 font-semibold">Jatuh Tempo: {fmtTanggal(k.tanggal_jatuh_tempo)}</span>
                    </div>
                    <span className="tabular-nums font-bold">{fmtIDR(k.nilaiTotal)}</span>
                  </div>
                ))}
              </div>

              {jatuhTempoSegera.length > 5 && (
                <div className="mt-3 border-t border-amber-100/50 pt-2 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setShowAllSegera(!showAllSegera)}
                    className="text-[11px] font-bold text-amber-600 hover:text-amber-800 transition-colors flex items-center gap-1 focus:outline-none"
                  >
                    {showAllSegera ? (
                      <span>− Sembunyikan sebagian</span>
                    ) : (
                      <span>+ Tampilkan {jatuhTempoSegera.length - 5} data lainnya</span>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:gap-4">
          <Field label="Jatuh Tempo" className="flex-1">
            <div className="w-full">
              <DateFilter value={dateRange} onChange={setDateRange} />
            </div>
          </Field>

          <Field label="Sales" className="flex-1">
            <SelectInput value={salesFilter} onChange={(e) => setSalesFilter(e.target.value)}>
              <option value="">Semua Sales</option>
              {salesList.map((s) => (
                <option key={s.id} value={s.id}>{s.nama}</option>
              ))}
            </SelectInput>
          </Field>

          {activeTab === "aktif" && (
            <Field label="Status" className="flex-1">
              <SelectInput value={statusAktifFilter} onChange={(e) => setStatusAktifFilter(e.target.value)}>
                <option value="">Semua Status Aktif</option>
                <option value="terlewat">Terlewat</option>
                <option value="hari_ini">Hari Ini</option>
                <option value="segera">Segera (1-3 Hari)</option>
                <option value="aman">Aman (&gt;3 Hari)</option>
              </SelectInput>
            </Field>
          )}
        </div>

        <Field label="Cari" className="w-full">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari sales atau toko..."
              className={inputCls + " pl-9 w-full"}
            />
          </div>
        </Field>
      </div>

      <Card>

        {/* Tabs */}
        <div className="flex border-b border-neutral-200">
          <button
            onClick={() => setActiveTab("aktif")}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${
              activeTab === "aktif"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-neutral-500 hover:text-neutral-700"
            }`}
          >
            Aktif
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-yellow-500 px-1.5 text-xs font-semibold text-white">
              {countAktif}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("selesai")}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${
              activeTab === "selesai"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-neutral-500 hover:text-neutral-700"
            }`}
          >
            Selesai
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-green-600 px-1.5 text-xs font-semibold text-white">
              {countSelesai}
            </span>
          </button>
        </div>

        {isFetchingRange ? (
          <div className="flex items-center justify-center gap-3 py-16 text-neutral-400">
            <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            <span className="text-sm">Memuat data...</span>
          </div>
        ) : (
        <DataTable
          key={`${activeTab}-${salesFilter}-${search}-${statusAktifFilter}-${dateRange?.start}-${dateRange?.end}`}
          pageSize={PAGE_SIZE}
          rows={rows}
          empty={`Tidak ada titip jual ${activeTab}.`}
          columns={[
            { key: "no",              label: "No",              render: (_, idx) => idx + 1 },
            { key: "tgl_distribusi",  label: "Tgl Distribusi",  render: (r) => r._pending ? <SkeletonText w="w-20" /> : r.tanggal_distribusi ? fmtTanggal(r.tanggal_distribusi) : <span className="text-neutral-300">—</span> },
            { key: "jatuh_tempo", label: "Jatuh Tempo", render: (r) => r._pending ? <SkeletonText w="w-20" /> : (
              <span className={r.status === "aktif" && r.selisihHari <= 0 ? "text-red-600 font-semibold" : r.status === "aktif" && r.selisihHari <= 3 ? "text-amber-600 font-semibold" : ""}>
                {fmtTanggal(r.tanggal_jatuh_tempo)}
              </span>
            )},
            { key: "sales",      label: "Sales",        render: (r) => r._pending ? <SkeletonText w="w-16" /> : r.sales },
            { key: "nama_toko",  label: "Toko",         render: (r) => r._pending ? <SkeletonText w="w-16" /> : r.nama_toko },
            { key: "kategori",   label: "Kategori",     render: (r) => r._pending ? <SkeletonText w="w-12" /> : <Badge label={r.kategori} colorClass={KATEGORI_COLOR[r.kategori] || "bg-neutral-100 text-neutral-600"} /> },
            {
              key: "items", label: "Rokok",
              render: (r) => r._pending ? <SkeletonText w="w-28" /> : <RokokItemsTooltip items={r.items.map(it => ({ ...it, qty: it.qty_keluar }))} />,
            },
            { key: "nilai", label: "Nilai", align: "right", render: (r) => r._pending ? <SkeletonText w="w-16" /> : fmtIDR(r.nilaiTotal) },
            ...(activeTab === "selesai" ? [{ key: "tgl_selesai", label: "Tgl Selesai", render: (r) => r._pending ? <SkeletonText w="w-20" /> : r.tanggal_selesai ? <span className="text-green-700 font-medium">{fmtTanggal(r.tanggal_selesai)}</span> : <span className="text-neutral-300">—</span> }] : []),
            {
              key: "flag", label: "",
              render: (r) => r._pending ? null : r.flagSetoran ? (
                <span className="flex items-center gap-1 text-xs text-red-600 whitespace-nowrap">
                  <AlertCircle className="h-3 w-3" /> Selisih setoran
                </span>
              ) : r.status === "selesai" ? (
                <span className="flex items-center gap-1 text-xs text-green-600 whitespace-nowrap">
                  <CheckCircle className="h-3 w-3" /> Lunas
                </span>
              ) : null,
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
                  <div className="flex items-center justify-end gap-1.5">
                    {r.status === "aktif" && (
                      <>
                        {role !== "staff" && (
                          <Button size="sm" variant="ghost" onClick={() => setSettling(r)} className="border border-green-200 bg-green-50 text-green-700 hover:bg-green-100">
                            Selesaikan
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => setDetail(r)} className="border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100">
                          Detail
                        </Button>
                        {role !== "staff" && (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => setEditingDetail(r)} className="border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100">
                              Edit
                            </Button>
                            <Button
                              size="sm" variant="ghost"
                              className="border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                              onClick={async () => {
                                const alasan = await confirmWithReason(`Hapus titip jual "${r.nama_toko}"? Stok akan dikembalikan.`, { title: "Hapus Titip Jual", variant: "danger", confirmLabel: "Ya, Hapus" })
                                if (!alasan) return
                                removeLocal(r.id)
                                deleteTitipJual(r.id, alasan)
                                  .catch(async (error) => {
                                    upsertLocal(r)
                                    await confirm(error?.message || "Gagal menghapus titip jual.", { title: "Gagal Hapus", hideCancel: true })
                                  })
                              }}
                            >
                              Hapus
                            </Button>
                          </>
                        )}
                      </>
                    )}
                    {r.status === "selesai" && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => setDetail(r)} className="border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100">
                          Detail
                        </Button>
                        {role !== "staff" && (
                          <>
                            <Button
                              size="sm" variant="ghost"
                              className="border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                              onClick={async () => {
                                const alasan = await confirmWithReason(`Batalkan penyelesaian titip jual "${r.nama_toko}"? Status akan kembali ke Aktif.`, { title: "Batalkan Penyelesaian", variant: "danger", confirmLabel: "Ya, Batalkan" })
                                if (!alasan) return
                                upsertLocal({ ...r, _pending: true })
                                revertSettlement(r.id, alasan)
                                  .then(() => router.refresh())
                                  .catch(async (error) => {
                                    upsertLocal({ ...r, _pending: false })
                                    await confirm(error?.message || "Gagal membatalkan penyelesaian.", { title: "Gagal Batalkan", hideCancel: true })
                                  })
                              }}
                            >
                              Batalkan
                            </Button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                )
              },
            },
          ]}
        />
        )}
      </Card>

      {/* Detail Modal */}
      {detail && (
        <Modal title={`Detail Titip Jual — ${detail.nama_toko}`} onClose={() => setDetail(null)} width="max-w-2xl">
          <KonsinyasiDetail record={detail} />
        </Modal>
      )}

      {/* Settlement Modal */}
      {settling && (
        <Modal title={`Selesaikan Titip Jual — ${settling.nama_toko}`} onClose={() => setSettling(null)} width="max-w-2xl">
          <SettlementForm
            konsinyasi={settling}
            onSubmit={async (data) => {
              const captured = settling
              upsertLocal({ ...captured, _pending: true })
              setSettling(null)
              const hasPerpanjang = data.items.some((it) => it.action === "perpanjang")
              const action = hasPerpanjang ? partialSettleTitipJual : settleTitipJual
              action(captured.id, data)
                .then(() => router.refresh())
                .catch(async (error) => {
                  upsertLocal({ ...captured, _pending: false })
                  await confirm(error?.message || "Gagal menyelesaikan titip jual.", { title: "Gagal Selesaikan", hideCancel: true })
                })
            }}
            onCancel={() => setSettling(null)}
          />
        </Modal>
      )}

      {/* Edit Detail Modal (untuk aktif) */}
      {editingDetail && (
        <Modal title={`Edit Titip Jual — ${editingDetail.nama_toko}`} onClose={() => setEditingDetail(null)} width="max-w-md">
          <KonsinyasiDetailForm
            record={editingDetail}
            onSubmit={async (data) => {
              const captured = editingDetail
              setEditingDetail(null)
              const alasan = await confirmWithReason(`Edit detail titip jual "${captured.nama_toko}"?`, { title: "Edit Titip Jual", confirmLabel: "Ya, Simpan" })
              if (!alasan) return
              upsertLocal({ ...captured, _pending: true })
              editTitipJualDetail(captured.id, data, alasan)
                .then(() => router.refresh())
                .catch(async (error) => {
                  upsertLocal({ ...captured, _pending: false })
                  await confirm(error?.message || "Gagal mengedit titip jual.", { title: "Gagal Edit", hideCancel: true })
                })
            }}
            onCancel={() => setEditingDetail(null)}
          />
        </Modal>
      )}

      {/* Edit Settlement Modal */}
      {editingSettlement && (
        <Modal title={`Edit Penyelesaian — ${editingSettlement.nama_toko}`} onClose={() => setEditingSettlement(null)} width="max-w-2xl">
          <SettlementForm
            konsinyasi={editingSettlement}
            initialSetoran={editingSettlement.setoran}
            onSubmit={async (data) => {
              const captured = editingSettlement
              setEditingSettlement(null)
              const alasan = await confirmWithReason(`Edit penyelesaian titip jual "${captured.nama_toko}"?`, { title: "Edit Penyelesaian", confirmLabel: "Ya, Simpan" })
              if (!alasan) return
              upsertLocal({ ...captured, _pending: true })
              editSettlement(captured.id, data, alasan)
                .then(() => router.refresh())
                .catch(async (error) => {
                  upsertLocal({ ...captured, _pending: false })
                  await confirm(error?.message || "Gagal mengedit penyelesaian.", { title: "Gagal Edit", hideCancel: true })
                })
            }}
            onCancel={() => setEditingSettlement(null)}
          />
        </Modal>
      )}
      {ConfirmModal}
      {ConfirmWithReasonModal}
    </div>
  )
}

// ─── Edit Detail Form ─────────────────────────────────────────────────────────

function KonsinyasiDetailForm({ record, onSubmit, onCancel }) {
  const [tanggalJatuhTempo, setTanggalJatuhTempo] = useState(record.tanggal_jatuh_tempo)
  const [catatan,            setCatatan]           = useState(record.catatan || "")
  const [loading,            setLoading]           = useState(false)

  const valid = !!tanggalJatuhTempo

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!valid) return
    setLoading(true)
    try { await onSubmit({ tanggal_jatuh_tempo: tanggalJatuhTempo, catatan }) }
    finally { setLoading(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-sm">
      <div className="grid grid-cols-2 gap-3 text-xs pb-2 border-b border-neutral-100">
        <div><p className="text-neutral-500">Sales</p><p className="font-medium">{record.sales}</p></div>
        <div><p className="text-neutral-500">Toko</p><p className="font-medium">{record.nama_toko}</p></div>
        <div><p className="text-neutral-500">Kategori</p><p className="font-medium capitalize">{record.kategori}</p></div>
      </div>
      <Field label="Jatuh Tempo">
        <input type="date" value={tanggalJatuhTempo} onChange={(e) => setTanggalJatuhTempo(e.target.value)} className={inputCls} required />
      </Field>
      <Field label="Catatan (opsional)">
        <input type="text" value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="Opsional" className={inputCls} />
      </Field>
      <FormActions onCancel={onCancel} disabled={!valid || loading} loading={loading} submitLabel="Simpan Perubahan" />
    </form>
  )
}

// ─── Detail ───────────────────────────────────────────────────────────────────

function KonsinyasiDetail({ record }) {
  return (
    <div className="space-y-6 text-sm">
      {/* SECTION 1: Informasi Transaksi */}
      <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-4 space-y-4">
        <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">Informasi Transaksi</h3>
          <div className="flex gap-2">
            <Badge label={record.kategori} colorClass={KATEGORI_COLOR[record.kategori] || "bg-neutral-100 text-neutral-600"} />
            <Badge label={record.status === "selesai" ? "Selesai" : "Aktif"} colorClass={STATUS_COLOR[record.status]} />
          </div>
        </div>
        
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="space-y-1">
            <p className="text-[10px] uppercase font-bold text-neutral-400">Sales</p>
            <p className="font-semibold text-neutral-900">{record.sales}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] uppercase font-bold text-neutral-400">Toko / Customer</p>
            <p className="font-semibold text-neutral-900">{record.nama_toko}</p>
          </div>
          {record.tanggal_distribusi && (
            <div className="space-y-1">
              <p className="text-[10px] uppercase font-bold text-neutral-400">Tgl Distribusi</p>
              <p className="font-semibold text-neutral-900">{fmtTanggal(record.tanggal_distribusi)}</p>
            </div>
          )}
          <div className="space-y-1">
            <p className="text-[10px] uppercase font-bold text-neutral-400">Jatuh Tempo</p>
            <p className={`font-semibold ${record.status === "aktif" && record.selisihHari <= 0 ? "text-red-600" : "text-neutral-900"}`}>
              {fmtTanggal(record.tanggal_jatuh_tempo)}
            </p>
          </div>
          {record.tanggal_selesai && (
            <div className="space-y-1">
              <p className="text-[10px] uppercase font-bold text-neutral-400">Tgl Selesai</p>
              <p className="font-semibold text-green-700">{fmtTanggal(record.tanggal_selesai)}</p>
            </div>
          )}
        </div>

        {record.catatan && (
          <div className="mt-2 pt-3 border-t border-dashed border-neutral-200">
            <p className="text-[10px] uppercase font-bold text-neutral-400 mb-1">Catatan Admin</p>
            <div className="bg-amber-50/50 border border-amber-100 rounded-lg p-2.5 text-xs text-amber-900 italic leading-relaxed">
              "{record.catatan}"
            </div>
          </div>
        )}
      </div>

      {/* SECTION 2: Detail Barang */}
      <div className="rounded-xl border border-neutral-200 bg-white p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">Detail Barang Penjualan</h3>
          <span className="text-xs text-neutral-400 font-medium">{record.items.length} jenis rokok</span>
        </div>

        <div className="overflow-hidden rounded-lg border border-neutral-100">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-neutral-50 text-neutral-500 border-b border-neutral-100">
                <th className="px-3 py-2 text-left font-semibold">Rokok</th>
                <th className="px-3 py-2 text-center font-semibold">Keluar</th>
                <th className="px-3 py-2 text-center font-semibold">Terjual</th>
                <th className="px-3 py-2 text-center font-semibold">Kembali</th>
                <th className="px-3 py-2 text-right font-semibold">Harga</th>
                <th className="px-3 py-2 text-right font-semibold">Nilai</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {record.items.map((it, i) => (
                <tr key={i} className="hover:bg-neutral-50/50 transition-colors">
                  <td className="px-3 py-2.5 font-medium text-neutral-700">{it.rokok}</td>
                  <td className="px-3 py-2.5 text-center tabular-nums text-neutral-600">{it.qty_keluar}</td>
                  <td className="px-3 py-2.5 text-center tabular-nums font-bold text-neutral-900">{it.qty_terjual}</td>
                  <td className="px-3 py-2.5 text-center tabular-nums text-neutral-400">{it.qty_kembali}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-neutral-500">{fmtIDR(it.harga)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-bold text-neutral-900">{fmtIDR(it.qty_terjual * it.harga)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-neutral-900 text-white font-bold">
                <td colSpan={5} className="px-3 py-2 text-right uppercase tracking-wider text-[10px]">Total Nilai Terjual</td>
                <td className="px-3 py-2 text-right tabular-nums text-sm">{fmtIDR(record.nilaiTerjual)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* SECTION 3: Setoran */}
      {record.setoran.length > 0 && (
        <div className="rounded-xl border border-neutral-200 bg-white p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">Detail Setoran</h3>
          </div>

          <div className="space-y-2">
            {record.setoran.map((it, i) => (
              <div key={i} className="flex items-center justify-between p-2.5 rounded-lg border border-neutral-100 bg-neutral-50/50">
                <div className="flex flex-col">
                  <span className="text-xs font-bold uppercase tracking-wide text-neutral-700 capitalize">{it.metode}</span>
                  <span className="text-[10px] text-neutral-400 font-medium">{fmtTanggal(it.tanggal)}</span>
                </div>
                <span className="font-bold tabular-nums text-neutral-900">{fmtIDR(it.jumlah)}</span>
              </div>
            ))}
          </div>

          <div className={`mt-2 flex items-center justify-between rounded-xl border px-4 py-3 transition-all ${record.flagSetoran ? "border-red-200 bg-red-50 text-red-700" : "border-green-200 bg-green-50 text-green-700"}`}>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] uppercase font-bold opacity-70">Total Setoran Diterima</span>
              <div className="flex items-center gap-1.5 text-sm font-bold">
                {record.flagSetoran ? <AlertCircle className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                {fmtIDR(record.totalSetoran)}
              </div>
            </div>
            {record.flagSetoran && (
              <div className="text-right">
                <p className="text-[10px] uppercase font-bold opacity-70">Selisih Penagihan</p>
                <p className="font-bold text-sm">{fmtIDR(Math.abs(record.nilaiTerjual - record.totalSetoran))}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}


