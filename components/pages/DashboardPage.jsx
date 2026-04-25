"use client"

import { useMemo, useState } from "react"
import { Wallet, TrendingUp, RotateCcw, ArrowDownCircle } from "lucide-react"
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { fmtIDR, fmtTanggal, filterByDateRange, defaultDateRange, sortByDateDesc, hitungProfit } from "@/lib/utils"
import { Card, KpiCard, DateFilter, RowActions } from "@/components/ui"
import DataTable from "@/components/DataTable"
import Modal from "@/components/Modal"

export default function DashboardPage({ penjualan, retur, rokokList, pengeluaranList }) {
  const [dateRange, setDateRange] = useState(defaultDateRange("bulan_ini"))
  const [detail,    setDetail]    = useState(null)

  const penjualanF   = useMemo(() => filterByDateRange(penjualan,      dateRange), [penjualan, dateRange])
  const returF       = useMemo(() => filterByDateRange(retur,          dateRange), [retur, dateRange])
  const pengeluaranF = useMemo(() => filterByDateRange(pengeluaranList, dateRange), [pengeluaranList, dateRange])

  const stats = useMemo(() => {
    const totalPenjualan   = penjualanF.reduce((s, p) => s + p.masukItems.filter((it) => !it.is_sample).reduce((ss, it) => ss + it.qty * it.harga, 0), 0)
    const totalProfit      = penjualanF.reduce((s, p) => s + hitungProfit(rokokList, p), 0)
    const totalRetur       = returF.reduce((s, r) => s + r.items.reduce((ss, it) => ss + it.qty, 0), 0)
    const totalPengeluaran = pengeluaranF.reduce((s, p) => s + p.jumlah, 0)
    return { totalPenjualan, totalProfit, totalRetur, totalPengeluaran }
  }, [penjualanF, returF, rokokList, pengeluaranF])

  const trendProfit = useMemo(() => {
    const map = new Map()
    for (const p of penjualanF) {
      const profit = hitungProfit(rokokList, p)
      map.set(p.tanggal, (map.get(p.tanggal) || 0) + profit)
    }
    return [...map.entries()]
      .map(([tanggal, profit]) => ({ tanggal, label: fmtTanggal(tanggal), profit }))
      .sort((a, b) => a.tanggal.localeCompare(b.tanggal))
  }, [penjualanF, rokokList])

  const qtyPerRokok = useMemo(() => {
    const map = new Map()
    for (const p of penjualanF) {
      for (const it of p.masukItems.filter((it) => !it.is_sample)) {
        map.set(it.rokok, (map.get(it.rokok) || 0) + it.qty)
      }
    }
    return rokokList.map((r) => ({ rokok: r.nama, qty: map.get(r.nama) || 0 }))
  }, [penjualanF, rokokList])

  const terakhir = useMemo(
    () => sortByDateDesc(penjualanF.filter((p) => p.masukItems.length > 0)).slice(0, 5),
    [penjualanF]
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Ringkasan performa penjualan rokok
            {dateRange?.start ? ` — ${fmtTanggal(dateRange.start)} s/d ${fmtTanggal(dateRange.end)}` : " — semua waktu"}.
          </p>
        </div>
        <DateFilter value={dateRange} onChange={setDateRange} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={Wallet}          label="Total Penjualan"   value={fmtIDR(stats.totalPenjualan)} />
        <KpiCard icon={TrendingUp}      label="Total Profit"      value={fmtIDR(stats.totalProfit)} />
        <KpiCard icon={RotateCcw}       label="Total Retur"       value={`${stats.totalRetur} pcs`} />
        <KpiCard icon={ArrowDownCircle} label="Total Pengeluaran" value={fmtIDR(stats.totalPengeluaran)} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Trend Profit Harian">
          {trendProfit.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-400">Tidak ada data pada periode ini.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={trendProfit}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => fmtIDR(v)} />
                <Line type="monotone" dataKey="profit" stroke="#171717" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>

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
      </div>

      <Card title="Penjualan Terakhir">
        <DataTable
          rows={terakhir}
          empty="Tidak ada penjualan pada periode ini."
          columns={[
            { key: "tanggal", label: "Tanggal", render: (r) => fmtTanggal(r.tanggal) },
            { key: "sales",   label: "Sales",   render: (r) => r.sales || "—" },
            {
              key: "items", label: "Rokok",
              render: (r) => (
                <div className="space-y-0.5">
                  {r.masukItems.filter((it) => !it.is_sample).map((it, i) => (
                    <div key={i} className="text-xs text-neutral-700">{it.rokok} ×{it.qty}</div>
                  ))}
                </div>
              ),
            },
            {
              key: "total", label: "Total", align: "right",
              render: (r) => fmtIDR(r.masukItems.filter((it) => !it.is_sample).reduce((s, it) => s + it.qty * it.harga, 0)),
            },
            { key: "actions", label: "", align: "right", render: (r) => <RowActions onDetail={() => setDetail(r)} /> },
          ]}
        />
      </Card>

      {detail && (
        <Modal title="Detail Penjualan" onClose={() => setDetail(null)} width="max-w-2xl">
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div><p className="text-xs text-neutral-500">Tanggal</p><p className="font-medium">{fmtTanggal(detail.tanggal)}</p></div>
              <div><p className="text-xs text-neutral-500">Tipe</p><p className="font-medium">{detail.tipe_penjualan || "—"}</p></div>
              {detail.sales && <div><p className="text-xs text-neutral-500">Sales</p><p className="font-medium">{detail.sales}</p></div>}
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-xs font-medium text-neutral-500">
                  <th className="pb-2 text-left">Rokok</th>
                  <th className="pb-2 text-right">Qty</th>
                  <th className="pb-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {detail.masukItems.filter((it) => !it.is_sample).map((it, i) => (
                  <tr key={i} className="border-b border-neutral-100">
                    <td className="py-2">{it.rokok}</td>
                    <td className="py-2 text-right tabular-nums">{it.qty}</td>
                    <td className="py-2 text-right tabular-nums">{fmtIDR(it.qty * it.harga)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      )}
    </div>
  )
}
