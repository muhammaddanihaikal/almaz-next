"use client"

import { useEffect, useMemo, useState } from "react"
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  Package,
  ReceiptText,
  TrendingUp,
  Wallet,
} from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Sector,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  buildProductQtyBreakdown,
  calculateStats,
  getSesiNetKeluar,
  getSesiPenjualanBreakdown,
  getSesiProfit,
  getSesiSetoran,
  getTitipProfit,
  getTitipReturQty,
} from "@/lib/dashboard-utils"
import { defaultDateRange, filterByDateRange, fmtIDR, fmtTanggal, getDateRanges } from "@/lib/utils"
import { getSesiListByDateRange } from "@/actions/distribusi"
import { getTitipJualListByDateRange } from "@/actions/titip_jual"

const CARD_CLS = "rounded-xl border border-neutral-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
const CHIP_CLS = "inline-flex items-center rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-600"
const CHART_COLORS = ["#171717", "#C97B2A", "#3F6B4A", "#5C7A8C", "#8A6A2B", "#9C5A5A", "#475569", "#A89A7A"]

const DATE_PRESETS = [
  { value: "hari_ini", label: "Hari Ini" },
  { value: "minggu_ini", label: "Minggu Ini" },
  { value: "bulan_ini", label: "Bulan Ini" },
  { value: "custom", label: "Custom" },
]

