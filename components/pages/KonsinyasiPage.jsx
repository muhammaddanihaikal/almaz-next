"use client"

import { useMemo, useState } from "react"
import { AlertCircle, Clock } from "lucide-react"
import { fmtIDR, fmtTanggal, defaultDateRange } from "@/lib/utils"
import { Card, PageHeader, SearchableSelect, DateFilter } from "@/components/ui"
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

export default function KonsinyasiPage({ konsinyasiList, salesList }) {
  const [detail,      setDetail]      = useState(null)
  const [statusFilter, setStatusFilter] = useState("aktif")
  const [salesFilter,  setSalesFilter]  = useState("")

  const rows = useMemo(() => {
    let filtered = konsinyasiList
    if (statusFilter) filtered = filtered.filter((r) => r.status === statusFilter)
    if (salesFilter)  filtered = filtered.filter((r) => r.sales_id === salesFilter)
    return filtered
  }, [konsinyasiList, statusFilter, salesFilter])

  const jatuhTempoHariIni = konsinyasiList.filter((k) => k.status === "aktif" && k.selisihHari <= 0)
  const jatuhTempoSegera  = konsinyasiList.filter((k) => k.status === "aktif" && k.selisihHari > 0 && k.selisihHari <= 3)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Konsinyasi"
        subtitle="Daftar semua transaksi titip jual sales."
      />

      {jatuhTempoHariIni.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-red-700">
            <AlertCircle className="h-4 w-4" />
            {jatuhTempoHariIni.length} konsinyasi sudah jatuh tempo hari ini
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
            {jatuhTempoSegera.length} konsinyasi jatuh tempo dalam 3 hari
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

      <div className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] lg:flex-row lg:items-center lg:gap-6">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-neutral-600 w-14">Status:</label>
          <div className="w-36">
            <SearchableSelect
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={[
                { value: "",       label: "Semua Status" },
                { value: "aktif",  label: "Aktif" },
                { value: "selesai", label: "Selesai" },
              ]}
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-neutral-600 w-10">Sales:</label>
          <div className="w-48">
            <SearchableSelect
              value={salesFilter}
              onChange={(e) => setSalesFilter(e.target.value)}
              placeholder="Semua Sales"
              options={[{ value: "", label: "Semua Sales" }, ...salesList.map((s) => ({ value: s.id, label: s.nama }))]}
            />
          </div>
        </div>
      </div>

      <Card>
        <DataTable
          key={`${statusFilter}-${salesFilter}`}
          pageSize={PAGE_SIZE}
          rows={rows}
          empty="Tidak ada konsinyasi."
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
            { key: "status",     label: "Status",       render: (r) => <Badge label={r.status === "selesai" ? "Selesai" : "Aktif"} colorClass={STATUS_COLOR[r.status]} /> },
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
            { key: "nilai",      label: "Nilai",        align: "right", render: (r) => fmtIDR(r.nilaiTotal) },
            {
              key: "flag", label: "",
              render: (r) => r.flagSetoran ? (
                <span className="flex items-center gap-1 text-xs text-red-600 whitespace-nowrap">
                  <AlertCircle className="h-3 w-3" /> Selisih setoran
                </span>
              ) : null,
            },
            {
              key: "actions", label: "", align: "right",
              render: (r) => (
                <button onClick={() => setDetail(r)} className="rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50">
                  Detail
                </button>
              ),
            },
          ]}
        />
      </Card>

      {detail && (
        <Modal title={`Detail Konsinyasi — ${detail.nama_toko}`} onClose={() => setDetail(null)} width="max-w-2xl">
          <KonsinyasiDetail record={detail} />
        </Modal>
      )}
    </div>
  )
}

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
