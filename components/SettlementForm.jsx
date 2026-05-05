"use client"

import { useState } from "react"
import { AlertCircle, CheckCircle, Trash2 } from "lucide-react"
import { fmtIDR, fmtTanggal } from "@/lib/utils"
import { SelectInput, inputCls, IconButton, MoneyInput, Field, Button } from "@/components/ui"

const KATEGORI_COLOR = {
  grosir: "bg-violet-100 text-violet-700",
  toko: "bg-blue-100 text-blue-700",
}

function Badge({ label, colorClass }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colorClass}`}>
      {label}
    </span>
  )
}

export default function SettlementForm({ konsinyasi, initialSetoran, onSubmit, onCancel }) {
  const todayStr = new Date().toISOString().split("T")[0]
  const [tanggal,     setTanggal]     = useState(konsinyasi.tanggal_selesai || todayStr)
  const [items,       setItems]       = useState(
    konsinyasi.items.map((it) => ({
      ...it,
      qty_terjual: String(it.qty_terjual || ""),
      qty_kembali: String(it.qty_kembali || ""),
    }))
  )
  const [setoran,     setSetoran]     = useState(
    initialSetoran?.length
      ? initialSetoran.map((s) => ({ metode: s.metode, jumlah: String(s.jumlah) }))
      : [{ metode: "cash", jumlah: "" }]
  )
  const [setoranAuto, setSetoranAuto] = useState(false)
  const [loading,     setLoading]     = useState(false)

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
  const hasError     = items.some((it) => (Number(it.qty_terjual) || 0) > it.qty_keluar)
  const hasTerjual   = items.some((it) => Number(it.qty_terjual) > 0)
  const hasSetoran   = totalSetoran > 0

  const handleSetoranAuto = (checked) => {
    setSetoranAuto(checked)
    if (checked && nilaiTerjual > 0) {
      setSetoran([{ metode: setoran[0]?.metode || "cash", jumlah: String(nilaiTerjual) }])
    }
  }

  const handleSubmit = async () => {
    if (hasError) return
    setLoading(true)
    try {
      await onSubmit({
        tanggal,
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
    <div className="space-y-6 text-sm">
      {/* SECTION 1: Informasi Transaksi */}
      <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-4 space-y-4">
        <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">Informasi Transaksi</h3>
          <Badge label={konsinyasi.kategori} colorClass={KATEGORI_COLOR[konsinyasi.kategori] || "bg-neutral-100 text-neutral-600"} />
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1">
            <p className="text-[10px] uppercase font-bold text-neutral-400">Sales</p>
            <p className="font-semibold text-neutral-900">{konsinyasi.sales}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] uppercase font-bold text-neutral-400">Toko / Customer</p>
            <p className="font-semibold text-neutral-900">{konsinyasi.nama_toko}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] uppercase font-bold text-neutral-400">Jatuh Tempo</p>
            <p className={`font-semibold ${konsinyasi.selisihHari <= 0 ? "text-red-600" : "text-neutral-900"}`}>
              {fmtTanggal(konsinyasi.tanggal_jatuh_tempo)}
            </p>
          </div>
        </div>
      </div>

      {/* SECTION: Tanggal Selesai */}
      <div className="rounded-xl border border-blue-100 bg-blue-50/30 p-4">
        <Field label="Tanggal Selesai Penagihan" className="w-full">
          <input 
            type="date" 
            value={tanggal} 
            onChange={(e) => setTanggal(e.target.value)} 
            className={inputCls + " w-full bg-white shadow-sm font-semibold text-blue-700 focus:border-blue-500 focus:ring-blue-500"} 
          />
        </Field>
      </div>

      {/* SECTION 2: Barang & Penjualan */}
      <div className="rounded-xl border border-neutral-200 bg-white p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">Daftar Barang Terjual</h3>
          <span className="text-xs text-neutral-400 font-medium">{items.length} jenis rokok</span>
        </div>

        <div className="overflow-hidden rounded-lg border border-neutral-100">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-neutral-50 text-neutral-500 border-b border-neutral-100">
                <th className="px-3 py-2 text-left font-semibold">Rokok</th>
                <th className="px-3 py-2 text-center font-semibold">Keluar</th>
                <th className="px-3 py-2 text-center font-semibold">Terjual</th>
                <th className="px-3 py-2 text-center font-semibold">Kembali</th>
                <th className="px-3 py-2 text-right font-semibold">Nilai</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {items.map((it, idx) => {
                const terjual  = Number(it.qty_terjual) || 0
                const overflow = terjual > it.qty_keluar
                return (
                  <tr key={idx} className="hover:bg-neutral-50/50 transition-colors">
                    <td className="px-3 py-2.5 font-medium text-neutral-700">{it.rokok}</td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-neutral-600">{it.qty_keluar}</td>
                    <td className="px-3 py-2.5 text-center">
                      <div className="flex justify-center">
                        <input
                          type="number" min="0" max={it.qty_keluar}
                          value={it.qty_terjual}
                          onChange={(e) => updateItem(idx, "qty_terjual", e.target.value)}
                          className={inputCls + " w-16 h-8 text-center text-xs" + (overflow ? " border-red-400 bg-red-50" : "")}
                          placeholder="0"
                        />
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-neutral-400">
                      {Math.max(0, it.qty_keluar - terjual)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-bold text-neutral-900">{fmtIDR(terjual * it.harga)}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-neutral-900 text-white font-bold">
                <td colSpan={4} className="px-3 py-2 text-right uppercase tracking-wider text-[10px]">Total Nilai Terjual</td>
                <td className="px-3 py-2 text-right tabular-nums text-sm">{fmtIDR(nilaiTerjual)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        
        {hasError && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 animate-pulse">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Jumlah terjual tidak boleh melebihi jumlah keluar. Mohon koreksi inputan Anda.
          </div>
        )}
      </div>

      {/* SECTION 3: Setoran & Pembayaran */}
      <div className={`rounded-xl border transition-all duration-300 p-4 space-y-4 ${!hasTerjual ? "bg-neutral-50/80 border-dashed opacity-75" : "bg-white border-neutral-200"}`}>
        <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">Laporan Setoran</h3>
            {!hasTerjual && (
              <span className="flex items-center gap-1 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-bold uppercase">
                <AlertCircle className="h-3 w-3" /> Input Terjual Dahulu
              </span>
            )}
          </div>
          
          <label className={`flex items-center gap-2 text-xs font-medium transition-colors ${!hasTerjual ? "text-neutral-300 pointer-events-none" : "text-neutral-600 cursor-pointer"}`}>
            <input
              type="checkbox"
              checked={setoranAuto}
              onChange={(e) => handleSetoranAuto(e.target.checked)}
              disabled={!hasTerjual}
              className="h-4 w-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-500"
            />
            Otomatis sesuai nilai terjual
          </label>
        </div>

        <div className="space-y-3">
          {setoran.map((st, idx) => (
            <div key={idx} className="flex items-center gap-3">
              <div className="w-40">
                <SelectInput
                  value={st.metode}
                  onChange={(e) => setSetoran(setoran.map((s, i) => i === idx ? { ...s, metode: e.target.value } : s))}
                  disabled={setoranAuto || !hasTerjual}
                >
                  <option value="cash">Uang Tunai (Cash)</option>
                  <option value="transfer">Transfer Bank</option>
                </SelectInput>
              </div>
              <div className="flex-1 relative">
                <MoneyInput
                  value={st.jumlah}
                  onChange={(raw) => setSetoran(setoran.map((s, i) => i === idx ? { ...s, jumlah: raw } : s))}
                  placeholder="0"
                  className={inputCls + " w-full font-semibold" + (setoranAuto || !hasTerjual ? " bg-neutral-50 text-neutral-400" : "")}
                  disabled={setoranAuto || !hasTerjual}
                />
              </div>
              {setoran.length > 1 && !setoranAuto && hasTerjual && (
                <IconButton icon={Trash2} onClick={() => setSetoran(setoran.filter((_, i) => i !== idx))} variant="danger" label="Hapus" />
              )}
            </div>
          ))}
          
          {!setoranAuto && hasTerjual && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSetoran([...setoran, { metode: "transfer", jumlah: "" }])}
              className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-2"
            >
              + Tambah Metode Setoran
            </Button>
          )}
        </div>

        {totalSetoran > 0 && (
          <div className={`mt-2 flex items-center justify-between rounded-xl border px-4 py-3 transition-all ${flagSelisih ? "border-red-200 bg-red-50 text-red-700" : "border-green-200 bg-green-50 text-green-700"}`}>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] uppercase font-bold opacity-70">Total Setoran Diterima</span>
              <div className="flex items-center gap-1.5 text-sm font-bold">
                {flagSelisih ? <AlertCircle className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                {fmtIDR(totalSetoran)}
              </div>
            </div>
            {flagSelisih && (
              <div className="text-right">
                <p className="text-[10px] uppercase font-bold opacity-70">Selisih Penagihan</p>
                <p className="font-bold text-sm">{fmtIDR(Math.abs(nilaiTerjual - totalSetoran))}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4 border-t border-neutral-100">
        <Button variant="secondary" onClick={onCancel} disabled={loading} className="px-6">
          Batal
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={hasError || !hasTerjual || !hasSetoran}
          loading={loading}
          className="px-8 shadow-md"
        >
          Konfirmasi Selesaikan Titip Jual
        </Button>
      </div>
    </div>
  )
}
