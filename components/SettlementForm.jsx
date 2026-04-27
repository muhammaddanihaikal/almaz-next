"use client"

import { useState } from "react"
import { AlertCircle, CheckCircle, Trash2 } from "lucide-react"
import { fmtIDR, fmtTanggal } from "@/lib/utils"
import { SelectInput, inputCls, IconButton, MoneyInput, Field } from "@/components/ui"

const KATEGORI_COLOR = {
  grosir: "bg-violet-100 text-violet-700",
  toko:   "bg-blue-100 text-blue-700",
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
    <div className="space-y-5 text-sm">
      {/* Info */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div><p className="text-neutral-500">Sales</p><p className="font-medium">{konsinyasi.sales}</p></div>
        <div><p className="text-neutral-500">Toko</p><p className="font-medium">{konsinyasi.nama_toko}</p></div>
        <div>
          <p className="text-neutral-500">Jatuh Tempo</p>
          <p className={`font-medium ${konsinyasi.selisihHari <= 0 ? "text-red-600" : ""}`}>
            {fmtTanggal(konsinyasi.tanggal_jatuh_tempo)}
          </p>
        </div>
        <div>
          <p className="text-neutral-500">Kategori</p>
          <Badge label={konsinyasi.kategori} colorClass={KATEGORI_COLOR[konsinyasi.kategori] || "bg-neutral-100 text-neutral-600"} />
        </div>
        <div className="col-span-2">
          <Field label="Tanggal Selesai">
            <input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} className={inputCls} />
          </Field>
        </div>
      </div>

      {/* Tabel barang */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">Barang</p>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-neutral-200 text-neutral-500">
              <th className="pb-1.5 text-left">Rokok</th>
              <th className="pb-1.5 text-right">Keluar</th>
              <th className="pb-1.5 text-right">Harga</th>
              <th className="pb-1.5 text-right">Terjual</th>
              <th className="pb-1.5 text-right">Kembali</th>
              <th className="pb-1.5 text-right">Nilai</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => {
              const terjual  = Number(it.qty_terjual) || 0
              const overflow = terjual > it.qty_keluar
              return (
                <tr key={idx} className="border-b border-neutral-100">
                  <td className="py-2">{it.rokok}</td>
                  <td className="py-2 text-right tabular-nums">{it.qty_keluar}</td>
                  <td className="py-2 text-right tabular-nums">{fmtIDR(it.harga)}</td>
                  <td className="py-2 text-right">
                    <input
                      type="number" min="0" max={it.qty_keluar}
                      value={it.qty_terjual}
                      onChange={(e) => updateItem(idx, "qty_terjual", e.target.value)}
                      className={inputCls + " w-20 text-right" + (overflow ? " border-red-400" : "")}
                      placeholder="0"
                    />
                  </td>
                  <td className="py-2 text-right tabular-nums text-neutral-600">
                    {Math.max(0, it.qty_keluar - terjual)}
                  </td>
                  <td className="py-2 text-right tabular-nums font-medium">{fmtIDR(terjual * it.harga)}</td>
                </tr>
              )
            })}
            <tr className="border-t-2 border-neutral-200 font-semibold text-xs">
              <td colSpan={5} className="py-1.5">Total Nilai Terjual</td>
              <td className="py-1.5 text-right tabular-nums">{fmtIDR(nilaiTerjual)}</td>
            </tr>
          </tbody>
        </table>
        {hasError && (
          <div className="mt-2 flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            Jumlah terjual tidak boleh melebihi jumlah keluar
          </div>
        )}
      </div>

      {/* Setoran */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Setoran</p>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-neutral-600 select-none">
            <input
              type="checkbox"
              checked={setoranAuto}
              onChange={(e) => handleSetoranAuto(e.target.checked)}
              disabled={nilaiTerjual === 0}
              className="h-3.5 w-3.5 rounded"
            />
            Sesuai nilai terjual ({fmtIDR(nilaiTerjual)})
          </label>
        </div>
        <div className="space-y-2">
          {setoran.map((st, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <div className="w-32">
                <SelectInput
                  value={st.metode}
                  onChange={(e) => setSetoran(setoran.map((s, i) => i === idx ? { ...s, metode: e.target.value } : s))}
                  disabled={setoranAuto}
                >
                  <option value="cash">Cash</option>
                  <option value="transfer">Transfer</option>
                </SelectInput>
              </div>
              <MoneyInput
                value={st.jumlah}
                onChange={(raw) => setSetoran(setoran.map((s, i) => i === idx ? { ...s, jumlah: raw } : s))}
                placeholder="0"
                className={inputCls + " flex-1" + (setoranAuto ? " bg-neutral-50 opacity-70" : "")}
                disabled={setoranAuto}
              />
              {setoran.length > 1 && !setoranAuto && (
                <IconButton icon={Trash2} onClick={() => setSetoran(setoran.filter((_, i) => i !== idx))} variant="danger" label="Hapus" />
              )}
            </div>
          ))}
          {setoran.length < 2 && !setoranAuto && (
            <button type="button" onClick={() => setSetoran([...setoran, { metode: "transfer", jumlah: "" }])} className="text-xs text-blue-600 hover:underline">
              + Tambah metode setoran
            </button>
          )}
        </div>

        {totalSetoran > 0 && (
          <div className={`mt-3 flex items-center justify-between rounded-lg border px-3 py-2 text-xs ${flagSelisih ? "border-red-200 bg-red-50 text-red-700" : "border-green-200 bg-green-50 text-green-700"}`}>
            <span className="flex items-center gap-1.5">
              {flagSelisih ? <AlertCircle className="h-3.5 w-3.5" /> : <CheckCircle className="h-3.5 w-3.5" />}
              {flagSelisih
                ? `Selisih: ${fmtIDR(Math.abs(nilaiTerjual - totalSetoran))} (nilai terjual ${fmtIDR(nilaiTerjual)})`
                : "Setoran sesuai dengan nilai terjual"}
            </span>
            <span className="font-semibold tabular-nums">{fmtIDR(totalSetoran)}</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-2 border-t border-neutral-200">
        <button type="button" onClick={onCancel} className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
          Batal
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading || hasError}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          {loading ? "Menyimpan..." : "Selesaikan Titip Jual"}
        </button>
      </div>
    </div>
  )
}
