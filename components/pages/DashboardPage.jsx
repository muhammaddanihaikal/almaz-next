"use client"

import { useMemo, useState } from "react"
import { Wallet, TrendingUp, Package, ArrowDownCircle } from "lucide-react"
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { fmtIDR, fmtTanggal, filterByDateRange, defaultDateRange } from "@/lib/utils"
import { Card, KpiCard, DateFilter } from "@/components/ui"

export default function DashboardPage({ sesiList, titipJualList, titipJualJatuhTempo, rokokList, pengeluaranList }) {
  const [dateRange, setDateRange] = useState(defaultDateRange("bulan_ini"))

  const sesiF = useMemo(() => filterByDateRange(sesiList, dateRange), [sesiList, dateRange])
  const pengeluaranF = useMemo(() => filterByDateRange(pengeluaranList, dateRange), [pengeluaranList, dateRange])
  const titipJualF = useMemo(() => {
    if (!dateRange?.start || !dateRange?.end) return titipJualList.filter((k) => k.status === "selesai")
    return titipJualList.filter(
      (k) => k.status === "selesai" && k.tanggal_selesai >= dateRange.start && k.tanggal_selesai <= dateRange.end
    )
  }, [titipJualList, dateRange])

  const stats = useMemo(() => {
    const penjualanSesi = sesiF.reduce((s, sesi) =>
      s + sesi.penjualan.reduce((ss, it) => ss + it.qty * it.harga, 0), 0)
    
    const penjualanKonsinyasi = titipJualF.reduce((s, k) => s + k.nilaiTerjual, 0)
    
    const totalPenjualan = penjualanSesi + penjualanKonsinyasi

    const totalSetoran = sesiF.reduce((s, sesi) =>
      s + sesi.setoran.reduce((ss, it) => ss + it.jumlah, 0), 0) + 
      titipJualF.reduce((s, k) => s + k.totalSetoran, 0)

    const totalPengeluaran = pengeluaranF.reduce((s, p) => s + p.jumlah, 0)

    const totalTerjualSesi = sesiF.reduce((s, sesi) =>
      s + sesi.penjualan.reduce((ss, it) => ss + it.qty, 0), 0)
    
    const totalTerjualKonsinyasi = titipJualF.reduce((s, k) =>
      s + k.items.reduce((ss, it) => ss + it.qty_terjual, 0), 0)
    
    // Barang Keluar = (Keluar Sesi - Kembali Sesi) - Retur Konsinyasi (saat pelunasan)
    const netKeluarSesi = sesiF.reduce((s, sesi) => {
      const keluar = sesi.barangKeluar.reduce((ss, it) => ss + it.qty, 0)
      const kembali = sesi.barangKembali.reduce((ss, it) => ss + it.qty, 0)
      return s + (keluar - kembali)
    }, 0)
    
    const returKonsinyasi = titipJualF.reduce((s, k) => 
      s + k.items.reduce((ss, it) => ss + it.qty_kembali, 0), 0)
    
    const totalKeluar = netKeluarSesi - returKonsinyasi

    const profitSesi = sesiF.reduce((s, sesi) => {
      return s + sesi.penjualan.reduce((ss, it) => {
        const r = rokokList.find((r) => r.id === it.rokok_id)
        return r ? ss + it.qty * (it.harga - r.harga_beli) : ss
      }, 0)
    }, 0)

    const profitKonsinyasi = titipJualF.reduce((s, k) => {
      return s + k.items.reduce((ss, it) => {
        const r = rokokList.find((r) => r.id === it.rokok_id)
        return r ? ss + it.qty_terjual * (it.harga - r.harga_beli) : ss
      }, 0)
    }, 0)

    const profit = profitSesi + profitKonsinyasi

    return { totalPenjualan, totalSetoran, totalPengeluaran, totalKeluar, profit }
  }, [sesiF, titipJualF, pengeluaranF, rokokList])

  const qtyPerRokok = useMemo(() => {
    const map = new Map()
    // Start with items that left the warehouse in daily sessions
    for (const sesi of sesiF) {
      for (const it of sesi.barangKeluar) {
        const r = rokokList.find((r) => r.id === it.rokok_id)
        if (r) map.set(r.nama, (map.get(r.nama) || 0) + it.qty)
      }
      for (const it of sesi.barangKembali) {
        const r = rokokList.find((r) => r.id === it.rokok_id)
        if (r) map.set(r.nama, (map.get(r.nama) || 0) - it.qty)
      }
    }
    // Subtract items that returned from consignment settlements
    for (const k of titipJualF) {
      for (const it of k.items) {
        const r = rokokList.find((r) => r.id === it.rokok_id)
        if (r) map.set(r.nama, (map.get(r.nama) || 0) - it.qty_kembali)
      }
    }
    return rokokList.map((r) => ({ rokok: r.nama, qty: map.get(r.nama) || 0 }))
  }, [sesiF, titipJualF, rokokList])

  const penjualanHarian = useMemo(() => {
    const map = new Map()
    for (const sesi of sesiF) {
      const total = sesi.penjualan.reduce((s, it) => s + it.qty * it.harga, 0)
      map.set(sesi.tanggal, (map.get(sesi.tanggal) || 0) + total)
    }
    for (const k of titipJualF) {
      if (!k.tanggal_selesai) continue // Skip if completion date is missing to avoid crash
      const total = k.nilaiTerjual
      map.set(k.tanggal_selesai, (map.get(k.tanggal_selesai) || 0) + total)
    }
    return [...map.entries()]
      .filter(([tanggal]) => tanggal) // Ensure no null keys
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
      .map(([tanggal, total]) => ({ tanggal: fmtTanggal(tanggal), total }))
  }, [sesiF, titipJualF])

  const dateStr = dateRange?.start && dateRange?.end
    ? `${fmtTanggal(dateRange.start)} s/d ${fmtTanggal(dateRange.end)}`
    : "Semua Waktu"

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

      <Card 
        title="Barang Keluar per Rokok" 
        action={
          <div className="rounded-md border border-neutral-200 bg-neutral-50 px-2.5 py-1">
            <span className="text-xs font-medium text-neutral-600">{dateStr}</span>
          </div>
        }
      >
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

      <Card 
        title="Total Penjualan Harian"
        action={
          <div className="rounded-md border border-neutral-200 bg-neutral-50 px-2.5 py-1">
            <span className="text-xs font-medium text-neutral-600">{dateStr}</span>
          </div>
        }
      >
        {penjualanHarian.length === 0 ? (
          <p className="py-8 text-center text-sm text-neutral-400">Tidak ada data pada periode ini.</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={penjualanHarian}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="tanggal" tick={{ fontSize: 10 }} tickFormatter={(val) => val.split(" ")[0]} />
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
