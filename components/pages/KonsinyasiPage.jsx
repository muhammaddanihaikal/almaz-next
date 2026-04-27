"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertCircle, Clock, Search, CheckCircle, ChevronDown } from "lucide-react"
import { fmtIDR, fmtTanggal } from "@/lib/utils"
import { settleKonsinyasi, editSettlement, revertSettlement, editKonsinyasiDetail, deleteKonsinyasi } from "@/actions/konsinyasi"
import { Card, PageHeader, SelectInput, Field, FormActions, inputCls, useConfirm } from "@/components/ui"
import DataTable from "@/components/DataTable"
import Modal from "@/components/Modal"
import SettlementForm from "@/components/SettlementForm"

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
    <button
      type="button"
      onClick={onClick}
      className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
        active
          ? "border-neutral-900 text-neutral-900"
          : "border-transparent text-neutral-500 hover:text-neutral-700"
      }`}
    >
      {children}
    </button>
  )
}

export default function KonsinyasiPage({ konsinyasiList, salesList }) {
  const router = useRouter()
  const [activeTab,    setActiveTab]    = useState("aktif")
  const [search,       setSearch]       = useState("")
  const [salesFilter,  setSalesFilter]  = useState("")
  const [expandedAlert, setExpandedAlert] = useState(false)
  const { confirm, ConfirmModal } = useConfirm()
  const [settling,          setSettling]          = useState(null)
  const [editingSettlement, setEditingSettlement] = useState(null)
  const [editingDetail,     setEditingDetail]     = useState(null)
  const [detail,            setDetail]            = useState(null)

  const jatuhTempoHariIni = konsinyasiList.filter((k) => k.status === "aktif" && k.selisihHari <= 0)
  const jatuhTempoSegera  = konsinyasiList.filter((k) => k.status === "aktif" && k.selisihHari > 0 && k.selisihHari <= 3)
  const totalJatuhTempo = jatuhTempoHariIni.length + jatuhTempoSegera.length

  const rows = useMemo(() => {
    let filtered = konsinyasiList.filter((r) => r.status === activeTab)
    if (salesFilter) filtered = filtered.filter((r) => r.sales_id === salesFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      filtered = filtered.filter(
        (r) => r.sales.toLowerCase().includes(q) || r.nama_toko.toLowerCase().includes(q)
      )
    }
    return filtered
  }, [konsinyasiList, activeTab, salesFilter, search])

  const countAktif   = konsinyasiList.filter((r) => r.status === "aktif").length
  const countSelesai = konsinyasiList.filter((r) => r.status === "selesai").length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Titip Jual"
        subtitle="Daftar semua transaksi titip jual sales."
      />

      {totalJatuhTempo > 0 && (
        <div className="rounded-xl border border-neutral-200 bg-white">
          <button
            type="button"
            onClick={() => setExpandedAlert(!expandedAlert)}
            className="w-full flex items-center justify-between p-4 hover:bg-neutral-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <span className="font-medium text-neutral-900">Jatuh Tempo Alert</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-red-600 px-2 text-xs font-semibold text-white">{totalJatuhTempo}</span>
              <ChevronDown className={`h-5 w-5 text-neutral-400 transition-transform ${expandedAlert ? "rotate-180" : ""}`} />
            </div>
          </button>

          {expandedAlert && (
            <div className="border-t border-neutral-200 p-4 space-y-3">
              {jatuhTempoHariIni.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-red-700">
                    <AlertCircle className="h-4 w-4" />
                    {jatuhTempoHariIni.length} titip jual sudah jatuh tempo hari ini
                  </div>
                  <div className="space-y-1">
                    {jatuhTempoHariIni.map((k) => (
                      <div key={k.id} className="flex items-center justify-between text-xs text-red-600">
                        <span>{k.sales} → {k.nama_toko} ({k.kategori})</span>
                        <span>{fmtIDR(k.nilaiTotal)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {jatuhTempoSegera.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-amber-700">
                    <Clock className="h-4 w-4" />
                    {jatuhTempoSegera.length} titip jual jatuh tempo dalam 3 hari
                  </div>
                  <div className="space-y-1">
                    {jatuhTempoSegera.map((k) => (
                      <div key={k.id} className="flex items-center justify-between text-xs text-amber-600">
                        <span>{k.sales} → {k.nama_toko} ({k.kategori}) — {k.selisihHari} hari lagi</span>
                        <span>{fmtIDR(k.nilaiTotal)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <Card>
        {/* Tabs */}
        <div className="flex border-b border-neutral-200 -mx-4 -mt-4 px-4 mb-4">
          <TabButton active={activeTab === "aktif"} onClick={() => setActiveTab("aktif")}>
            Aktif <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-yellow-500 px-1 text-xs text-white">{countAktif}</span>
          </TabButton>
          <TabButton active={activeTab === "selesai"} onClick={() => setActiveTab("selesai")}>
            Selesai <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-green-600 px-1 text-xs text-white">{countSelesai}</span>
          </TabButton>
        </div>

        {/* Filter bar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari sales atau toko..."
              className={inputCls + " pl-8 text-sm"}
            />
          </div>
          <div className="w-full sm:w-44">
            <SelectInput value={salesFilter} onChange={(e) => setSalesFilter(e.target.value)}>
              <option value="">Semua Sales</option>
              {salesList.map((s) => (
                <option key={s.id} value={s.id}>{s.nama}</option>
              ))}
            </SelectInput>
          </div>
        </div>

        <DataTable
          key={`${activeTab}-${salesFilter}-${search}`}
          pageSize={PAGE_SIZE}
          rows={rows}
          empty={`Tidak ada titip jual ${activeTab}.`}
          columns={[
            { key: "no",         label: "No",           render: (_, idx) => idx + 1 },
            { key: "jatuh_tempo", label: "Jatuh Tempo", render: (r) => (
              <span className={r.status === "aktif" && r.selisihHari <= 0 ? "text-red-600 font-semibold" : r.status === "aktif" && r.selisihHari <= 3 ? "text-amber-600 font-semibold" : ""}>
                {fmtTanggal(r.tanggal_jatuh_tempo)}
              </span>
            )},
            { key: "sales",      label: "Sales",        render: (r) => r.sales },
            { key: "nama_toko",  label: "Toko",         render: (r) => r.nama_toko },
            { key: "kategori",   label: "Kategori",     render: (r) => <Badge label={r.kategori} colorClass={KATEGORI_COLOR[r.kategori] || "bg-neutral-100 text-neutral-600"} /> },
            {
              key: "items", label: "Rokok",
              render: (r) => (
                <div className="space-y-0.5">
                  {r.items.map((it, i) => (
                    <div key={i} className="text-xs text-neutral-700">{it.rokok} ×{it.qty_keluar}</div>
                  ))}
                </div>
              ),
            },
            { key: "nilai", label: "Nilai", align: "right", render: (r) => fmtIDR(r.nilaiTotal) },
            { key: "tgl_selesai", label: "Tgl Selesai", render: (r) => r.tanggal_selesai ? <span className="text-green-700 font-medium">{fmtTanggal(r.tanggal_selesai)}</span> : <span className="text-neutral-300">—</span> },
            {
              key: "flag", label: "",
              render: (r) => r.flagSetoran ? (
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
              render: (r) => (
                <div className="flex items-center justify-end gap-1.5">
                  {r.status === "aktif" && (
                    <>
                      <button
                        onClick={() => setSettling(r)}
                        className="rounded-md border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 hover:bg-green-100 whitespace-nowrap"
                      >
                        Selesaikan
                      </button>
                      <button
                        onClick={() => setEditingDetail(r)}
                        className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 whitespace-nowrap"
                      >
                        Edit
                      </button>
                      <button
                        onClick={async () => {
                          const ok = await confirm(`Hapus titip jual "${r.nama_toko}"? Stok akan dikembalikan.`, { title: "Hapus Titip Jual", variant: "danger", confirmLabel: "Ya, Hapus" })
                          if (!ok) return
                          await deleteKonsinyasi(r.id)
                          router.refresh()
                        }}
                        className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100 whitespace-nowrap"
                      >
                        Hapus
                      </button>
                    </>
                  )}
                  {r.status === "selesai" && (
                    <>
                      <button
                        onClick={() => setEditingSettlement(r)}
                        className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 whitespace-nowrap"
                      >
                        Edit
                      </button>
                      <button
                        onClick={async () => {
                          const ok = await confirm(`Batalkan penyelesaian titip jual "${r.nama_toko}"? Status akan kembali ke Aktif.`, { title: "Batalkan Penyelesaian", variant: "danger", confirmLabel: "Ya, Batalkan" })
                          if (!ok) return
                          await revertSettlement(r.id)
                          router.refresh()
                        }}
                        className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100 whitespace-nowrap"
                      >
                        Batalkan
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setDetail(r)}
                    className="rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                  >
                    Detail
                  </button>
                </div>
              ),
            },
          ]}
        />
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
              await settleKonsinyasi(settling.id, data)
              setSettling(null)
              router.refresh()
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
              await editKonsinyasiDetail(editingDetail.id, data)
              setEditingDetail(null)
              router.refresh()
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
              await editSettlement(editingSettlement.id, data)
              setEditingSettlement(null)
              router.refresh()
            }}
            onCancel={() => setEditingSettlement(null)}
          />
        </Modal>
      )}
      {ConfirmModal}
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
      <FormActions onCancel={onCancel} disabled={!valid || loading} submitLabel={loading ? "Menyimpan..." : "Simpan Perubahan"} />
    </form>
  )
}

// ─── Detail ───────────────────────────────────────────────────────────────────

function KonsinyasiDetail({ record }) {
  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-2 gap-3">
        <div><p className="text-xs text-neutral-500">Sales</p><p className="font-medium">{record.sales}</p></div>
        <div><p className="text-xs text-neutral-500">Toko</p><p className="font-medium">{record.nama_toko}</p></div>
        <div><p className="text-xs text-neutral-500">Kategori</p><Badge label={record.kategori} colorClass={KATEGORI_COLOR[record.kategori] || "bg-neutral-100 text-neutral-600"} /></div>
        <div><p className="text-xs text-neutral-500">Status</p><Badge label={record.status === "selesai" ? "Selesai" : "Aktif"} colorClass={STATUS_COLOR[record.status]} /></div>
        <div><p className="text-xs text-neutral-500">Jatuh Tempo</p><p className={`font-medium ${record.status === "aktif" && record.selisihHari <= 0 ? "text-red-600" : ""}`}>{fmtTanggal(record.tanggal_jatuh_tempo)}</p></div>
        {record.tanggal_selesai && <div><p className="text-xs text-neutral-500">Tgl Selesai</p><p className="font-medium text-green-700">{fmtTanggal(record.tanggal_selesai)}</p></div>}
        {record.catatan && <div><p className="text-xs text-neutral-500">Catatan</p><p>{record.catatan}</p></div>}
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">Detail Barang</p>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-neutral-200 text-neutral-500">
              <th className="pb-1.5 text-left">Rokok</th>
              <th className="pb-1.5 text-right">Keluar</th>
              <th className="pb-1.5 text-right">Terjual</th>
              <th className="pb-1.5 text-right">Kembali</th>
              <th className="pb-1.5 text-right">Harga</th>
              <th className="pb-1.5 text-right">Nilai Terjual</th>
            </tr>
          </thead>
          <tbody>
            {record.items.map((it, i) => (
              <tr key={i} className="border-b border-neutral-100">
                <td className="py-1.5">{it.rokok}</td>
                <td className="py-1.5 text-right tabular-nums">{it.qty_keluar}</td>
                <td className="py-1.5 text-right tabular-nums">{it.qty_terjual}</td>
                <td className="py-1.5 text-right tabular-nums">{it.qty_kembali}</td>
                <td className="py-1.5 text-right tabular-nums">{fmtIDR(it.harga)}</td>
                <td className="py-1.5 text-right tabular-nums">{fmtIDR(it.qty_terjual * it.harga)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-neutral-200 font-semibold">
              <td colSpan={5} className="py-1.5">Total Nilai Terjual</td>
              <td className="py-1.5 text-right tabular-nums">{fmtIDR(record.nilaiTerjual)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {record.setoran.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">Setoran</p>
          <div className="space-y-1">
            {record.setoran.map((it, i) => (
              <div key={i} className="flex justify-between text-xs">
                <span className="capitalize font-medium">{it.metode} — {fmtTanggal(it.tanggal)}</span>
                <span className="tabular-nums">{fmtIDR(it.jumlah)}</span>
              </div>
            ))}
            <div className="flex justify-between text-xs font-semibold border-t border-neutral-200 pt-1">
              <span>Total Setoran</span>
              <span className={`tabular-nums ${record.flagSetoran ? "text-red-600" : "text-green-700"}`}>{fmtIDR(record.totalSetoran)}</span>
            </div>
            {record.flagSetoran && (
              <div className="flex items-center gap-1 text-xs text-red-600 mt-1">
                <AlertCircle className="h-3 w-3" /> Selisih: {fmtIDR(Math.abs(record.nilaiTerjual - record.totalSetoran))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}


