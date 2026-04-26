"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertCircle, Clock, Search, CheckCircle, Trash2 } from "lucide-react"
import { fmtIDR, fmtTanggal } from "@/lib/utils"
import { settleKonsinyasi } from "@/actions/konsinyasi"
import { Card, PageHeader, SelectInput, inputCls, IconButton, Field, FormActions } from "@/components/ui"
import DataTable from "@/components/DataTable"
import Modal from "@/components/Modal"

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
  const [settling,     setSettling]     = useState(null)
  const [detail,       setDetail]       = useState(null)

  const jatuhTempoHariIni = konsinyasiList.filter((k) => k.status === "aktif" && k.selisihHari <= 0)
  const jatuhTempoSegera  = konsinyasiList.filter((k) => k.status === "aktif" && k.selisihHari > 0 && k.selisihHari <= 3)

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

      {jatuhTempoHariIni.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-2">
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
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
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
                    <button
                      onClick={() => setSettling(r)}
                      className="rounded-md border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 hover:bg-green-100 whitespace-nowrap"
                    >
                      Selesaikan
                    </button>
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
    </div>
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

// ─── Settlement Form ──────────────────────────────────────────────────────────

function SettlementForm({ konsinyasi, onSubmit, onCancel }) {
  const today = new Date().toISOString().split("T")[0]
  const [items,   setItems]   = useState(
    konsinyasi.items.map((it) => ({
      ...it,
      qty_terjual: String(it.qty_terjual || ""),
      qty_kembali: String(it.qty_kembali || ""),
    }))
  )
  const [setoran, setSetoran] = useState([{ metode: "cash", jumlah: "" }])
  const [loading, setLoading] = useState(false)

  const updateItem = (idx, field, val) =>
    setItems(items.map((it, i) => {
      if (i !== idx) return it
      const updated = { ...it, [field]: val }
      if (field === "qty_terjual") {
        const terjual = Number(val) || 0
        updated.qty_kembali = String(Math.max(0, it.qty_keluar - terjual))
      }
      return updated
    }))

  const nilaiTerjual = items.reduce((s, it) => s + (Number(it.qty_terjual) || 0) * it.harga, 0)
  const totalSetoran = setoran.reduce((s, it) => s + (Number(it.jumlah) || 0), 0)
  const flagSelisih  = nilaiTerjual > 0 && totalSetoran !== nilaiTerjual

  const hasError = items.some((it) => (Number(it.qty_terjual) || 0) > it.qty_keluar)

  const handleSubmit = async () => {
    if (hasError) return
    setLoading(true)
    try {
      await onSubmit({
        tanggal: today,
        items: items.map((it) => ({
          id:          it.id,
          rokok_id:    it.rokok_id,
          qty_terjual: Number(it.qty_terjual) || 0,
          qty_kembali: Number(it.qty_kembali) || 0,
        })),
        setoran: setoran.map((s) => ({ metode: s.metode, jumlah: Number(s.jumlah) || 0 })),
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-5 text-sm">
      {/* Info toko */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div><p className="text-neutral-500">Sales</p><p className="font-medium">{konsinyasi.sales}</p></div>
        <div><p className="text-neutral-500">Toko</p><p className="font-medium">{konsinyasi.nama_toko}</p></div>
        <div><p className="text-neutral-500">Jatuh Tempo</p><p className={`font-medium ${konsinyasi.selisihHari <= 0 ? "text-red-600" : ""}`}>{fmtTanggal(konsinyasi.tanggal_jatuh_tempo)}</p></div>
        <div><p className="text-neutral-500">Kategori</p><Badge label={konsinyasi.kategori} colorClass={KATEGORI_COLOR[konsinyasi.kategori] || "bg-neutral-100 text-neutral-600"} /></div>
      </div>

      {/* Tabel barang */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">Barang</p>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-neutral-200 text-neutral-500">
              <th className="pb-1.5 text-left">Rokok</th>
              <th className="pb-1.5 text-right">Keluar</th>
              <th className="pb-1.5 text-right">Harga</th>
              <th className="pb-1.5 text-right">Terjual</th>
              <th className="pb-1.5 text-right">Kembali</th>
              <th className="pb-1.5 text-right">Nilai</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => {
              const terjual = Number(it.qty_terjual) || 0
              const kembali = Number(it.qty_kembali) || 0
              const overflow = terjual + kembali > it.qty_keluar
              return (
                <tr key={idx} className="border-b border-neutral-100">
                  <td className="py-2">{it.rokok}</td>
                  <td className="py-2 text-right tabular-nums">{it.qty_keluar}</td>
                  <td className="py-2 text-right tabular-nums">{fmtIDR(it.harga)}</td>
                  <td className="py-2 text-right">
                    <input
                      type="number" min="0" max={it.qty_keluar}
                      value={it.qty_terjual}
                      onChange={(e) => updateItem(idx, "qty_terjual", e.target.value)}
                      className={inputCls + " w-20 text-right" + (overflow ? " border-red-400" : "")}
                      placeholder="0"
                    />
                  </td>
                  <td className="py-2 text-right tabular-nums text-neutral-600">
                    {Math.max(0, it.qty_keluar - (Number(it.qty_terjual) || 0))}
                  </td>
                  <td className="py-2 text-right tabular-nums font-medium">{fmtIDR(terjual * it.harga)}</td>
                </tr>
              )
            })}
            <tr className="border-t-2 border-neutral-200 font-semibold text-xs">
              <td colSpan={5} className="py-1.5">Total Nilai Terjual</td>
              <td className="py-1.5 text-right tabular-nums">{fmtIDR(nilaiTerjual)}</td>
            </tr>
          </tbody>
        </table>
        {hasError && (
          <div className="mt-2 flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            Jumlah terjual tidak boleh melebihi jumlah keluar
          </div>
        )}
      </div>

      {/* Setoran */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">Setoran</p>
        <div className="space-y-2">
          {setoran.map((st, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <div className="w-32">
                <SelectInput value={st.metode} onChange={(e) => setSetoran(setoran.map((s, i) => i === idx ? { ...s, metode: e.target.value } : s))}>
                  <option value="cash">Cash</option>
                  <option value="transfer">Transfer</option>
                </SelectInput>
              </div>
              <input
                type="number" min="0"
                value={st.jumlah}
                onChange={(e) => setSetoran(setoran.map((s, i) => i === idx ? { ...s, jumlah: e.target.value } : s))}
                placeholder="0"
                className={inputCls + " flex-1"}
              />
              {setoran.length > 1 && (
                <IconButton icon={Trash2} onClick={() => setSetoran(setoran.filter((_, i) => i !== idx))} variant="danger" label="Hapus" />
              )}
            </div>
          ))}
          {setoran.length < 2 && (
            <button type="button" onClick={() => setSetoran([...setoran, { metode: "transfer", jumlah: "" }])} className="text-xs text-blue-600 hover:underline">
              + Tambah metode setoran
            </button>
          )}
        </div>

        {/* Validasi setoran */}
        {totalSetoran > 0 && (
          <div className={`mt-3 flex items-center justify-between rounded-lg border px-3 py-2 text-xs ${flagSelisih ? "border-red-200 bg-red-50 text-red-700" : "border-green-200 bg-green-50 text-green-700"}`}>
            <span className="flex items-center gap-1.5">
              {flagSelisih ? <AlertCircle className="h-3.5 w-3.5" /> : <CheckCircle className="h-3.5 w-3.5" />}
              {flagSelisih
                ? `Selisih: ${fmtIDR(Math.abs(nilaiTerjual - totalSetoran))} (nilai terjual ${fmtIDR(nilaiTerjual)})`
                : "Setoran sesuai dengan nilai terjual"}
            </span>
            <span className="font-semibold tabular-nums">{fmtIDR(totalSetoran)}</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-2 border-t border-neutral-200">
        <button type="button" onClick={onCancel} className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
          Batal
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading || hasError}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          {loading ? "Menyimpan..." : "Selesaikan Titip Jual"}
        </button>
      </div>
    </div>
  )
}