const toNumber = (value) => Number(value) || 0
const sumBy = (items, getter) => (items || []).reduce((sum, item) => sum + toNumber(getter(item)), 0)
function parseDate(value) {
  if (!value) return null
  const [year, month, day] = String(value).split("-").map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

function formatDateInput(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function getDaysBetween(start, end) {
  const first = parseDate(start)
  const last = parseDate(end)
  if (!first || !last) return 0
  return Math.max(0, Math.round((last - first) / 86400000) + 1)
}

function getPreviousRange(range) {
  if (!range?.start || !range?.end) return null
  const start = parseDate(range.start)
  const end = parseDate(range.end)
  if (!start || !end || end < start) return null

  const days = Math.round((end - start) / 86400000) + 1
  const previousEnd = new Date(start)
  previousEnd.setDate(previousEnd.getDate() - 1)
  const previousStart = new Date(previousEnd)
  previousStart.setDate(previousStart.getDate() - days + 1)

  return { start: formatDateInput(previousStart), end: formatDateInput(previousEnd) }
}

function dateLabel(iso) {
  const parsed = parseDate(iso)
  if (!parsed) return iso
  return parsed.toLocaleDateString("id-ID", { day: "2-digit", month: "short" })
}

function compactIDR(value) {
  const n = toNumber(value)
  if (Math.abs(n) >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1).replace(".0", "")}M`
  if (Math.abs(n) >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1).replace(".0", "")}jt`
  if (Math.abs(n) >= 1_000) return `Rp ${Math.round(n / 1_000)}k`
  return fmtIDR(n)
}

function isDateInRange(tanggal, range) {
  if (!tanggal) return false
  if (!range?.start || !range?.end) return true
  return tanggal >= range.start && tanggal <= range.end
}

function filterTitipSelesaiByRange(list, range) {
  return (list || []).filter((titip) => {
    if (titip.status !== "selesai") return false
    if (!range?.start || !range?.end) return true
    return titip.tanggal_selesai >= range.start && titip.tanggal_selesai <= range.end
  })
}

function foldLongTail(items, limit = 8) {
  const positive = items.filter((item) => item.qty > 0).sort((a, b) => b.qty - a.qty)
  if (positive.length <= limit) return positive

  const head = positive.slice(0, limit - 1)
  const tail = positive.slice(limit - 1)
  return [
    ...head,
    {
      id: "lainnya",
      rokok: `Lainnya (${tail.length})`,
      qty: sumBy(tail, (item) => item.qty),
      isOther: true,
    },
  ]
}

function buildQtyPerRokok(sesiRows, titipRows, rokokList) {
  const qtyMap = new Map((rokokList || []).map((rokok) => [rokok.id, 0]))

  for (const sesi of sesiRows || []) {
    for (const item of sesi.barangKeluar || []) {
      qtyMap.set(item.rokok_id, (qtyMap.get(item.rokok_id) || 0) + toNumber(item.qty))
    }
    for (const item of sesi.barangKembali || []) {
      qtyMap.set(item.rokok_id, (qtyMap.get(item.rokok_id) || 0) - toNumber(item.qty))
    }
  }

  for (const titip of titipRows || []) {
    for (const item of titip.items || []) {
      qtyMap.set(item.rokok_id, (qtyMap.get(item.rokok_id) || 0) - toNumber(item.qty_kembali))
    }
  }

  return (rokokList || []).map((rokok) => ({
    id: rokok.id,
    rokok: rokok.nama,
    qty: qtyMap.get(rokok.id) || 0,
  }))
}

function buildDailySummary(sesiRows, titipProfitRows, titipSetoranRows, rokokById, range) {
  const rows = new Map()
  const ensure = (tanggal) => {
    if (!tanggal) return null
    if (!rows.has(tanggal)) rows.set(tanggal, { tanggal, label: dateLabel(tanggal), penjualan: 0, setoran: 0, profit: 0, qty: 0, expenses: 0 })
    return rows.get(tanggal)
  }

  if (range?.start && range?.end && getDaysBetween(range.start, range.end) <= 62) {
    const current = parseDate(range.start)
    const end = parseDate(range.end)
    while (current && end && current <= end) {
      ensure(formatDateInput(current))
      current.setDate(current.getDate() + 1)
    }
  }

  for (const sesi of sesiRows || []) {
    const row = ensure(sesi.tanggal)
    if (!row) continue
    row.penjualan += getSesiPenjualanBreakdown(sesi).total
    row.setoran += getSesiSetoran(sesi)
    row.profit += getSesiProfit(sesi, rokokById)
    row.qty += getSesiNetKeluar(sesi)
  }

  for (const titip of titipSetoranRows || []) {
    for (const setoran of titip.setoran || []) {
      if (!isDateInRange(setoran.tanggal, range)) continue
      const row = ensure(setoran.tanggal)
      if (row) row.setoran += toNumber(setoran.jumlah)
    }
  }

  for (const titip of titipProfitRows || []) {
    const row = ensure(titip.tanggal_selesai)
    if (!row) continue
    row.profit += getTitipProfit(titip, rokokById)
    row.qty -= getTitipReturQty(titip)
  }

  return [...rows.values()].sort((a, b) => a.tanggal.localeCompare(b.tanggal))
}

function getDelta(current, previous) {
  const now = toNumber(current)
  const before = toNumber(previous)
  if (before === 0) return now === 0 ? 0 : null
  return ((now - before) / Math.abs(before)) * 100
}

function getCompareLabel(preset) {
  const labels = {
    hari_ini: "vs kemarin",
    minggu_ini: "vs minggu lalu",
    bulan_ini: "vs bulan lalu",
    custom: "vs periode sebelumnya",
  }

  return labels[preset] || "vs periode sebelumnya"
}

function formatSetoranGap(totalSetoran, totalPenjualan) {
  const selisih = totalSetoran - totalPenjualan
  if (selisih === 0) return "Setoran sesuai"
  if (selisih < 0) return `Kurang setor ${fmtIDR(Math.abs(selisih))}`
  return `Lebih setor ${fmtIDR(selisih)}`
}

function DateFilterNew({ value, onChange }) {
  const handlePreset = (preset) => {
    if (preset === "custom") {
      onChange({ preset, start: value?.start || "", end: value?.end || "" })
      return
    }

    const ranges = getDateRanges()
    onChange({ preset, ...ranges[preset] })
  }

  const handleCustomDate = (field, date) => {
    onChange({ preset: "custom", start: value?.start || "", end: value?.end || "", [field]: date })
  }

  return (
    <div className="flex w-full flex-col gap-2 lg:w-auto lg:flex-row lg:items-center">
      <div className="grid grid-cols-2 gap-1 rounded-xl border border-neutral-200 bg-white p-1 sm:flex">
        {DATE_PRESETS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            onClick={() => handlePreset(preset.value)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              value?.preset === preset.value ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div
        className={`flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-xs transition-colors ${
          value?.preset === "custom" ? "border-neutral-400 ring-1 ring-neutral-900/10" : "border-neutral-200"
        }`}
      >
        <CalendarDays className="h-4 w-4 shrink-0 text-neutral-400" strokeWidth={2} />
        <input
          type="date"
          value={value?.start || ""}
          disabled={value?.preset !== "custom"}
          onChange={(event) => handleCustomDate("start", event.target.value)}
          className="w-full bg-transparent font-mono text-xs text-neutral-700 outline-none disabled:cursor-default sm:w-[118px]"
        />
        <span className="text-neutral-300">-</span>
        <input
          type="date"
          value={value?.end || ""}
          disabled={value?.preset !== "custom"}
          onChange={(event) => handleCustomDate("end", event.target.value)}
          className="w-full bg-transparent font-mono text-xs text-neutral-700 outline-none disabled:cursor-default sm:w-[118px]"
        />
      </div>
    </div>
  )
}

function DeltaBadge({ value, compareLabel }) {
  if (value === null) {
    return <span className="text-[11px] font-medium text-neutral-400">periode baru {compareLabel}</span>
  }

  if (!value) {
    return <span className="text-[11px] font-medium text-neutral-400">stabil {compareLabel}</span>
  }

  const up = value > 0
  const Icon = up ? ArrowUpRight : ArrowDownRight

  return (
    <span className={`inline-flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[11px] font-semibold leading-tight ${up ? "text-emerald-700" : "text-amber-700"}`}>
      <Icon className="h-3 w-3" strokeWidth={2.5} />
      {up ? "+" : ""}
      {value.toFixed(1)}% {compareLabel}
    </span>
  )
}

function Sparkline({ values, color = "#171717" }) {
  const data = values.length > 1 ? values : [0, values[0] || 0]
  const width = 96
  const height = 28
  const padding = 3
  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const span = max - min || 1
  const points = data.map((value, index) => {
    const x = padding + (index * (width - padding * 2)) / Math.max(data.length - 1, 1)
    const y = padding + (height - padding * 2) * (1 - (value - min) / span)
    return [x, y]
  })
  const path = points.map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x} ${y}`).join(" ")
  const [lastX, lastY] = points[points.length - 1]

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={path} fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
      <circle cx={lastX} cy={lastY} r="2.5" fill={color} />
    </svg>
  )
}

function ProductTooltip({ items }) {
  const total = sumBy(items, (item) => item.qty)

  return (
    <div className="absolute left-0 top-full z-30 mt-2 hidden w-full min-w-[240px] overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl ring-1 ring-black/5 group-hover:block">
      <div className="bg-neutral-900 px-3.5 py-2">
        <span className="text-[10px] font-semibold uppercase text-white/70">Rincian Per Produk</span>
      </div>
      <div className="max-h-64 overflow-y-auto py-1">
        {items.length === 0 ? (
          <div className="px-3.5 py-3 text-xs text-neutral-400">Tidak ada barang keluar.</div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 px-3.5 py-1.5 text-xs hover:bg-neutral-50">
              <span className="min-w-0 truncate text-neutral-500">{item.rokok}</span>
              <span className="shrink-0 font-semibold tabular-nums text-neutral-900">{item.qty} pcs</span>
            </div>
          ))
        )}
      </div>
      <div className="flex items-center justify-between border-t border-neutral-100 px-3.5 py-2 text-xs">
        <span className="text-neutral-500">Total</span>
        <span className="font-semibold tabular-nums text-neutral-900">{total} pcs</span>
      </div>
    </div>
  )
}

function SalesBreakdownTooltip({ breakdown, totalSetoran }) {
  const selisih = totalSetoran - breakdown.total
  const rows = [
    ["Penjualan Langsung", breakdown.langsung],
    ["Titip Jual", breakdown.titipJual],
    ["Tukar Barang", breakdown.tukarBarang],
    ["Total Penjualan", breakdown.total],
    ["Total Setoran", totalSetoran],
    ["Selisih", selisih],
  ]

  return (
    <div className="absolute left-0 top-full z-30 mt-2 hidden w-full min-w-[260px] overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl ring-1 ring-black/5 group-hover:block">
      <div className="bg-neutral-900 px-3.5 py-2">
        <span className="text-[10px] font-semibold uppercase text-white/70">Rincian Penjualan</span>
      </div>
      <div className="py-1">
        {rows.map(([label, value], index) => (
          <div key={label} className={`flex items-center justify-between gap-3 px-3.5 py-1.5 text-xs ${index >= 3 ? "font-semibold" : ""}`}>
            <span className="min-w-0 truncate text-neutral-500">{label}</span>
            <span className={`shrink-0 tabular-nums ${label === "Selisih" && value < 0 ? "text-amber-700" : "text-neutral-900"}`}>
              {label === "Selisih" && value > 0 ? "+" : ""}{fmtIDR(value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SetoranBreakdownTooltip({ breakdown }) {
  const rows = [
    ["Sesi (Cash)", breakdown.cashSesi],
    ["Sesi (Transfer)", breakdown.transferSesi],
    ["Titip Jual (Cash)", breakdown.cashTitip],
    ["Titip Jual (Transfer)", breakdown.transferTitip],
    ["Total Setoran", breakdown.total],
  ]

  return (
    <div className="absolute left-0 top-full z-30 mt-2 hidden w-full min-w-[260px] overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl ring-1 ring-black/5 group-hover:block">
      <div className="bg-neutral-900 px-3.5 py-2">
        <span className="text-[10px] font-semibold uppercase text-white/70">Rincian Setoran</span>
      </div>
      <div className="py-1">
        {rows.map(([label, value], index) => (
          <div key={label} className={`flex items-center justify-between gap-3 px-3.5 py-1.5 text-xs ${index === 4 ? "font-bold border-t border-neutral-100 pt-2 text-neutral-950" : "text-neutral-500"}`}>
            <span className="min-w-0 truncate">{label}</span>
            <span className="shrink-0 tabular-nums font-semibold text-neutral-900">
              {fmtIDR(value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ProfitBreakdownTooltip({ breakdown }) {
  const rows = [
    ["Profit Sesi (Langsung)", breakdown.profitSesi],
    ["Profit Titip Jual (Konsinyasi)", breakdown.profitTitip],
    ["Total Estimasi Profit", breakdown.total],
  ]

  return (
    <div className="absolute left-0 top-full z-30 mt-2 hidden w-full min-w-[260px] overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl ring-1 ring-black/5 group-hover:block">
      <div className="bg-neutral-900 px-3.5 py-2">
        <span className="text-[10px] font-semibold uppercase text-white/70">Rincian Estimasi Profit</span>
      </div>
      <div className="py-1">
        {rows.map(([label, value], index) => (
          <div key={label} className={`flex items-center justify-between gap-3 px-3.5 py-1.5 text-xs ${index === 2 ? "font-bold border-t border-neutral-100 pt-2 text-neutral-950" : "text-neutral-500"}`}>
            <span className="min-w-0 truncate">{label}</span>
            <span className="shrink-0 tabular-nums font-semibold text-neutral-900">
              {fmtIDR(value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}


function KpiCardNew({ icon: Icon, label, value, subtitle, delta, compareLabel, sparkValues, color, tooltipItems, tooltipContent }) {
  return (
    <section className={`${CARD_CLS} group relative flex min-h-[148px] flex-col justify-between p-5 transition-all hover:border-neutral-300 hover:shadow-md`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase text-neutral-500">{label}</div>
          <div className="mt-2 break-words text-[22px] font-semibold leading-tight tabular-nums text-neutral-950">{value}</div>
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-700">
          <Icon className="h-4 w-4" strokeWidth={2} />
        </div>
      </div>

      <div className="mt-5 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <DeltaBadge value={delta} compareLabel={compareLabel} />
          <div className="mt-1 truncate text-[11px] text-neutral-400">{subtitle}</div>
        </div>
        <Sparkline values={sparkValues} color={color} />
      </div>

      {tooltipContent}
      {tooltipItems && <ProductTooltip items={tooltipItems} />}
    </section>
  )
}

function EmptyChart({ children = "Tidak ada data pada periode ini." }) {
  return (
    <div className="grid min-h-[240px] place-items-center rounded-lg border border-dashed border-neutral-200 bg-neutral-50 px-4 py-10 text-center text-sm text-neutral-400">
      {children}
    </div>
  )
}

function ChartTooltip({ active, payload, label, formatter }) {
  if (!active || !payload?.length) return null
  const item = payload[0]
  const value = formatter ? formatter(item.value, item.payload) : item.value

  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs shadow-xl">
      <div className="mb-1 font-medium text-neutral-500">{label || item.payload?.label}</div>
      <div className="font-semibold tabular-nums text-neutral-950">{value}</div>
    </div>
  )
}

function QtyBreakdownCard({ data }) {
  const [activeIndex, setActiveIndex] = useState(null)

  const chartData = [
    { name: "Langsung", value: data.langsung, color: "#171717" },
    { name: "Titip Jual", value: data.titipJual, color: "#C97B2A" },
    { name: "Tukar Barang", value: data.tukarBarang, color: "#5C7A8C" },
    { name: "Proses", value: data.sisa, color: "#ea580c" },
  ].filter(d => d.value > 0)

  const total = data.total || (data.langsung + data.titipJual + data.tukarBarang + data.sisa)

  return (
    <section className={`${CARD_CLS} flex h-full flex-col p-5`}>
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-neutral-950">Rincian Barang Keluar</h2>
        <p className="mt-0.5 text-xs text-neutral-500">Berdasarkan saluran distribusi</p>
      </div>

      {total === 0 ? (
        <div className="flex-1">
          <EmptyChart />
        </div>
      ) : (
        <div className="mt-5 flex min-w-0 flex-1 flex-col gap-4 lg:flex-row lg:items-center">
          <div className="relative mx-auto h-[170px] w-[170px] shrink-0 overflow-hidden">
            <ResponsiveContainer width="100%" height={170}>
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={70}
                  paddingAngle={4}
                  stroke="none"
                  activeIndex={activeIndex}
                  activeShape={(props) => {
                    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props
                    return (
                      <g>
                        <Sector
                          cx={cx}
                          cy={cy}
                          innerRadius={innerRadius}
                          outerRadius={outerRadius + 8}
                          startAngle={startAngle}
                          endAngle={endAngle}
                          fill={fill}
                          style={{ filter: "drop-shadow(0px 0px 8px rgba(0,0,0,0.15))" }}
                        />
                      </g>
                    )
                  }}
                >
                  {chartData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.color} 
                      onMouseEnter={() => setActiveIndex(index)}
                      onMouseLeave={() => setActiveIndex(null)}
                      style={{ 
                        opacity: activeIndex === null || activeIndex === index ? 1 : 0.3,
                        transition: "opacity 300ms ease",
                        cursor: "pointer"
                      }}
                    />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip formatter={(v) => `${v} pcs`} />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              {activeIndex === null ? (
                <>
                  <span className="text-[10px] font-bold uppercase text-neutral-400">Total</span>
                  <span className="text-xl font-black text-neutral-950">{total}</span>
                  <span className="text-[10px] text-neutral-400">pcs</span>
                </>
              ) : (
                <>
                  <span className="text-[10px] font-bold uppercase text-neutral-500">Pilihan</span>
                  <span className="text-xl font-black text-neutral-950">
                    {total > 0 ? ((chartData[activeIndex].value / total) * 100).toFixed(1) : 0}%
                  </span>
                  <span className="text-[10px] font-medium text-neutral-500">{chartData[activeIndex].value} pcs</span>
                </>
              )}
            </div>
          </div>

          <div className="min-w-0 flex-1 space-y-3">
            {chartData.map((item, index) => {
              const pct = total > 0 ? (item.value / total) * 100 : 0
              const isActive = activeIndex === index

              return (
                <div 
                  key={item.name} 
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseLeave={() => setActiveIndex(null)}
                  className={`group relative flex cursor-pointer items-center justify-between rounded-xl border p-3 transition-colors duration-200 ${
                    isActive 
                      ? "border-neutral-200 bg-white" 
                      : "border-transparent bg-neutral-50/50"
                  }`}
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className={`truncate text-xs font-semibold transition-colors ${
                        isActive ? "text-neutral-950" : "text-neutral-700"
                      }`}>
                        {item.name}
                      </span>
                    </div>
                    {/* Progress Bar */}
                    <div className="h-1 w-full max-w-[100px] overflow-hidden rounded-full bg-neutral-100">
                      <div 
                        className="h-full transition-all duration-500" 
                        style={{ 
                          width: `${pct}%`, 
                          backgroundColor: item.color,
                          opacity: isActive ? 1 : 0.6
                        }} 
                      />
                    </div>
                  </div>

                  <div className="flex flex-col items-end text-right">
                    <span className={`text-xs font-black tabular-nums transition-colors ${
                      isActive ? "text-neutral-950" : "text-neutral-800"
                    }`}>
                      {pct.toFixed(1)}%
                    </span>
                    <span className="text-[10px] font-medium tabular-nums text-neutral-400">
                      {item.value} pcs
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}

function BarangKeluarChart({ data, rangeLabel }) {
  const chartData = data.filter((item) => item.qty > 0).sort((a, b) => b.qty - a.qty).slice(0, 8)

  return (
    <section className={`${CARD_CLS} flex h-full min-h-[360px] flex-col p-5`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-neutral-950">Barang Keluar per Rokok</h2>
          <p className="mt-0.5 text-xs text-neutral-500">Produk dengan pergerakan keluar tertinggi</p>
        </div>
        <span className={CHIP_CLS}>{rangeLabel}</span>
      </div>

      <div className="mt-4 flex-1 min-w-0">
        {chartData.length === 0 ? (
          <EmptyChart />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 24, right: 8, left: -18, bottom: 8 }}>
              <CartesianGrid stroke="#f1f1f1" strokeDasharray="3 4" vertical={false} />
              <XAxis
                dataKey="rokok"
                interval={0}
                tick={{ fontSize: 10, fill: "#737373" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => String(value).split(" ").slice(0, 2).join(" ")}
              />
              <YAxis tick={{ fontSize: 11, fill: "#737373" }} tickLine={false} axisLine={false} width={42} />
              <Tooltip content={<ChartTooltip formatter={(value, payload) => `${value} pcs - ${payload.rokok}`} />} cursor={{ fill: "#f5f5f5" }} />
              <Bar dataKey="qty" radius={[4, 4, 0, 0]} fill="#171717">
                <LabelList dataKey="qty" position="top" style={{ fill: "#525252", fontSize: 10, fontWeight: 600 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  )
}

function CompositionCard({ data }) {
  const composition = useMemo(() => foldLongTail(data), [data])
  const [activeIndex, setActiveIndex] = useState(null)
  const total = sumBy(composition, (item) => item.qty)
  const active = activeIndex !== null ? composition[activeIndex] : null

  return (
    <section className={`${CARD_CLS} flex h-full min-h-[360px] flex-col p-5`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-neutral-950">Komposisi Penjualan</h2>
          <p className="mt-0.5 text-xs text-neutral-500">Berdasarkan jumlah unit keluar</p>
        </div>
        <span className={CHIP_CLS}>{data.filter((item) => item.qty > 0).length} produk</span>
      </div>

      {composition.length === 0 ? (
        <div className="mt-4 flex-1">
          <EmptyChart />
        </div>
      ) : (
        <div className="mt-5 flex flex-1 flex-col gap-4 lg:flex-row lg:items-center">
          <div className="relative mx-auto h-[190px] w-[190px] shrink-0">
            <ResponsiveContainer width="100%" height={190}>
              <PieChart>
                <Pie
                  data={composition}
                  dataKey="qty"
                  nameKey="rokok"
                  cx="50%"
                  cy="50%"
                  innerRadius={62}
                  outerRadius={84}
                  paddingAngle={2}
                  stroke="none"
                  onMouseEnter={(_, index) => setActiveIndex(index)}
                  onMouseLeave={() => setActiveIndex(null)}
                >
                  {composition.map((entry, index) => (
                    <Cell key={entry.id} fill={CHART_COLORS[index % CHART_COLORS.length]} opacity={activeIndex !== null && activeIndex !== index ? 0.35 : 1} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip formatter={(value, payload) => `${value} pcs (${((value / total) * 100).toFixed(1)}%)`} />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
              <div>
                <div className="text-[10px] font-semibold uppercase text-neutral-400">{active ? "Pilihan" : "Total"}</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums text-neutral-950">{active ? `${((active.qty / total) * 100).toFixed(1)}%` : total}</div>
                <div className="text-[11px] text-neutral-400">{active ? `${active.qty} pcs` : "pcs"}</div>
              </div>
            </div>
          </div>

          <div className="min-w-0 flex-1 space-y-1.5 overflow-y-auto pr-1 lg:max-h-[260px]" onMouseLeave={() => setActiveIndex(null)}>
            {composition.map((item, index) => {
              const pct = total > 0 ? (item.qty / total) * 100 : 0
              const selected = activeIndex === index
              return (
                <button
                  type="button"
                  key={item.id}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={`w-full rounded-lg border px-2.5 py-2 text-left transition-colors ${
                    selected ? "border-neutral-300 bg-neutral-50" : "border-transparent hover:bg-neutral-50"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
                    <span className={`min-w-0 flex-1 truncate text-xs ${item.isOther ? "text-neutral-500" : "font-medium text-neutral-700"}`}>{item.rokok}</span>
                    <span className="font-mono text-xs font-semibold text-neutral-950">{pct.toFixed(1)}%</span>
                  </div>
                  <div className="mt-1.5 ml-5 flex items-center gap-2">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-neutral-100">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
                    </div>
                    <span className="w-12 text-right font-mono text-[10px] text-neutral-400">{item.qty} pcs</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}

function ProductOutgoingTable({ data }) {
  return (
    <section className={`${CARD_CLS} flex h-full flex-col p-5`}>
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-neutral-950">Rincian Keluar per Produk</h2>
        <p className="mt-0.5 text-xs text-neutral-500">Breakdown volume per saluran distribusi</p>
      </div>

      <div className="overflow-x-auto md:overflow-visible">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-neutral-100 text-neutral-400 uppercase tracking-wider font-semibold">
              <th className="py-3 pl-1">Produk</th>
              <th className="py-3 text-center">Langsung</th>
              <th className="py-3 text-center">Titip Jual</th>
              <th className="py-3 text-center">Tukar Brg</th>
              <th className="group relative py-3 text-center text-orange-600 cursor-default select-none">
                <span className="underline decoration-dashed decoration-orange-300 underline-offset-4">Proses</span>
                <div className="absolute left-1/2 bottom-full z-30 mb-2 hidden w-64 -translate-x-1/2 overflow-hidden rounded-xl border border-neutral-200 bg-white p-3.5 text-[11px] font-normal normal-case leading-relaxed text-neutral-600 shadow-2xl ring-1 ring-black/5 group-hover:block pointer-events-none">
                  <div className="mb-1.5 font-bold text-neutral-950">Apa itu Proses?</div>
                  Stok rokok yang **masih dibawa oleh Sales di lapangan** (belum terjual, belum dititipkan ke toko, dan belum dikembalikan ke gudang fisik).
                </div>
              </th>
              <th className="py-3 pr-1 text-center text-neutral-950 font-bold">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-50">
            {data.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-10 text-center text-neutral-400">Tidak ada data pergerakan barang.</td>
              </tr>
            ) : (
              data.map((row) => (
                <tr key={row.id} className="hover:bg-neutral-50 transition-colors">
                  <td className="py-3 pl-1 font-medium text-neutral-900">{row.nama}</td>
                  <td className="py-3 text-center tabular-nums text-neutral-600">{row.langsung || "-"}</td>
                  <td className="py-3 text-center tabular-nums text-neutral-600">{row.titipJual || "-"}</td>
                  <td className="py-3 text-center tabular-nums text-neutral-600">{row.tukarBarang || "-"}</td>
                  <td className="py-3 text-center tabular-nums font-medium text-orange-600 bg-orange-50/30">{row.sisa || "-"}</td>
                  <td className="py-3 pr-1 text-center tabular-nums font-bold text-neutral-950 bg-neutral-50/50">{row.total}</td>
                </tr>
              ))
            )}
          </tbody>
          {data.length > 0 && (
            <tfoot className="border-t-2 border-neutral-100 bg-neutral-50/30">
              <tr className="font-bold text-neutral-950">
                <td className="py-3 pl-1">TOTAL KESELURUHAN</td>
                <td className="py-3 text-center tabular-nums">{data.reduce((sum, r) => sum + r.langsung, 0)}</td>
                <td className="py-3 text-center tabular-nums">{data.reduce((sum, r) => sum + r.titipJual, 0)}</td>
                <td className="py-3 text-center tabular-nums">{data.reduce((sum, r) => sum + r.tukarBarang, 0)}</td>
                <td className="py-3 text-center tabular-nums text-orange-700 bg-orange-100/20">{data.reduce((sum, r) => sum + r.sisa, 0)}</td>
                <td className="py-3 pr-1 text-center tabular-nums bg-neutral-100/50">
                  {data.reduce((sum, r) => sum + r.total, 0)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  )
}


function DailyLine({ data, rangeLabel }) {
  const visibleData = data.filter((item) => item.setoran > 0)
  const chartData = visibleData.length > 0 ? data : []

  return (
    <section className={`${CARD_CLS} flex h-full flex-col p-5`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-neutral-950">Setoran Harian</h2>
          <p className="mt-0.5 text-xs text-neutral-500">Tren uang masuk pada {rangeLabel}</p>
        </div>
        <span className={CHIP_CLS}>{rangeLabel}</span>
      </div>

      <div className="mt-4 flex-1 min-h-[280px] min-w-0">
        {chartData.length === 0 ? (
          <EmptyChart />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData} margin={{ top: 20, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#f1f1f1" strokeDasharray="3 4" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#737373" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#737373" }} tickFormatter={(value) => compactIDR(value)} tickLine={false} axisLine={false} width={72} />
              <Tooltip content={<ChartTooltip formatter={(value) => fmtIDR(value)} />} />
              <Line
                type="monotone"
                dataKey="setoran"
                stroke="#171717"
                strokeWidth={2.5}
                dot={{ r: 4, fill: "#fff", stroke: "#171717", strokeWidth: 2 }}
                activeDot={{ r: 6, fill: "#fff", stroke: "#C97B2A", strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  )
}

export default function DashboardPage({ sesiList, titipJualList, rokokList }) {
  const [dateRange, setDateRange] = useState(defaultDateRange("minggu_ini"))
  const [localSesiList,     setLocalSesiList]     = useState(sesiList || [])
  const [localTitipJualList, setLocalTitipJualList] = useState(titipJualList || [])
  const [isFetchingRange,   setIsFetchingRange]   = useState(false)

  // Sync jika server push data baru (revalidate)
  useEffect(() => { setLocalSesiList(sesiList || []) }, [sesiList])
  useEffect(() => { setLocalTitipJualList(titipJualList || []) }, [titipJualList])

  // Fetch ulang data ketika filter tanggal berubah
  useEffect(() => {
    if (!dateRange?.start || !dateRange?.end) return
    setIsFetchingRange(true)
    
    // Fetch rentang waktu dari previousRange.start sampai dateRange.end 
    // agar perhitungan delta vs periode sebelumnya tidak error
    const prevRange = getPreviousRange(dateRange)
    const fetchStart = prevRange?.start || dateRange.start
    const fetchEnd = dateRange.end

    Promise.all([
      getSesiListByDateRange(fetchStart, fetchEnd),
      getTitipJualListByDateRange(fetchStart, fetchEnd),
    ])
      .then(([freshSesi, freshTitip]) => {
        setLocalSesiList(freshSesi)
        setLocalTitipJualList(freshTitip)
      })
      .catch((err) => console.error("[DashboardPage] fetch range error", err))
      .finally(() => setIsFetchingRange(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange?.start, dateRange?.end])

  const rokokById = useMemo(() => new Map((rokokList || []).map((rokok) => [rokok.id, rokok])), [rokokList])
  const previousRange = useMemo(() => getPreviousRange(dateRange), [dateRange])

  const sesiF = useMemo(() => filterByDateRange(localSesiList, dateRange), [localSesiList, dateRange])
  const titipJualF = useMemo(() => filterTitipSelesaiByRange(localTitipJualList, dateRange), [localTitipJualList, dateRange])

  const previousSesiF = useMemo(() => previousRange ? filterByDateRange(localSesiList, previousRange) : [], [localSesiList, previousRange])
  const previousTitipJualF = useMemo(() => previousRange ? filterTitipSelesaiByRange(localTitipJualList, previousRange) : [], [localTitipJualList, previousRange])

  const stats = useMemo(
    () => calculateStats(sesiF, titipJualF, localTitipJualList, rokokById, dateRange, isDateInRange),
    [sesiF, titipJualF, localTitipJualList, rokokById, dateRange]
  )
  const previousStats = useMemo(
    () => calculateStats(previousSesiF, previousTitipJualF, localTitipJualList, rokokById, previousRange, isDateInRange),
    [previousSesiF, previousTitipJualF, localTitipJualList, rokokById, previousRange]
  )

  const qtyPerRokok = useMemo(() => buildQtyPerRokok(sesiF, titipJualF, rokokList || []), [sesiF, titipJualF, rokokList])
  const qtyPositive = useMemo(() => qtyPerRokok.filter((item) => item.qty > 0).sort((a, b) => b.qty - a.qty), [qtyPerRokok])
  const dailySummary = useMemo(
    () => buildDailySummary(sesiF, titipJualF, localTitipJualList, rokokById, dateRange),
    [sesiF, titipJualF, localTitipJualList, rokokById, dateRange]
  )

  const rangeLabel = dateRange?.start && dateRange?.end ? `${fmtTanggal(dateRange.start)} s/d ${fmtTanggal(dateRange.end)}` : "Semua Waktu"
  const compareLabel = getCompareLabel(dateRange?.preset)

  const productQtyBreakdown = useMemo(
    () => buildProductQtyBreakdown(sesiF, titipJualF, rokokList || []),
    [sesiF, titipJualF, rokokList]
  )

  const sparkPenjualan = dailySummary.map((item) => item.penjualan)
  const sparkSetoran = dailySummary.map((item) => item.setoran)
  const sparkProfit = dailySummary.map((item) => item.profit)
  const sparkQty = dailySummary.map((item) => item.qty)

  const setoranBreakdown = useMemo(() => {
    const allSesiSetoran = (sesiF || []).flatMap((s) => s.setoran || [])
    const allTitipSetoran = (localTitipJualList || []).flatMap((t) => (t.setoran || []).filter((s) => isDateInRange(s.tanggal, dateRange)))

    const cashSesi = sumBy(allSesiSetoran.filter((s) => s.metode === "cash"), (s) => s.jumlah)
    const transferSesi = sumBy(allSesiSetoran.filter((s) => s.metode === "transfer"), (s) => s.jumlah)

    const cashTitip = sumBy(allTitipSetoran.filter((s) => s.metode === "cash"), (s) => s.jumlah)
    const transferTitip = sumBy(allTitipSetoran.filter((s) => s.metode === "transfer"), (s) => s.jumlah)

    return {
      cashSesi,
      transferSesi,
      cashTitip,
      transferTitip,
      total: cashSesi + transferSesi + cashTitip + transferTitip
    }
  }, [sesiF, localTitipJualList, dateRange])

  const profitBreakdown = useMemo(() => {
    const profitSesi = sumBy(sesiF, (sesi) => getSesiProfit(sesi, rokokById))
    const profitTitip = sumBy(titipJualF, (titip) => getTitipProfit(titip, rokokById))

    return {
      profitSesi,
      profitTitip,
      total: profitSesi + profitTitip
    }
  }, [sesiF, titipJualF, rokokById])

  return (
    <div className="space-y-5 text-neutral-950">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Ringkasan distribusi - <span className="font-medium text-neutral-700">{rangeLabel}</span>
          </p>
        </div>
        <DateFilterNew value={dateRange} onChange={setDateRange} />
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCardNew
          icon={ReceiptText}
          label="Total Penjualan"
          value={fmtIDR(stats.totalPenjualan)}
          subtitle={formatSetoranGap(stats.totalSetoran, stats.totalPenjualan)}
          delta={getDelta(stats.totalPenjualan, previousStats.totalPenjualan)}
          compareLabel={compareLabel}
          sparkValues={sparkPenjualan}
          color="#171717"
          tooltipContent={<SalesBreakdownTooltip breakdown={stats.penjualanBreakdown} totalSetoran={stats.totalSetoran} />}
        />
        <KpiCardNew
          icon={Wallet}
          label="Total Setoran"
          value={fmtIDR(stats.totalSetoran)}
          subtitle="Uang real masuk"
          delta={getDelta(stats.totalSetoran, previousStats.totalSetoran)}
          compareLabel={compareLabel}
          sparkValues={sparkSetoran}
          color="#5C7A8C"
          tooltipContent={<SetoranBreakdownTooltip breakdown={setoranBreakdown} />}
        />
        <KpiCardNew
          icon={TrendingUp}
          label="Total Profit"
          value={fmtIDR(stats.profit)}
          subtitle="Estimasi margin produk"
          delta={getDelta(stats.profit, previousStats.profit)}
          compareLabel={compareLabel}
          sparkValues={sparkProfit}
          color="#3F6B4A"
          tooltipContent={<ProfitBreakdownTooltip breakdown={profitBreakdown} />}
        />
        <KpiCardNew
          icon={Package}
          label="Barang Keluar"
          value={`${stats.totalKeluar} pcs`}
          subtitle={`${qtyPositive.length} produk aktif bergerak`}
          delta={getDelta(stats.totalKeluar, previousStats.totalKeluar)}
          compareLabel={compareLabel}
          sparkValues={sparkQty}
          color="#C97B2A"
          tooltipItems={qtyPositive}
        />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-7">
          <BarangKeluarChart data={qtyPerRokok} rangeLabel={rangeLabel} />
        </div>
        <div className="xl:col-span-5">
          <CompositionCard data={qtyPerRokok} />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-12">
          <DailyLine data={dailySummary} rangeLabel={rangeLabel} />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-8">
          <ProductOutgoingTable data={productQtyBreakdown} />
        </div>
        <div className="xl:col-span-4">
          <QtyBreakdownCard data={stats.qtyBreakdown} />
        </div>
      </section>

      <DebugSection stats={stats} sesiF={sesiF} titipJualF={titipJualF} rokokById={rokokById} range={dateRange} titipJualList={titipJualList} />
    </div>
  )
}

function DebugSection({ stats, sesiF, titipJualF, rokokById, range, titipJualList }) {
  // Setoran Breakdown
  const allSesiSetoran = (sesiF || []).flatMap((s) => s.setoran || [])
  const allTitipSetoran = (titipJualList || []).flatMap((t) => (t.setoran || []).filter((s) => isDateInRange(s.tanggal, range)))

  const cashSesi = sumBy(allSesiSetoran.filter((s) => s.metode === "cash"), (s) => s.jumlah)
  const transferSesi = sumBy(allSesiSetoran.filter((s) => s.metode === "transfer"), (s) => s.jumlah)

  const cashTitip = sumBy(allTitipSetoran.filter((s) => s.metode === "cash"), (s) => s.jumlah)
  const transferTitip = sumBy(allTitipSetoran.filter((s) => s.metode === "transfer"), (s) => s.jumlah)

  const profitSesi = sumBy(sesiF, (sesi) => getSesiProfit(sesi, rokokById))
  const profitTitip = sumBy(titipJualF, (titip) => getTitipProfit(titip, rokokById))

  return (
    <section className={`${CARD_CLS} overflow-hidden p-6 bg-neutral-50/80 border-dashed border-2`}>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-neutral-900 uppercase tracking-widest">Audit System: Rincian Kalkulasi Data</h2>
          <p className="text-[11px] text-neutral-500 mt-0.5">Memastikan setiap rupiah terhitung dengan benar dari sumbernya.</p>
        </div>
        <div className="flex gap-2">
          <span className="inline-flex items-center rounded-md bg-white px-2 py-1 text-[10px] font-medium text-neutral-600 ring-1 ring-inset ring-neutral-200">
            {sesiF.length} Sesi Terhitung
          </span>
          <span className="inline-flex items-center rounded-md bg-white px-2 py-1 text-[10px] font-medium text-neutral-600 ring-1 ring-inset ring-neutral-200">
            {titipJualF.length} Titip Jual Selesai
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Penjualan */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold text-neutral-900">
            <div className="h-4 w-1 bg-neutral-900 rounded-full" />
            OMZET PENJUALAN
          </div>
          <div className="space-y-2 text-[11px]">
            <div className="flex justify-between">
              <span className="text-neutral-500">Penjualan Langsung (Sesi)</span>
              <span className="font-mono font-semibold">{fmtIDR(stats.penjualanBreakdown.langsung)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Titip Jual (Selesai)</span>
              <span className="font-mono font-semibold">{fmtIDR(stats.penjualanBreakdown.titipJual)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Tukar Barang (Selisih)</span>
              <span className="font-mono font-semibold">{fmtIDR(stats.penjualanBreakdown.tukarBarang)}</span>
            </div>
            <div className="flex justify-between border-t border-neutral-200 pt-2 text-xs font-black text-neutral-950">
              <span>TOTAL OMZET</span>
              <span className="font-mono">{fmtIDR(stats.totalPenjualan)}</span>
            </div>
          </div>
        </div>

        {/* Setoran */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold text-neutral-900">
            <div className="h-4 w-1 bg-sky-600 rounded-full" />
            SETORAN (CASH & TRANSFER)
          </div>
          <div className="space-y-2 text-[11px]">
            <div className="rounded-lg bg-white/50 p-2 border border-neutral-100">
              <div className="text-[10px] font-bold text-neutral-400 mb-1">DARI SESI DISTRIBUSI</div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Cash</span>
                <span className="font-mono">{fmtIDR(cashSesi)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Transfer</span>
                <span className="font-mono">{fmtIDR(transferSesi)}</span>
              </div>
            </div>
            <div className="rounded-lg bg-white/50 p-2 border border-neutral-100">
              <div className="text-[10px] font-bold text-neutral-400 mb-1">DARI TITIP JUAL (PELUNASAN)</div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Cash</span>
                <span className="font-mono">{fmtIDR(cashTitip)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Transfer</span>
                <span className="font-mono">{fmtIDR(transferTitip)}</span>
              </div>
            </div>
            <div className="flex justify-between border-t border-neutral-200 pt-2 text-xs font-black text-neutral-950 px-1">
              <span>TOTAL SETORAN</span>
              <span className="font-mono">{fmtIDR(stats.totalSetoran)}</span>
            </div>
          </div>
        </div>

        {/* Profit */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold text-neutral-900">
            <div className="h-4 w-1 bg-emerald-600 rounded-full" />
            PROFIT (MARGIN KOTOR)
          </div>
          <div className="space-y-2 text-[11px]">
            <div className="flex justify-between">
              <span className="text-neutral-500">Profit Sesi (Terjual)</span>
              <span className="font-mono font-semibold">{fmtIDR(profitSesi)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Profit Titip (Selesai)</span>
              <span className="font-mono font-semibold">{fmtIDR(profitTitip)}</span>
            </div>
            <div className="mt-4 p-2 bg-emerald-50 rounded-lg text-emerald-900 border border-emerald-100">
              <div className="text-[9px] font-bold uppercase opacity-60">Info</div>
              <p className="leading-tight">Profit dihitung dari (Harga Jual - Harga Beli) produk yang keluar/terjual.</p>
            </div>
            <div className="flex justify-between border-t border-neutral-200 pt-2 text-xs font-black text-neutral-950">
              <span>ESTIMASI PROFIT</span>
              <span className="font-mono">{fmtIDR(stats.profit)}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
