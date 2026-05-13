const toNumber = (value) => Number(value) || 0
export const sumBy = (items, getter) => (items || []).reduce((sum, item) => sum + toNumber(getter(item)), 0)

export function getSesiSetoran(sesi) {
  return sumBy(sesi.setoran, (item) => item.jumlah)
}

export function mergeTukarBarang(sesi) {
  const map = new Map()
  for (const item of [...(sesi.tukarBarang || []), ...(sesi.tukarBarangSelesaiDiSesi || [])]) {
    if (!item) continue
    map.set(item.id || `${item.tanggal}-${map.size}`, item)
  }
  return [...map.values()]
}

export function totalTukarItems(items = []) {
  return sumBy(items, (item) => item.qty * item.harga_satuan)
}

export function getSesiPenjualanBreakdown(sesi) {
  const langsung = sumBy(sesi.penjualan, (item) => item.qty * item.harga)
  const titipJual = sumBy(sesi.konsinyasi, (titip) => sumBy(titip.items, (item) => item.qty_keluar * item.harga))
  const tukarBarang = sumBy(mergeTukarBarang(sesi), (tukar) => totalTukarItems(tukar.itemsMasuk) - totalTukarItems(tukar.itemsKeluar))
  const total = langsung + titipJual + tukarBarang

  return { langsung, titipJual, tukarBarang, total }
}

export function getSesiQtyBreakdown(sesi) {
  const langsung = sumBy(sesi.penjualan, (item) => item.qty)
  const titipJual = sumBy(sesi.konsinyasi, (titip) => sumBy(titip.items, (item) => item.qty_keluar))
  const tukarBarang = sumBy(mergeTukarBarang(sesi), (tukar) => sumBy(tukar.itemsKeluar, (item) => item.qty))
  const total = langsung + titipJual + tukarBarang

  return { langsung, titipJual, tukarBarang, total }
}

export function getSesiProfit(sesi, rokokById) {
  return sumBy(sesi.penjualan, (item) => {
    const rokok = rokokById.get(item.rokok_id)
    return rokok ? item.qty * (item.harga - rokok.harga_beli) : 0
  })
}

export function getSesiNetKeluar(sesi) {
  const keluar = sumBy(sesi.barangKeluar, (item) => item.qty)
  const kembali = sumBy(sesi.barangKembali, (item) => item.qty)
  return keluar - kembali
}

export function getTitipSetoran(titip, range, isDateInRange) {
  return sumBy((titip.setoran || []).filter((item) => isDateInRange(item.tanggal, range)), (item) => item.jumlah)
}

export function getTitipProfit(titip, rokokById) {
  return sumBy(titip.items, (item) => {
    const rokok = rokokById.get(item.rokok_id)
    return rokok ? item.qty_terjual * (item.harga - rokok.harga_beli) : 0
  })
}

export function getTitipReturQty(titip) {
  return sumBy(titip.items, (item) => item.qty_kembali)
}

export function calculateStats(sesiRows, titipProfitRows, titipSetoranRows, pengeluaranRows, rokokById, range, isDateInRange) {
  const penjualanBreakdown = (sesiRows || []).reduce((acc, sesi) => {
    const row = getSesiPenjualanBreakdown(sesi)
    return {
      langsung: acc.langsung + row.langsung,
      titipJual: acc.titipJual + row.titipJual,
      tukarBarang: acc.tukarBarang + row.tukarBarang,
      total: acc.total + row.total,
    }
  }, { langsung: 0, titipJual: 0, tukarBarang: 0, total: 0 })

  const qtyBreakdown = (sesiRows || []).reduce((acc, sesi) => {
    const row = getSesiQtyBreakdown(sesi)
    return {
      langsung: acc.langsung + row.langsung,
      titipJual: acc.titipJual + row.titipJual,
      tukarBarang: acc.tukarBarang + row.tukarBarang,
      total: acc.total + row.total,
    }
  }, { langsung: 0, titipJual: 0, tukarBarang: 0, total: 0 })

  const totalSetoran = sumBy(sesiRows, getSesiSetoran) + sumBy(titipSetoranRows, (titip) => getTitipSetoran(titip, range, isDateInRange))
  const profit = sumBy(sesiRows, (sesi) => getSesiProfit(sesi, rokokById)) + sumBy(titipProfitRows, (titip) => getTitipProfit(titip, rokokById))
  const totalPengeluaran = sumBy((pengeluaranRows || []).filter((item) => item.sumber === "penjualan"), (item) => item.jumlah)
  const totalKeluar = sumBy(sesiRows, getSesiNetKeluar) - sumBy(titipProfitRows, getTitipReturQty)

  return { totalPenjualan: penjualanBreakdown.total, penjualanBreakdown, qtyBreakdown, totalSetoran, profit, totalPengeluaran, totalKeluar }
}
