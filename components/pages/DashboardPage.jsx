"use client"

import { useMemo, useState } from "react"
import { Wallet, TrendingUp, Package, ArrowDownCircle } from "lucide-react"
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { fmtIDR, fmtTanggal, filterByDateRange, defaultDateRange } from "@/lib/utils"
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

  const penjualanHarian = useMemo(() => {
    const map = new Map()
    for (const sesi of sesiF) {
      const total = sesi.penjualan.reduce((s, it) => s + it.qty * it.harga, 0)
      map.set(sesi.tanggal, (map.get(sesi.tanggal) || 0) + total)
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([tanggal, total]) => ({ tanggal: fmtTanggal(tanggal), total }))
  }, [sesiF])

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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={Wallet}          label="Total Penjualan"   value={fmtIDR(stats.totalPenjualan)} />
        <KpiCard icon={TrendingUp}      label="Total Profit"      value={fmtIDR(stats.profit)} />
        <KpiCard icon={Package}         label="Barang Keluar"     value={`${stats.totalKeluar} pcs`} />
        <KpiCard icon={ArrowDownCircle} label="Total Pengeluaran" value={fmtIDR(stats.totalPengeluaran)} />
      </div>

      <Card title="Qty Terjual per Rokok">
        {qtyPerRokok.every((r) => r.qty === 0) ? (
          <p className="py-8 text-center text-sm text-neutral-400">Tidak ada data pada periode ini.</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
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

      <Card title="Total Penjualan Harian">
        {penjualanHarian.length === 0 ? (
          <p className="py-8 text-center text-sm text-neutral-400">Tidak ada data pada periode ini.</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={penjualanHarian}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="tanggal" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtIDR(v)} width={90} />
              <Tooltip formatter={(v) => fmtIDR(v)} />
              <Line type="monotone" dataKey="total" stroke="#171717" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Card>
    </div>
  )
}
