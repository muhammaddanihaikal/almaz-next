"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Calendar, ChevronDown, ChevronUp, Box, ArrowLeft, ArrowUpRight, ArrowDownLeft, RotateCcw } from "lucide-react"
import { fmtIDR } from "@/lib/utils"
import { Card, PageHeader, Field, Button, IconButton, DateFilter, inputCls } from "@/components/ui"

export default function MutasiStokPage({ initialData, startDate, endDate, initialPreset }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [filter, setFilter] = useState({
    preset: initialPreset || "hari_ini",
    start: startDate,
    end: endDate
  })
  const [expandedDate, setExpandedDate] = useState(initialData[0]?.tanggal || null)


  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 -mb-2">
        <IconButton 
          icon={ArrowLeft} 
          onClick={() => {
            startTransition(() => {
              router.push("/rokok")
            })
          }} 
          loading={isPending}
          label="Kembali ke Master Rokok" 
        />
        <span className="text-sm font-medium text-neutral-500">Master Rokok</span>
      </div>
      <PageHeader 
        title="Mutasi Stok" 
        subtitle="Riwayat pergerakan barang (In/Out) per hari."
        action={
          <div className="flex flex-wrap items-center gap-3">
            <DateFilter 
              value={filter} 
              onChange={(val) => {
                setFilter(val)
                startTransition(() => {
                  router.push(`/rokok/mutasi?start=${val.start}&end=${val.end}&preset=${val.preset}`)
                })
              }} 
            />
          </div>
        }
      />

      <div className="space-y-4">
        {initialData.length === 0 ? (
          <Card className="flex flex-col items-center justify-center py-12 text-neutral-400">
            <Box className="h-12 w-12 mb-3 opacity-20" />
            <p>Tidak ada mutasi stok pada periode ini.</p>
          </Card>
        ) : (
          initialData.map((day) => (
            <div key={day.tanggal} className="group">
              <button
                onClick={() => setExpandedDate(expandedDate === day.tanggal ? null : day.tanggal)}
                className={`w-full flex items-center justify-between px-5 py-4 bg-white border border-neutral-200 rounded-xl shadow-sm transition-all hover:border-emerald-200 ${expandedDate === day.tanggal ? 'ring-2 ring-emerald-500/10 border-emerald-500' : ''}`}
              >
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-sm">
                    {new Date(day.tanggal).getDate()}
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-neutral-900">
                      {new Date(day.tanggal).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </p>
                    <p className="text-xs text-neutral-500">{day.data.length} jenis rokok mengalami mutasi</p>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="hidden md:flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-wider text-neutral-400 font-bold">Total Masuk</p>
                      <p className="text-sm font-semibold text-emerald-600">+{day.data.reduce((s, it) => s + it.masuk, 0)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-wider text-neutral-400 font-bold">Total Keluar</p>
                      <p className="text-sm font-semibold text-red-600">-{day.data.reduce((s, it) => s + it.keluar, 0)}</p>
                    </div>
                  </div>
                  {expandedDate === day.tanggal ? <ChevronUp className="h-5 w-5 text-neutral-400" /> : <ChevronDown className="h-5 w-5 text-neutral-400" />}
                </div>
              </button>

              {expandedDate === day.tanggal && (
                <div className="mt-2 mx-2 bg-neutral-50 border border-neutral-200 rounded-xl overflow-hidden animate-in slide-in-from-top-2 duration-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-neutral-100/80 border-b border-neutral-200 text-left text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                        <th className="px-4 py-3">Nama Rokok</th>
                        <th className="px-4 py-3 text-right">Awal</th>
                        <th className="px-4 py-3 text-right text-emerald-600">Masuk</th>
                        <th className="px-4 py-3 text-right text-red-600">Keluar</th>
                        <th className="px-4 py-3 text-right font-bold text-neutral-900">Akhir</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200">
                      {day.data.map((row) => (
                        <tr key={row.rokok_id} className="hover:bg-white transition-colors">
                          <td className="px-4 py-3 font-medium text-neutral-900">{row.nama}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-neutral-500">{row.awal}</td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            <div className="flex flex-col items-end">
                              <span className="text-emerald-600 font-semibold">+{row.masuk}</span>
                              {(row.detail_kembali > 0 || row.detail_retur > 0) && (
                                <span className="text-[10px] text-neutral-400">
                                  ({row.detail_masuk} in, {row.detail_kembali} ret, {row.detail_retur} rtr)
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-red-600 font-semibold">-{row.keluar}</td>
                          <td className="px-4 py-3 text-right tabular-nums font-bold text-neutral-900 bg-neutral-100/30">{row.akhir}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
