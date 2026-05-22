"use client"

import { useState } from "react"
import { AlertCircle, CheckCircle, Trash2, RefreshCw } from "lucide-react"
import { fmtIDR, fmtTanggal, getJakartaToday } from "@/lib/utils"
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
  const todayStr = getJakartaToday()
  const [tanggal,     setTanggal]     = useState(konsinyasi.tanggal_selesai || "")
  const [perpanjangTanggal, setPerpanjangTanggal] = useState("")
  const [items,       setItems]       = useState(
    konsinyasi.items.map((it) => ({
      ...it,
      action: "bayar", // "bayar" | "perpanjang"
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

  const itemsBayar      = items.filter((it) => it.action === "bayar")
  const itemsPerpanjang = items.filter((it) => it.action === "perpanjang")
  const hasPerpanjang   = itemsPerpanjang.length > 0
  const hasAllPerpanjang = itemsPerpanjang.length === items.length

  const updateItem = (idx, field, val) =>
    setItems(items.map((it, i) => {
      if (i !== idx) return it
      const updated = { ...it, [field]: val }
      if (field === "qty_terjual") {
        const terjual = Number(val) || 0
        updated.qty_kembali = String(Math.max(0, it.qty_keluar - terjual))
      }
      if (field === "action" && val === "perpanjang") {
        updated.qty_terjual = ""
        updated.qty_kembali = ""
      }
      return updated
    }))

  const nilaiTerjual = itemsBayar.reduce((s, it) => s + (Number(it.qty_terjual) || 0) * it.harga, 0)
  const totalSetoran = setoran.reduce((s, it) => s + (Number(it.jumlah) || 0), 0)
  const flagSelisih  = nilaiTerjual > 0 && totalSetoran !== nilaiTerjual
  const hasError     = itemsBayar.some((it) => (Number(it.qty_terjual) || 0) > it.qty_keluar)
  const hasTerjual   = itemsBayar.some((it) => Number(it.qty_terjual) > 0)
  const hasSetoran   = totalSetoran > 0
  // Kalau tidak ada yang terjual (nilaiTerjual = 0), setoran tidak wajib
  const setoranValid = nilaiTerjual === 0 || hasSetoran

  const canSubmit = !hasError &&
    !hasAllPerpanjang &&
    !!tanggal &&
    setoranValid &&
    (!hasPerpanjang || !!perpanjangTanggal)

  const handleSetoranAuto = (checked) => {
    setSetoranAuto(checked)
    if (checked && nilaiTerjual > 0) {
      setSetoran([{ metode: setoran[0]?.metode || "cash", jumlah: String(nilaiTerjual) }])
    }
  }

  const handleSubmit = async () => {
    if (!canSubmit) return
    setLoading(true)
    try {
      await onSubmit({
        tanggal,
        perpanjang_tanggal: perpanjangTanggal || null,
        items: items.map((it) => {
          const terjual = it.action === "bayar" ? (Number(it.qty_terjual) || 0) : 0
          const kembali = it.action === "bayar" ? Math.max(0, it.qty_keluar - terjual) : 0
          return {
            id:          it.id,
            rokok_id:    it.rokok_id,
            action:      it.action,
            qty_terjual: terjual,
            qty_kembali: kembali,
          }
        }),
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

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="space-y-1">
            <p className="text-[10px] uppercase font-bold text-neutral-400">Sales</p>
            <p className="font-semibold text-neutral-900">{konsinyasi.sales}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] uppercase font-bold text-neutral-400">Toko / Customer</p>
            <p className="font-semibold text-neutral-900">{konsinyasi.nama_toko}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] uppercase font-bold text-neutral-400">Tgl Distribusi</p>
            <p className="font-semibold text-neutral-900">{fmtTanggal(konsinyasi.tanggal_distribusi) || "—"}</p>
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
      <div className={`rounded-xl border p-5 transition-all duration-300 ${
        !tanggal 
          ? "bg-red-50 border-red-200 shadow-[0_0_15px_rgba(239,68,68,0.1)]" 
          : "bg-blue-50 border-blue-200"
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <label className={`text-xs font-bold uppercase tracking-wider ${!tanggal ? "text-red-600" : "text-blue-700"}`}>
              Tanggal Selesai Penagihan (Wajib)
            </label>
            <p className="text-[11px] text-neutral-500 italic">
              Pilih tanggal saat transaksi ini dianggap selesai/lunas ditagih.
            </p>
          </div>
          <div className="w-full sm:w-64 relative">
            <input
              type="date"
              value={tanggal}
              onChange={(e) => setTanggal(e.target.value)}
              className={inputCls + ` w-full h-12 text-base bg-white shadow-sm font-bold transition-all ${
                !tanggal 
                  ? "border-red-400 text-red-600 focus:border-red-500 focus:ring-red-500" 
                  : "border-blue-400 text-blue-700 focus:border-blue-500 focus:ring-blue-500"
              }`}
              required
            />
            {!tanggal && (
              <div className="absolute -bottom-5 left-0 flex items-center gap-1 text-[10px] text-red-500 font-bold uppercase">
                <AlertCircle className="h-3 w-3" /> Mohon Pilih Tanggal!
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 2: Barang & Penjualan */}
      <div className="rounded-xl border border-neutral-200 bg-white p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">Daftar Barang</h3>
          <span className="text-xs text-neutral-400 font-medium">{items.length} jenis rokok</span>
        </div>

        <div className="overflow-hidden rounded-lg border border-neutral-100">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-neutral-50 text-neutral-500 border-b border-neutral-100">
                <th className="px-3 py-2 text-left font-semibold">Rokok</th>
                <th className="px-3 py-2 text-center font-semibold">Keluar</th>
                <th className="px-3 py-2 text-center font-semibold w-28">Aksi</th>
                <th className="px-3 py-2 text-center font-semibold">Terjual</th>
                <th className="px-3 py-2 text-center font-semibold">Kembali</th>
                <th className="px-3 py-2 text-right font-semibold">Nilai</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {items.map((it, idx) => {
                const terjual  = Number(it.qty_terjual) || 0
                const overflow = it.action === "bayar" && terjual > it.qty_keluar
                const isPerpanjang = it.action === "perpanjang"
                return (
                  <tr key={idx} className={`transition-colors ${isPerpanjang ? "bg-amber-50/50" : "hover:bg-neutral-50/50"}`}>
                    <td className="px-3 py-2.5 font-medium text-neutral-700">{it.rokok}</td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-neutral-600">{it.qty_keluar}</td>
                    <td className="px-3 py-2.5 text-center">
                      <div className="flex gap-1 justify-center">
                        <button
                          type="button"
                          onClick={() => updateItem(idx, "action", "bayar")}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                            !isPerpanjang
                              ? "bg-green-600 text-white"
                              : "bg-neutral-100 text-neutral-500 hover:bg-green-50"
                          }`}
                        >
                          Bayar
                        </button>
                        <button
                          type="button"
                          onClick={() => updateItem(idx, "action", "perpanjang")}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                            isPerpanjang
                              ? "bg-amber-500 text-white"
                              : "bg-neutral-100 text-neutral-500 hover:bg-amber-50"
                          }`}
                        >
                          Perpanjang
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {isPerpanjang ? (
                        <span className="text-amber-500 font-semibold text-[10px] uppercase tracking-wide">—</span>
                      ) : (
                        <div className="flex justify-center">
                          <input
                            type="number" min="0" max={it.qty_keluar}
                            value={it.qty_terjual}
                            onChange={(e) => updateItem(idx, "qty_terjual", e.target.value)}
                            className={inputCls + " w-16 h-8 text-center text-xs" + (overflow ? " border-red-400 bg-red-50" : "")}
                            placeholder="0"
                          />
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-neutral-400">
                      {isPerpanjang ? (
                        <span className="text-amber-500 font-semibold text-[10px]">—</span>
                      ) : (
                        Math.max(0, it.qty_keluar - terjual)
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-bold text-neutral-900">
                      {isPerpanjang ? (
                        <span className="text-amber-500 text-[10px] font-semibold">Perpanjang</span>
                      ) : (
                        fmtIDR(terjual * it.harga)
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-neutral-900 text-white font-bold">
                <td colSpan={5} className="px-3 py-2 text-right uppercase tracking-wider text-[10px]">Total Nilai Terjual</td>
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

        {hasAllPerpanjang && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Semua barang diperpanjang. Minimal satu barang harus dibayar untuk menyelesaikan titip jual.
          </div>
        )}
      </div>

      {/* SECTION: Tanggal Perpanjang (muncul kalau ada yg perpanjang) */}
      {hasPerpanjang && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 space-y-3">
          <div className="flex items-center gap-2 border-b border-amber-200 pb-2">
            <RefreshCw className="h-4 w-4 text-amber-600" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-700">
              Perpanjang {itemsPerpanjang.length} Item
            </h3>
          </div>
          <p className="text-xs text-amber-700">
            Item yang diperpanjang ({itemsPerpanjang.map(it => it.rokok).join(", ")}) akan dibuatkan titip jual baru dengan jatuh tempo baru.
          </p>
          <Field label="Jatuh Tempo Baru (wajib diisi)" className="w-full">
            <input
              type="date"
              value={perpanjangTanggal}
              onChange={(e) => setPerpanjangTanggal(e.target.value)}
              min={todayStr}
              className={inputCls + " w-full bg-white " + (!perpanjangTanggal ? "border-amber-400 focus:border-amber-500 focus:ring-amber-500" : "")}
              required
            />
          </Field>
          {hasPerpanjang && !perpanjangTanggal && (
            <p className="text-xs text-amber-600 font-medium">Masukkan tanggal jatuh tempo baru untuk item perpanjang.</p>
          )}
        </div>
      )}

      {/* SECTION 3: Setoran & Pembayaran */}
      <div className={`rounded-xl border transition-all duration-300 p-4 space-y-4 ${nilaiTerjual === 0 ? "bg-neutral-50/80 border-dashed opacity-75" : "bg-white border-neutral-200"}`}>
        <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">Laporan Setoran</h3>
            {nilaiTerjual === 0 && (
              <span className="flex items-center gap-1 text-[10px] bg-neutral-200 text-neutral-500 px-1.5 py-0.5 rounded-full font-bold uppercase">
                Tidak Ada Setoran (Rp 0)
              </span>
            )}
          </div>

          <label className={`flex items-center gap-2 text-xs font-medium transition-colors ${nilaiTerjual === 0 ? "text-neutral-300 pointer-events-none" : "text-neutral-600 cursor-pointer"}`}>
            <input
              type="checkbox"
              checked={setoranAuto}
              onChange={(e) => handleSetoranAuto(e.target.checked)}
              disabled={nilaiTerjual === 0}
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
                  disabled={setoranAuto || nilaiTerjual === 0}
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
                  className={inputCls + " w-full font-semibold" + (setoranAuto || nilaiTerjual === 0 ? " bg-neutral-50 text-neutral-400" : "")}
                  disabled={setoranAuto || nilaiTerjual === 0}
                />
              </div>
              {setoran.length > 1 && !setoranAuto && nilaiTerjual > 0 && (
                <IconButton icon={Trash2} onClick={() => setSetoran(setoran.filter((_, i) => i !== idx))} variant="danger" label="Hapus" />
              )}
            </div>
          ))}

          {!setoranAuto && nilaiTerjual > 0 && (
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
          disabled={!canSubmit}
          loading={loading}
          className={`px-8 shadow-md transition-all ${
            !tanggal 
              ? "bg-neutral-300 cursor-not-allowed opacity-50" 
              : "bg-blue-600 hover:bg-blue-700"
          }`}
        >
          {!tanggal 
            ? "Pilih Tanggal Selesai..." 
            : hasPerpanjang
              ? `Selesaikan & Perpanjang ${itemsPerpanjang.length} Item`
              : "Konfirmasi Selesaikan Titip Jual"}
        </Button>
      </div>
    </div>
  )
}
