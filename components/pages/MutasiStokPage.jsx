"use client"

import { useState, Fragment } from "react"
import { usePathname } from "next/navigation"
import { Calendar, ChevronDown, ChevronUp, Box, ArrowLeft, ArrowUpRight, ArrowDownLeft, RotateCcw, Info } from "lucide-react"
import { fmtIDR } from "@/lib/utils"
import { Card, PageHeader, Field, Button, IconButton, DateFilter, inputCls } from "@/components/ui"
import { useLoading } from "@/components/LoadingProvider"

export default function MutasiStokPage({ initialData, startDate, endDate, initialPreset, initialStockType }) {
  const pathname = usePathname()
  const { isPending, navigate } = useLoading()
  const [filter, setFilter] = useState({
    preset: initialPreset || "hari_ini",
    start: startDate,
    end: endDate,
    stock_type: initialStockType || "utama"
  })
  const [expandedDate, setExpandedDate] = useState(initialData[0]?.tanggal || null)
  const [expandedRokok, setExpandedRokok] = useState([]) // Array of "tanggal-rokok_id"
  const [showGuide, setShowGuide] = useState(false)

  const formatDate = (dateString) => {
    const d = new Date(dateString)
    const formatter = new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
    return formatter.format(d).replace(/\./g, ':') // Some browsers use '.' for time
  }

  const getSourceBadgeColor = (source) => {
    switch (source) {
      case 'stok_awal': return 'bg-blue-100 text-blue-700 border-blue-200'
      case 'penjualan': return 'bg-emerald-100 text-emerald-700 border-emerald-200'
      case 'distribusi_sales': return 'bg-orange-100 text-orange-700 border-orange-200'
      case 'retur_sales':
      case 'retur': return 'bg-purple-100 text-purple-700 border-purple-200'
      case 'koreksi': return 'bg-yellow-100 text-yellow-700 border-yellow-200'
      case 'konsinyasi_keluar': return 'bg-indigo-100 text-indigo-700 border-indigo-200'
      case 'konsinyasi_kembali': return 'bg-teal-100 text-teal-700 border-teal-200'
      case 'revert': return 'bg-red-100 text-red-700 border-red-200'
      default: return 'bg-neutral-100 text-neutral-700 border-neutral-200'
    }
  }

  const formatSource = (source) => {
    if (!source) return '-'
    let text = source.replace('konsinyasi', 'titip_jual')
    return text.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  }

  const getDefaultKeterangan = (source) => {
    switch (source) {
      case 'stok_awal':             return 'Inisialisasi stok awal'
      case 'supplier':              return 'Penambahan stok dari supplier'
      case 'koreksi':               return 'Koreksi stok manual'
      case 'adjustment':            return 'Penyesuaian stok'
      case 'distribusi_sales':      return 'Distribusi barang ke sales'
      case 'retur_sales':           return 'Barang kembali dari sales'
      case 'konsinyasi_keluar':     return 'Barang keluar titip jual'
      case 'konsinyasi_kembali':    return 'Barang kembali titip jual'
      case 'penjualan':             return 'Transaksi penjualan'
      case 'penjualan_sample':      return 'Transaksi penjualan sample'
      case 'retur':                 return 'Retur barang dari toko/pelanggan'
      case 'tukar_masuk':           return 'Tukar barang (Masuk)'
      case 'tukar_keluar':          return 'Tukar barang (Keluar)'
      case 'sample_cukai_konversi': return 'Konversi stok reguler & sample cukai'
      case 'revert':                return 'Pembatalan transaksi (revert)'
      case 'sample_biasa_masuk':    return 'Penerimaan sample biasa'
      case 'sample_biasa_keluar':   return 'Pengurangan sample biasa'
      default:                      return 'Mutasi stok'
    }
  }

  const toggleRokok = (id) => {
    setExpandedRokok(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
  }

  const handleFilterChange = (newVal) => {
    const updated = { ...filter, ...newVal }
    setFilter(updated)
    navigate(`/rokok/mutasi?start=${updated.start}&end=${updated.end}&preset=${updated.preset}&stock_type=${updated.stock_type}`)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 -mb-2">
        <IconButton 
          icon={ArrowLeft} 
          onClick={() => {
            navigate("/rokok")
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
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Tipe:</span>
              <select 
                value={filter.stock_type}
                onChange={(e) => handleFilterChange({ stock_type: e.target.value })}
                className={inputCls + " !py-1.5 !text-xs min-w-[140px]"}
              >
                <option value="utama">Stok Utama</option>
                <option value="jual">Stok Jual</option>
                <option value="sample_cukai">Sample Cukai</option>
                <option value="sample_biasa">Sample Biasa</option>
              </select>
            </div>
            <DateFilter 
              value={filter} 
              onChange={handleFilterChange} 
            />
          </div>
        }
      />

      {/* Enhanced Info Legend (Collapsible - Same Style as Daily Rows) */}
      <div className="group">
        <button 
          onClick={() => setShowGuide(!showGuide)}
          className={`w-full flex items-center justify-between px-5 py-3 bg-white border border-neutral-200 rounded-xl shadow-sm transition-all hover:border-blue-200 ${showGuide ? 'ring-2 ring-blue-500/10 border-blue-500' : ''}`}
        >
          <div className="flex items-center gap-4">
            <div className={`h-10 w-10 rounded-lg flex items-center justify-center transition-colors ${showGuide ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-600'}`}>
              <Info className="h-5 w-5" />
            </div>
            <div className="text-left">
              <p className="font-semibold text-neutral-900">Panduan Mutasi Stok</p>
              <p className="text-[10px] text-neutral-500">Klik untuk melihat maksud dari Awal, Masuk, Keluar, dan Akhir</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {showGuide ? <ChevronUp className="h-5 w-5 text-neutral-400" /> : <ChevronDown className="h-5 w-5 text-neutral-400" />}
          </div>
        </button>
        
        {showGuide && (
          <div className="mt-2 mx-2 p-3 bg-white border border-neutral-200 rounded-xl shadow-sm animate-in fade-in slide-in-from-top-1 duration-200">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-neutral-400" />
                  <p className="text-[10px] font-bold text-neutral-800 uppercase tracking-tight">Stok Awal</p>
                </div>
                <p className="text-[9px] text-neutral-500 leading-tight italic">
                  Saldo barang di gudang pada <b>pagi hari</b>.
                </p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-emerald-500" />
                  <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-tight">Total Masuk</p>
                </div>
                <p className="text-[9px] text-neutral-500 leading-tight italic">
                  Barang dari Supplier, Retur Sales, & Koreksi (+).
                </p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-red-500" />
                  <p className="text-[10px] font-bold text-red-600 uppercase tracking-tight">Total Keluar</p>
                </div>
                <p className="text-[9px] text-neutral-500 leading-tight italic">
                  Distribusi Sales, Penjualan, & Koreksi (-).
                </p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-blue-500" />
                  <p className="text-[10px] font-bold text-blue-600 uppercase tracking-tight">Stok Akhir</p>
                </div>
                <p className="text-[9px] text-neutral-500 leading-tight italic">
                  Saldo sisa di <b>sore hari</b> (Awal + Masuk - Keluar).
                </p>
              </div>
            </div>
            
            <div className="mt-3 pt-2 border-t border-dashed border-neutral-100 flex items-center gap-2">
              <span className="text-[8px] font-bold text-blue-500 uppercase bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">Audit Log</span>
              <p className="text-[9px] text-neutral-400 italic">
                Klik <b>Baris Nama Rokok</b> di bawah untuk melihat detail waktu & user yang melakukan mutasi.
              </p>
            </div>
          </div>
        )}
      </div>

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
                        <Fragment key={row.rokok_id}>
                          <tr 
                            onClick={() => toggleRokok(`${day.tanggal}-${row.rokok_id}`)}
                            className="hover:bg-white transition-colors cursor-pointer group/row"
                          >
                            <td className="px-4 py-3 font-medium text-neutral-900">
                              <div className="flex items-center gap-2">
                                {expandedRokok.includes(`${day.tanggal}-${row.rokok_id}`) ? <ChevronUp className="w-4 h-4 text-neutral-400" /> : <ChevronDown className="w-4 h-4 text-neutral-400 group-hover/row:text-emerald-500" />}
                                {row.nama}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-neutral-500">{row.awal}</td>
                            <td className="px-4 py-3 text-right tabular-nums">
                              <span className="text-emerald-600 font-semibold">+{row.masuk}</span>
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-red-600 font-semibold">-{row.keluar}</td>
                            <td className="px-4 py-3 text-right tabular-nums font-bold text-neutral-900 bg-neutral-100/30">{row.akhir}</td>
                          </tr>
                          
                          {/* DETAIL AUDIT LOG */}
                          {expandedRokok.includes(`${day.tanggal}-${row.rokok_id}`) && (
                            <tr>
                              <td colSpan={6} className="p-0 bg-neutral-50/50 border-b border-neutral-200">
                                <div className="px-8 py-4 animate-in slide-in-from-top-2 duration-200">
                                  <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">Detail Mutasi (Audit Log)</h4>
                                  {row.details && row.details.length > 0 ? (
                                    <div className="border border-neutral-200 rounded-lg overflow-hidden bg-white shadow-sm">
                                      <table className="w-full text-xs">
                                        <thead className="bg-neutral-100/50 text-neutral-500">
                                          <tr>
                                            <th className="px-3 py-2 text-left font-medium">Waktu</th>
                                            <th className="px-3 py-2 text-left font-medium">User</th>
                                            <th className="px-3 py-2 text-left font-medium">Sales</th>
                                            <th className="px-3 py-2 text-left font-medium">Source</th>
                                            <th className="px-3 py-2 text-left font-medium">Keterangan</th>
                                            <th className="px-3 py-2 text-right font-medium">Qty</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-neutral-100">
                                          {row.details.map((mut) => (
                                            <tr key={mut.id} className="hover:bg-neutral-50">
                                              <td className="px-3 py-2 text-neutral-600 whitespace-nowrap">{formatDate(mut.createdAt)}</td>
                                              <td className="px-3 py-2 text-neutral-900 font-medium">
                                                {mut.user_name || mut.user?.name || mut.user?.username || 'Sistem'}
                                              </td>
                                              <td className="px-3 py-2 text-blue-600 font-bold">
                                                {mut.sales_name || '-'}
                                              </td>
                                              <td className="px-3 py-2">
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-semibold tracking-wide ${getSourceBadgeColor(mut.source)}`}>
                                                  {formatSource(mut.source)}
                                                </span>
                                              </td>
                                              <td className="px-3 py-2 text-neutral-500 max-w-xs truncate" title={mut.keterangan || getDefaultKeterangan(mut.source)}>
                                                {mut.keterangan || getDefaultKeterangan(mut.source)}
                                              </td>
                                              <td className="px-3 py-2 text-right font-semibold tabular-nums">
                                                <span className={mut.jenis === 'in' ? 'text-emerald-600' : 'text-red-600'}>
                                                  {mut.jenis === 'in' ? '+' : '-'}{mut.qty}
                                                </span>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  ) : (
                                    <p className="text-xs text-neutral-500 italic">Tidak ada detail mutasi tercatat (Data lama).</p>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>

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
