"use client"

import { useState, useMemo } from "react"
import { Plus, CheckCircle, AlertCircle } from "lucide-react"
import { fmtTanggal, getJakartaToday, defaultDateRange } from "@/lib/utils"
import {
  createSampleHarian,
  updateSampleHarian,
  closeSampleHarian,
  deleteSampleHarian,
  updateSampleHarianReport,
} from "@/actions/sample-harian"
import {
  Card, PageHeader, PrimaryButton, Button, inputCls, useConfirm, useConfirmWithReason, RowActions,
  DateFilter, Field, SelectInput, MultiSearchableSelect,
} from "@/components/ui"
import Modal from "@/components/Modal"
import DataTable from "@/components/DataTable"
import RokokItemsTooltip from "@/components/RokokItemsTooltip"

const STATUS_COLOR = {
  buka:    "bg-yellow-100 text-yellow-700",
  aktif:   "bg-yellow-100 text-yellow-700",
  selesai: "bg-green-100 text-green-700",
}

function StatusBadge({ status }) {
  const isSelesai = status === "selesai"
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${isSelesai ? STATUS_COLOR.selesai : STATUS_COLOR.buka}`}>
      {isSelesai ? "Selesai" : "Aktif"}
    </span>
  )
}

function BuatModal({ rokokList, existingList = [], sampleCutoffDate, onClose, onSaved }) {
  const [tanggal, setTanggal] = useState(getJakartaToday())
  const [catatan, setCatatan] = useState("")
  const [qtysBiasa, setQtysBiasa] = useState({})
  const [qtysCukai, setQtysCukai] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const activeRokok = rokokList.filter((r) => r.aktif !== false)

  const dateExists = existingList.some((item) => {
    const itemDateStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(item.tanggal))
    return itemDateStr === tanggal
  })

  const isTomorrow = tanggal > getJakartaToday()
  const isHistorical = sampleCutoffDate && tanggal < sampleCutoffDate

  let validationError = null
  if (isTomorrow) {
    validationError = "Tidak dapat membuat sesi sample harian untuk tanggal besok / mendatang."
  } else if (dateExists) {
    validationError = `Sesi sample harian untuk tanggal ${fmtTanggal(tanggal)} sudah ada. Satu hari hanya diperbolehkan satu sesi.`
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (validationError) return

    const todayStr = getJakartaToday()
    if (tanggal > todayStr) {
      setError("Tidak dapat membuat sesi sample harian untuk tanggal besok / mendatang.")
      return
    }
    
    const items = []
    
    activeRokok.forEach((r) => {
      const qSC = Number(qtysCukai[r.id])
      const qSB = Number(qtysBiasa[r.id])
      
      if (qSC > 0) {
        items.push({ rokok_id: r.id, type: "cukai", qty_keluar: qSC })
      }
      if (qSB > 0) {
        items.push({ rokok_id: r.id, type: "biasa", qty_keluar: qSB })
      }
    })

    if (items.length === 0) {
      setError("Isi minimal satu qty keluar (SC atau SB).")
      return
    }

    // Client-side stock check to prevent saving if stock is insufficient (only if NOT historical!)
    if (!isHistorical) {
      for (const item of items) {
        const r = activeRokok.find((x) => x.id === item.rokok_id)
        const stock = item.type === "cukai" ? (r.stok_sample_cukai ?? 0) : (r.stok_sample_biasa ?? 0)
        if (item.qty_keluar > stock) {
          setError(`Stok sample ${item.type === "cukai" ? "Cukai (SC)" : "Biasa (SB)"} untuk ${r.nama} tidak mencukupi.`)
          return
        }
      }
    }

    setLoading(true)
    try {
      const res = await createSampleHarian(tanggal, items, catatan || null)
      if (!res?.success) {
        throw new Error(res?.error || "Terjadi kesalahan saat menyimpan data.")
      }
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal title="Buat Sesi Sample Pagi" onClose={onClose} width="max-w-3xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        {validationError && (
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-xs text-amber-800 transition-colors">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-semibold block uppercase tracking-wider text-[10px] text-amber-600">Peringatan Sesi</span>
              <p className="leading-relaxed font-medium">{validationError}</p>
            </div>
          </div>
        )}
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-neutral-600">Tanggal</label>
            <input type="date" value={tanggal} max={getJakartaToday()} onChange={(e) => setTanggal(e.target.value)} className={inputCls} required />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-neutral-600">Catatan</label>
            <input type="text" value={catatan} onChange={(e) => setCatatan(e.target.value)} className={inputCls} placeholder="Opsional" />
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-neutral-200">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 border-b border-neutral-200">
              <tr className="text-[10px] uppercase tracking-wider text-neutral-400 font-semibold">
                <th className="px-3 py-2.5 text-left font-semibold">Produk</th>
                <th className="px-3 py-2.5 text-center font-semibold">Stok Cukai</th>
                <th className="px-3 py-2.5 text-center font-bold text-amber-600">Sample Cukai</th>
                <th className="px-3 py-2.5 text-center font-semibold">Stok Biasa</th>
                <th className="px-3 py-2.5 text-center font-bold text-blue-600">Sample Biasa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 px-3">
              {activeRokok.map((r) => {
                const stokSC = r.stok_sample_cukai ?? 0
                const stokSB = r.stok_sample_biasa ?? 0
                const qtySC = qtysCukai[r.id] ?? ""
                const qtySB = qtysBiasa[r.id] ?? ""

                const sisaSC = stokSC - (Number(qtySC) > 0 ? Number(qtySC) : 0)
                const sisaSB = stokSB - (Number(qtySB) > 0 ? Number(qtySB) : 0)

                const melebihiSC = !isHistorical && (Number(qtySC) > stokSC)
                const melebihiSB = !isHistorical && (Number(qtySB) > stokSB)

                return (
                  <tr key={r.id} className="hover:bg-neutral-50/50 transition-colors">
                    <td className="px-3 py-2.5 text-sm font-medium text-neutral-800">{r.nama}</td>
                    
                    {/* Stok SC */}
                    <td className={`px-3 py-2.5 text-center text-xs tabular-nums font-medium ${melebihiSC ? "text-red-500" : Number(qtySC) > 0 ? "text-blue-600" : "text-neutral-400"}`}>
                      {isHistorical ? "— (Historis)" : (Number(qtySC) > 0 ? sisaSC : stokSC)}
                    </td>
                    {/* Qty SC Input */}
                    <td className="px-3 py-2.5">
                      <div className="flex justify-center">
                        <input
                          type="number"
                          min={0}
                          value={qtySC}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => setQtysCukai((p) => ({ ...p, [r.id]: e.target.value === "" ? "" : Number(e.target.value) }))}
                          style={{ width: '120px' }}
                          className={inputCls + " text-center px-3 py-1.5 font-semibold text-sm text-amber-600 focus:ring-amber-500" + (melebihiSC ? " border-red-400 focus:ring-red-500" : "")}
                          placeholder="—"
                        />
                      </div>
                    </td>

                    {/* Stok SB */}
                    <td className={`px-3 py-2.5 text-center text-xs tabular-nums font-medium ${melebihiSB ? "text-red-500" : Number(qtySB) > 0 ? "text-blue-600" : "text-neutral-400"}`}>
                      {isHistorical ? "— (Historis)" : (Number(qtySB) > 0 ? sisaSB : stokSB)}
                    </td>
                    {/* Qty SB Input */}
                    <td className="px-3 py-2.5">
                      <div className="flex justify-center">
                        <input
                          type="number"
                          min={0}
                          value={qtySB}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => setQtysBiasa((p) => ({ ...p, [r.id]: e.target.value === "" ? "" : Number(e.target.value) }))}
                          style={{ width: '120px' }}
                          className={inputCls + " text-center px-3 py-1.5 font-semibold text-sm text-blue-600 focus:ring-blue-500" + (melebihiSB ? " border-red-400 focus:ring-red-500" : "")}
                          placeholder="—"
                        />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {error && <p className="text-sm text-red-600 font-medium">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" onClick={onClose} variant="secondary">Batal</Button>
          <PrimaryButton type="submit" disabled={loading || !!validationError}>{loading ? "Menyimpan..." : "Simpan"}</PrimaryButton>
        </div>
      </form>
    </Modal>
  )
}

function TutupModal({ session, onClose, onSaved }) {
  const isSelesai = session.status === "selesai"
  const [qtys, setQtys] = useState(() =>
    Object.fromEntries(session.items.map((i) => [`${i.rokok_id}-${i.type}`, i.qty_kembali ?? 0]))
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    // Validate inputs
    for (const item of session.items) {
      const key = `${item.rokok_id}-${item.type}`
      const val = Number(qtys[key] ?? 0)
      if (val < 0 || val > item.qty_keluar) {
        setError(`Jumlah kembali untuk ${item.rokok} (${item.type === "cukai" ? "Cukai" : "Biasa"}) tidak valid. Harus antara 0 dan ${item.qty_keluar}.`)
        return
      }
    }

    const items = session.items.map((i) => ({
      rokok_id:    i.rokok_id,
      type:        i.type,
      qty_kembali: Number(qtys[`${i.rokok_id}-${i.type}`] ?? 0),
    }))
    setLoading(true)
    try {
      let res
      if (isSelesai) {
        res = await updateSampleHarianReport(session.id, items)
      } else {
        res = await closeSampleHarian(session.id, items)
      }
      if (!res?.success) {
        throw new Error(res?.error || "Terjadi kesalahan saat memproses laporan.")
      }
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Group items by rokok_id
  const groupedItems = []
  const seenRokokIds = new Set()

  session.items.forEach((item) => {
    if (!seenRokokIds.has(item.rokok_id)) {
      seenRokokIds.add(item.rokok_id)
      const biasaItem = session.items.find(i => i.rokok_id === item.rokok_id && i.type === "biasa")
      const cukaiItem = session.items.find(i => i.rokok_id === item.rokok_id && i.type === "cukai")
      groupedItems.push({
        rokok_id: item.rokok_id,
        rokokName: item.rokok,
        biasa: biasaItem,
        cukai: cukaiItem,
      })
    }
  })

  return (
    <Modal title={`${isSelesai ? "Edit Laporan" : "Input Laporan"} — ${fmtTanggal(session.tanggal)}`} onClose={onClose} width="max-w-3xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-neutral-500">Lengkapi formulir di bawah ini dengan mencatat jumlah sample yang kembali per produk.</p>
        <div className="overflow-x-auto rounded-lg border border-neutral-200">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 border-b border-neutral-200">
              <tr className="text-[10px] uppercase tracking-wider text-neutral-400 font-semibold">
                <th className="px-4 py-3 text-left font-semibold">Produk</th>
                <th className="px-4 py-3 text-center font-bold text-amber-600">Sample Cukai</th>
                <th className="px-4 py-3 text-center font-bold text-blue-600">Sample Biasa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {groupedItems.map((group) => {
                const renderInputCell = (item) => {
                  if (!item) {
                    return (
                      <div className="flex flex-col items-center justify-center py-3">
                        <span className="text-neutral-300 text-sm font-medium">—</span>
                      </div>
                    )
                  }
                  const key = `${item.rokok_id}-${item.type}`
                  const kembali = Number(qtys[key] ?? 0)
                  const terpakai = item.qty_keluar - kembali
                  const isCukai = item.type === "cukai"
                  const isInvalid = kembali < 0 || kembali > item.qty_keluar

                  return (
                    <div className="flex flex-col items-center py-1 w-full max-w-[160px] mx-auto">
                      {/* Label Sisa: X / Y aligned perfectly to the top-right of the input box */}
                      <div className="w-full flex justify-end mb-1 text-[10px] font-bold tabular-nums">
                        <span className={kembali > 0 ? "text-blue-600" : "text-neutral-400"}>
                          Sisa: {kembali} / {item.qty_keluar}
                        </span>
                      </div>
                      <input
                        type="number"
                        min={0}
                        max={item.qty_keluar}
                        value={qtys[key] ?? ""}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => setQtys((p) => ({ ...p, [key]: e.target.value === "" ? "" : Number(e.target.value) }))}
                        className={inputCls + " w-full text-center px-3 py-1.5 font-semibold text-sm " + (isCukai ? "text-amber-600 focus:ring-amber-500" : "text-blue-600 focus:ring-blue-500") + (isInvalid ? " border-red-400 focus:ring-red-500" : "")}
                      />
                    </div>
                  )
                }

                return (
                  <tr key={group.rokok_id} className="hover:bg-neutral-50/50 transition-colors">
                    <td className="px-4 py-3 text-sm font-semibold text-neutral-800">{group.rokokName}</td>
                    <td className="px-4 py-2 bg-neutral-50/10 border-r border-neutral-100">{renderInputCell(group.cukai)}</td>
                    <td className="px-4 py-2 bg-neutral-50/10">{renderInputCell(group.biasa)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {error && <p className="text-sm text-red-600 font-medium">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" onClick={onClose} variant="secondary">Batal</Button>
          <PrimaryButton type="submit" disabled={loading}>{loading ? "Menyimpan..." : isSelesai ? "Simpan Perubahan" : "Tutup Sesi"}</PrimaryButton>
        </div>
      </form>
    </Modal>
  )
}

function EditModal({ session, rokokList, existingList = [], sampleCutoffDate, onClose, onSaved }) {
  const [tanggal, setTanggal] = useState(() => {
    if (!session.tanggal) return getJakartaToday()
    const d = new Date(session.tanggal)
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d)
  })
  const [catatan, setCatatan] = useState(session.catatan || "")
  const [qtysBiasa, setQtysBiasa] = useState(() => {
    const obj = {}
    session.items.forEach((i) => {
      if (i.type === "biasa") obj[i.rokok_id] = i.qty_keluar
    })
    return obj
  })
  const [qtysCukai, setQtysCukai] = useState(() => {
    const obj = {}
    session.items.forEach((i) => {
      if (i.type === "cukai") obj[i.rokok_id] = i.qty_keluar
    })
    return obj
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const filteredRokok = rokokList.filter((r) => r.aktif !== false || session.items.some(it => it.rokok_id === r.id))

  const dateExists = existingList.some((item) => {
    if (item.id === session.id) return false
    const itemDateStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(item.tanggal))
    return itemDateStr === tanggal
  })

  const isTomorrow = tanggal > getJakartaToday()
  const isHistorical = sampleCutoffDate && tanggal < sampleCutoffDate

  let validationError = null
  if (isTomorrow) {
    validationError = "Tidak dapat mengubah tanggal sesi sample harian ke tanggal besok / mendatang."
  } else if (dateExists) {
    validationError = `Sesi sample harian untuk tanggal ${fmtTanggal(tanggal)} sudah ada. Satu hari hanya diperbolehkan satu sesi.`
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (validationError) return

    const todayStr = getJakartaToday()
    if (tanggal > todayStr) {
      setError("Tidak dapat mengubah tanggal sesi sample harian ke tanggal besok / mendatang.")
      return
    }
    
    const items = []
    
    filteredRokok.forEach((r) => {
      const qSC = Number(qtysCukai[r.id])
      const qSB = Number(qtysBiasa[r.id])
      
      if (qSC > 0) {
        items.push({ rokok_id: r.id, type: "cukai", qty_keluar: qSC })
      }
      if (qSB > 0) {
        items.push({ rokok_id: r.id, type: "biasa", qty_keluar: qSB })
      }
    })

    if (items.length === 0) {
      setError("Isi minimal satu qty keluar (SC atau SB).")
      return
    }

    // Client-side stock check (only if NOT historical!)
    if (!isHistorical) {
      for (const item of items) {
        const r = filteredRokok.find((x) => x.id === item.rokok_id)
        const oldItem = session.items.find(it => it.rokok_id === item.rokok_id && it.type === item.type)
        const allocated = oldItem ? oldItem.qty_keluar : 0
        const stock = item.type === "cukai" ? (r.stok_sample_cukai ?? 0) : (r.stok_sample_biasa ?? 0)
        const totalAvailable = stock + allocated
        if (item.qty_keluar > totalAvailable) {
          setError(`Stok sample ${item.type === "cukai" ? "Cukai (SC)" : "Biasa (SB)"} untuk ${r.nama} tidak mencukupi.`)
          return
        }
      }
    }

    setLoading(true)
    try {
      const res = await updateSampleHarian(session.id, tanggal, items, catatan || null)
      if (!res?.success) {
        throw new Error(res?.error || "Terjadi kesalahan saat menyimpan perubahan.")
      }
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal title={`Ubah Sesi Sample Pagi — ${fmtTanggal(session.tanggal)}`} onClose={onClose} width="max-w-3xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        {validationError && (
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-xs text-amber-800 transition-colors">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-semibold block uppercase tracking-wider text-[10px] text-amber-600">Peringatan Sesi</span>
              <p className="leading-relaxed font-medium">{validationError}</p>
            </div>
          </div>
        )}
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-neutral-600">Tanggal</label>
            <input type="date" value={tanggal} max={getJakartaToday()} onChange={(e) => setTanggal(e.target.value)} className={inputCls} required />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-neutral-600">Catatan</label>
            <input type="text" value={catatan} onChange={(e) => setCatatan(e.target.value)} className={inputCls} placeholder="Opsional" />
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-neutral-200">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 border-b border-neutral-200">
              <tr className="text-[10px] uppercase tracking-wider text-neutral-400 font-semibold">
                <th className="px-3 py-2.5 text-left font-semibold">Produk</th>
                <th className="px-3 py-2.5 text-center font-semibold">Stok Cukai</th>
                <th className="px-3 py-2.5 text-center font-bold text-amber-600">Sample Cukai</th>
                <th className="px-3 py-2.5 text-center font-semibold">Stok Biasa</th>
                <th className="px-3 py-2.5 text-center font-bold text-blue-600">Sample Biasa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 px-3">
              {filteredRokok.map((r) => {
                const oldItemSC = session.items.find(it => it.rokok_id === r.id && it.type === "cukai")
                const oldItemSB = session.items.find(it => it.rokok_id === r.id && it.type === "biasa")

                const allocatedSC = oldItemSC ? oldItemSC.qty_keluar : 0
                const allocatedSB = oldItemSB ? oldItemSB.qty_keluar : 0

                const stokSC = (r.stok_sample_cukai ?? 0) + allocatedSC
                const stokSB = (r.stok_sample_biasa ?? 0) + allocatedSB

                const qtySC = qtysCukai[r.id] ?? ""
                const qtySB = qtysBiasa[r.id] ?? ""

                const sisaSC = stokSC - (Number(qtySC) > 0 ? Number(qtySC) : 0)
                const sisaSB = stokSB - (Number(qtySB) > 0 ? Number(qtySB) : 0)

                const melebihiSC = !isHistorical && (Number(qtySC) > stokSC)
                const melebihiSB = !isHistorical && (Number(qtySB) > stokSB)

                return (
                  <tr key={r.id} className="hover:bg-neutral-50/50 transition-colors">
                    <td className="px-3 py-2.5 text-sm font-medium text-neutral-800">{r.nama}</td>
                    
                    {/* Stok SC */}
                    <td className={`px-3 py-2.5 text-center text-xs tabular-nums font-medium ${melebihiSC ? "text-red-500" : Number(qtySC) > 0 ? "text-blue-600" : "text-neutral-400"}`}>
                      {isHistorical ? "— (Historis)" : (Number(qtySC) > 0 ? sisaSC : stokSC)}
                    </td>
                    {/* Qty SC Input */}
                    <td className="px-3 py-2.5">
                      <div className="flex justify-center">
                        <input
                          type="number"
                          min={0}
                          value={qtySC}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => setQtysCukai((p) => ({ ...p, [r.id]: e.target.value === "" ? "" : Number(e.target.value) }))}
                          style={{ width: '120px' }}
                          className={inputCls + " text-center px-3 py-1.5 font-semibold text-sm text-amber-600 focus:ring-amber-500" + (melebihiSC ? " border-red-400 focus:ring-red-500" : "")}
                          placeholder="—"
                        />
                      </div>
                    </td>

                    {/* Stok SB */}
                    <td className={`px-3 py-2.5 text-center text-xs tabular-nums font-medium ${melebihiSB ? "text-red-500" : Number(qtySB) > 0 ? "text-blue-600" : "text-neutral-400"}`}>
                      {isHistorical ? "— (Historis)" : (Number(qtySB) > 0 ? sisaSB : stokSB)}
                    </td>
                    {/* Qty SB Input */}
                    <td className="px-3 py-2.5">
                      <div className="flex justify-center">
                        <input
                          type="number"
                          min={0}
                          value={qtySB}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => setQtysBiasa((p) => ({ ...p, [r.id]: e.target.value === "" ? "" : Number(e.target.value) }))}
                          style={{ width: '120px' }}
                          className={inputCls + " text-center px-3 py-1.5 font-semibold text-sm text-blue-600 focus:ring-blue-500" + (melebihiSB ? " border-red-400 focus:ring-red-500" : "")}
                          placeholder="—"
                        />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {error && <p className="text-sm text-red-600 font-medium">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" onClick={onClose} variant="secondary">Batal</Button>
          <PrimaryButton type="submit" disabled={loading || !!validationError}>{loading ? "Menyimpan..." : "Simpan Perubahan"}</PrimaryButton>
        </div>
      </form>
    </Modal>
  )
}

function DetailModal({ session, onClose }) {
  // Group items by rokok_id
  const groupedItems = []
  const seenRokokIds = new Set()

  session.items.forEach((item) => {
    if (!seenRokokIds.has(item.rokok_id)) {
      seenRokokIds.add(item.rokok_id)
      const biasaItem = session.items.find(i => i.rokok_id === item.rokok_id && i.type === "biasa")
      const cukaiItem = session.items.find(i => i.rokok_id === item.rokok_id && i.type === "cukai")
      groupedItems.push({
        rokok_id: item.rokok_id,
        rokokName: item.rokok,
        biasa: biasaItem,
        cukai: cukaiItem,
      })
    }
  })

  const renderDetailCell = (item) => {
    if (!item) {
      return (
        <div className="flex flex-col items-center justify-center py-4">
          <span className="text-neutral-300 text-sm font-medium">—</span>
        </div>
      )
    }

    const terpakai = item.qty_keluar - item.qty_kembali
    const isSelesai = session.status === "selesai"

    return (
      <div className="flex flex-col items-center py-1 w-full max-w-[160px] mx-auto">
        <div className="inline-flex flex-col gap-1 py-1.5 px-3 bg-white border border-neutral-200 rounded-xl shadow-sm w-full">
          <div className="flex justify-between items-center text-xs">
            <span className="text-neutral-400 font-semibold">Keluar</span>
            <span className="font-extrabold text-neutral-800 tabular-nums">{item.qty_keluar}</span>
          </div>
          {isSelesai && (
            <>
              <div className="flex justify-between items-center text-xs border-t border-neutral-100 pt-1">
                <span className="text-neutral-400 font-semibold">Kembali</span>
                <span className="font-extrabold text-neutral-800 tabular-nums">{item.qty_kembali}</span>
              </div>
              <div className="flex justify-between items-center text-xs border-t border-neutral-100 pt-1">
                <span className="text-neutral-400 font-semibold">Terpakai</span>
                <span className={`font-extrabold tabular-nums ${terpakai > 0 ? "text-orange-600" : "text-neutral-400"}`}>
                  {terpakai}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <Modal title={`Detail Sample Harian — ${fmtTanggal(session.tanggal)}`} onClose={onClose} width="max-w-3xl">
      <div className="space-y-5">
        {/* Info Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 rounded-xl bg-neutral-50 p-4 border border-neutral-100 text-sm shadow-inner">
          <div className="bg-white p-3 rounded-lg border border-neutral-100 shadow-sm">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-0.5">Tanggal</span>
            <span className="font-bold text-neutral-800">{fmtTanggal(session.tanggal)}</span>
          </div>
          <div className="bg-white p-3 rounded-lg border border-neutral-100 shadow-sm">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-0.5">Status</span>
            <StatusBadge status={session.status} />
          </div>
          <div className="bg-white p-3 rounded-lg border border-neutral-100 shadow-sm">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-0.5">Catatan</span>
            <span className="text-neutral-700 font-medium">{session.catatan || <span className="text-neutral-400 italic">Tidak ada catatan</span>}</span>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-xl border border-neutral-200">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-neutral-500 border-b border-neutral-200">
              <tr>
                <th className="px-4 py-3.5 text-left font-bold text-neutral-600">Produk</th>
                <th className="px-4 py-3.5 text-center text-orange-600 font-extrabold bg-orange-50/30">Sample Cukai</th>
                <th className="px-4 py-3.5 text-center text-blue-600 font-extrabold bg-blue-50/30">Sample Biasa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 bg-neutral-50/10">
              {groupedItems.map((group) => (
                <tr key={group.rokok_id} className="hover:bg-neutral-50/50 transition-colors">
                  <td className="px-4 py-3 text-sm font-semibold text-neutral-800">{group.rokokName}</td>
                  <td className="px-4 py-2 bg-orange-50/10 border-r border-neutral-100">{renderDetailCell(group.cukai)}</td>
                  <td className="px-4 py-2 bg-blue-50/10">{renderDetailCell(group.biasa)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end pt-1">
          <Button type="button" onClick={onClose} variant="secondary">Tutup</Button>
        </div>
      </div>
    </Modal>
  )
}

export default function SampleHarianPage({ list: initialList, rokokList, sampleCutoffDate }) {
  const [list, setList] = useState(initialList)
  const [showBuat, setShowBuat] = useState(false)
  const [tutupTarget, setTutupTarget] = useState(null)
  const [editTarget, setEditTarget] = useState(null)
  const [detailTarget, setDetailTarget] = useState(null)
  const [dateRange, setDateRange] = useState(() => defaultDateRange("bulan_ini"))
  const [statusFilter, setStatusFilter] = useState("")
  const [rokokFilter, setRokokFilter] = useState([])
  
  const { confirm, ConfirmModal } = useConfirm()
  const { confirmWithReason, ConfirmWithReasonModal } = useConfirmWithReason()

  const filteredList = useMemo(() => {
    let temp = list || []
    
    // 1. Filter by Date Range
    if (dateRange?.start && dateRange?.end) {
      temp = temp.filter((r) => r.tanggal >= dateRange.start && r.tanggal <= dateRange.end)
    }
    
    // 2. Filter by Status
    if (statusFilter) {
      temp = temp.filter((r) => r.status === statusFilter)
    }
    
    // 3. Filter by Multiple Products (AND Logic - session must have ALL selected products)
    if (rokokFilter && rokokFilter.length > 0) {
      const selectedRokok = rokokFilter.filter(v => v !== "" && v !== null && v !== undefined).map(String)
      if (selectedRokok.length > 0) {
        temp = temp.filter((r) => {
          const sessionRokokIds = new Set(r.items.map((item) => String(item.rokok_id)))
          return selectedRokok.every((id) => sessionRokokIds.has(id))
        })
      }
    }
    
    // 4. Mark Historical
    return temp.map(r => ({
        ...r,
        is_historical: sampleCutoffDate && r.tanggal < sampleCutoffDate
    }))
  }, [list, dateRange, statusFilter, rokokFilter, sampleCutoffDate])

  function refresh() {
    window.location.reload()
  }

  async function handleDelete(item) {
    const ok = await confirmWithReason(`Hapus sample harian ${fmtTanggal(item.tanggal)}? Semua stok sample harian yang keluar akan dikembalikan ke gudang.`, { title: "Hapus Sample Harian" })
    if (!ok) return
    try {
      const res = await deleteSampleHarian(item.id, ok)
      if (!res?.success) {
        throw new Error(res?.error || "Gagal menghapus sample harian.")
      }
      refresh()
    } catch (err) {
      await confirm(err.message, { title: "Gagal", hideCancel: true })
    }
  }

  const columns = [
    { key: "no",      label: "No",      render: (_, idx) => idx + 1 },
    {
      key: "tanggal",
      label: "Tanggal",
      render: (r) => (
        <div className="flex items-center gap-2">
          <span>{fmtTanggal(r.tanggal)}</span>
          {r.is_historical && (
            <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-700/10">
              Data Lama
            </span>
          )}
        </div>
      ),
    },
    {
      key: "detail",
      label: "Detail",
      render: (r) => (
        <RokokItemsTooltip
          items={r.items.map((i) => ({
            rokok: `${i.rokok} (${i.type === "cukai" ? "Cukai" : "Biasa"})`,
            qty_keluar: i.qty_keluar,
          }))}
        />
      ),
    },
    { key: "status",  label: "Status",  align: "center", render: (r) => <StatusBadge status={r.status} /> },
    {
      key: "actions",
      label: "",
      align: "right",
      render: (r) => (
        <div className="flex items-center justify-end gap-2">
          {r.status === "buka" ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setTutupTarget(r)}
            >
              Input Laporan
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
              onClick={() => setTutupTarget(r)}
            >
              Edit Laporan
            </Button>
          )
          }
          <RowActions
            onDetail={() => setDetailTarget(r)}
            onEdit={r.status === "buka" ? () => setEditTarget(r) : null}
            onDelete={() => handleDelete(r)}
          />
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sample Harian"
        subtitle="Kelola sample yang keluar pagi dan kembali sore."
        action={
          <PrimaryButton icon={Plus} onClick={() => setShowBuat(true)}>Buat Sesi Pagi</PrimaryButton>
        }
      />

      <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:gap-4">
          <Field label="Rentang Waktu" className="flex-1">
            <div className="w-full">
              <DateFilter value={dateRange} onChange={setDateRange} />
            </div>
          </Field>

          <Field label="Status" className="flex-1">
            <SelectInput value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">Semua Status</option>
              <option value="buka">Aktif</option>
              <option value="selesai">Selesai</option>
            </SelectInput>
          </Field>

          <Field label="Produk" className="flex-1">
            <MultiSearchableSelect
              value={rokokFilter}
              onChange={(e) => setRokokFilter(e.target.value)}
              placeholder="Semua Produk"
              options={[{ value: "", label: "Semua Produk" }, ...rokokList.map((r) => ({ value: r.id, label: r.nama }))]}
            />
          </Field>
        </div>
      </div>

      <Card>
        <DataTable
          pageSize={10}
          rows={filteredList}
          empty="Belum ada data sample harian."
          columns={columns}
        />
      </Card>

      {showBuat && (
        <BuatModal
          rokokList={rokokList}
          existingList={list}
          sampleCutoffDate={sampleCutoffDate}
          onClose={() => setShowBuat(false)}
          onSaved={() => { setShowBuat(false); refresh() }}
        />
      )}
      {tutupTarget && (
        <TutupModal
          session={tutupTarget}
          onClose={() => setTutupTarget(null)}
          onSaved={() => { setTutupTarget(null); refresh() }}
        />
      )}
      {editTarget && (
        <EditModal
          session={editTarget}
          rokokList={rokokList}
          existingList={list}
          sampleCutoffDate={sampleCutoffDate}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); refresh() }}
        />
      )}
      {detailTarget && (
        <DetailModal
          session={detailTarget}
          onClose={() => setDetailTarget(null)}
        />
      )}
      <ConfirmModal />
      <ConfirmWithReasonModal />
    </div>
  )
}
