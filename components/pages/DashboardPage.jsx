"use client"

import { useMemo, useState } from "react"
import { Wallet, TrendingUp, Package, ArrowDownCircle, AlertCircle, Clock } from "lucide-react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { fmtIDR, fmtTanggal, filterByDateRange, defaultDateRange, sortByDateDesc } from "@/lib/utils"
import { Card, KpiCard, DateFilter } from "@/components/ui"

export default function DashboardPage({ sesiList, konsinyasiJatuhTempo, rokokList, pengeluaranList }) {
  const [dateRange, setDateRange] = useState(defaultDateRange("bulan_ini"))

  const sesiF        = useMemo(() => filterByDateRange(sesiList,       dateRange), [sesiList, dateRange])
  const pengeluaranF = useMemo(() => filterByDateRange(pengeluaranList, dateRange), [pengeluaranList, dateRange])

  const stats = useMemo(() => {
    const totalPenjualan = sesiF.reduce((s, sesi) =>
      s + sesi.penjualan.reduce((ss, it) => ss + it.qty * it.harga, 0), 0)

    const totalSetoran = sesiF.reduce((s, sesi) =>
      s + sesi.setoran.reduce((ss, it) => ss + it.jumlah, 0), 0)

    const totalPengeluaran = pengeluaranF.reduce((s, p) => s + p.jumlah, 0)

    const totalKeluar = sesiF.reduce((s, sesi) =>
      s + sesi.barangKeluar.reduce((ss, it) => ss + it.qty, 0), 0)

    const profit = sesiF.reduce((s, sesi) => {
      return s + sesi.penjualan.reduce((ss, it) => {
        const r = rokokList.find((r) => r.id === it.rokok_id)
        return r ? ss + it.qty * (it.harga - r.harga_beli) : ss
      }, 0)
    }, 0)

    return { totalPenjualan, totalSetoran, totalPengeluaran, totalKeluar, profit }
  }, [sesiF, pengeluaranF, rokokList])

  const qtyPerRokok = useMemo(() => {
    const map = new Map()
    for (const sesi of sesiF) {
      for (const it of sesi.penjualan) {
        const r = rokokList.find((r) => r.id === it.rokok_id)
        if (r) map.set(r.nama, (map.get(r.nama) || 0) + it.qty)
      }
    }
    return rokokList.map((r) => ({ rokok: r.nama, qty: map.get(r.nama) || 0 }))
  }, [sesiF, rokokList])

  const jatuhTempoHariIni = konsinyasiJatuhTempo.filter((k) => k.selisihHari <= 0)
  const jatuhTempoSegera  = konsinyasiJatuhTempo.filter((k) => k.selisihHari > 0)

  const sesiDenganFlag = useMemo(
    () => sortByDateDesc(sesiF.filter((s) => s.flagSetoran || s.flagQty)).slice(0, 5),
    [sesiF]
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Ringkasan distribusi{dateRange?.start ? ` — ${fmtTanggal(dateRange.start)} s/d ${fmtTanggal(dateRange.end)}` : " — semua waktu"}.
          </p>
        </div>
        <DateFilter value={dateRange} onChange={setDateRange} />
      </div>

      {/* Reminder Konsinyasi */}
      {jatuhTempoHariIni.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-red-700">
            <AlertCircle className="h-4 w-4" />
            {jatuhTempoHariIni.length} konsinyasi sudah jatuh tempo hari ini
          </div>
          <div className="space-y-1">
            {jatuhTempoHariIni.map((k) => (
              <div key={k.id} className="flex justify-between text-xs text-red-600">
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
              <div key={k.id} className="flex justify-between text-xs text-amber-600">
                <span>{k.sales} → {k.nama_toko} — {k.selisihHari} hari lagi</span>
                <span>{fmtIDR(k.nilaiTotal)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={Wallet}          label="Total Penjualan"   value={fmtIDR(stats.totalPenjualan)} />
        <KpiCard icon={TrendingUp}      label="Total Profit"      value={fmtIDR(stats.profit)} />
        <KpiCard icon={Package}         label="Barang Keluar"     value={`${stats.totalKeluar} pcs`} />
        <KpiCard icon={ArrowDownCircle} label="Total Pengeluaran" value={fmtIDR(stats.totalPengeluaran)} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Qty Terjual per Rokok">
          {qtyPerRokok.every((r) => r.qty === 0) ? (
            <p className="py-8 text-center text-sm text-neutral-400">Tidak ada data pada periode ini.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={qtyPerRokok}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="rokok" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="qty" fill="#171717" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card title="Sesi dengan Flag">
          {sesiDenganFlag.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-400">Tidak ada flag pada periode ini.</p>
          ) : (
            <div className="space-y-2">
              {sesiDenganFlag.map((sesi) => (
                <div key={sesi.id} className="flex items-center justify-between rounded-lg border border-neutral-100 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">{sesi.sales} — {fmtTanggal(sesi.tanggal)}</p>
                    <div className="flex gap-2 mt-0.5">
                      {sesi.flagSetoran && <span className="text-xs text-red-600 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> Selisih setoran</span>}
                      {sesi.flagQty     && <span className="text-xs text-orange-600 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> Qty tidak cocok</span>}
                    </div>
                  </div>
                  <span className="text-xs text-neutral-400">{fmtIDR(sesi.nilaiPenjualan)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
