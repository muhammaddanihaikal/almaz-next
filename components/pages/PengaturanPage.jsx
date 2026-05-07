"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Settings, Save, AlertCircle, Loader2 } from "lucide-react"
import { setSetting } from "@/actions/settings"

export default function PengaturanPage({ initialStockCutoffDate }) {
  const router = useRouter()
  const [stockCutoffDate, setStockCutoffDate] = useState(initialStockCutoffDate || "")
  const [loading, setLoading] = useState(false)
  const [successMsg, setSuccessMsg] = useState("")
  const [errorMsg, setErrorMsg] = useState("")

  const handleSave = async (e) => {
    e.preventDefault()
    setLoading(true)
    setSuccessMsg("")
    setErrorMsg("")

    try {
      await setSetting("stock_cutoff_date", stockCutoffDate)
      setSuccessMsg("Pengaturan berhasil disimpan.")
      router.refresh()
    } catch (err) {
      setErrorMsg(err.message || "Gagal menyimpan pengaturan.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex-1 overflow-auto bg-neutral-50/50 p-4 lg:p-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-900 shadow-sm">
            <Settings className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Pengaturan Sistem</h1>
            <p className="text-sm text-neutral-500">Konfigurasi global aplikasi ALMAZ.</p>
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-neutral-100 bg-neutral-50/50 px-6 py-4">
            <h2 className="font-semibold text-neutral-900">Mode Data Lama</h2>
          </div>
          
          <form onSubmit={handleSave} className="p-6 space-y-6">
            <div className="space-y-3">
              <label className="text-sm font-medium text-neutral-900 block">
                Tanggal Mulai Stok Aktif (Cutoff Date)
              </label>
              <input
                type="date"
                value={stockCutoffDate}
                onChange={(e) => setStockCutoffDate(e.target.value)}
                className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
              />
              <p className="text-xs text-neutral-500 leading-relaxed">
                Transaksi Distribusi (Sesi Harian) dengan tanggal <strong>sebelum</strong> tanggal ini akan dianggap sebagai "Data Lama" (Historical). 
                Data Lama tidak akan memotong atau menambah stok barang. Biarkan kosong jika tidak ada batas.
              </p>
            </div>

            {errorMsg && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-600 border border-red-100">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <p>{errorMsg}</p>
              </div>
            )}
            
            {successMsg && (
              <div className="flex items-center gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-600 border border-green-100">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <p>{successMsg}</p>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Simpan Pengaturan
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
