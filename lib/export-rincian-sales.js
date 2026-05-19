/**
 * Agregasi data sesi untuk export "Rincian per Sales".
 *
 * Sumber data per rokok per sales:
 *  1. Penjualan Langsung  → qty & uang aktual (qty × harga laporan sore)
 *  2. Titip Jual Selesai  → qty_terjual & uang aktual (qty × harga konsinyasi)
 *  3. Tukar Barang Selesai → itemsKeluar qty & uang (qty × harga_satuan)
 *
 * Return: { dataMap, activeSales, sortedRokokIds, rokokMeta }
 *  - dataMap     : { [rokokId]: { [salesName]: { langsungQty, langsungUang, titipQty, titipUang, tukarQty, tukarUang } } }
 *  - activeSales : string[]
 *  - sortedRokokIds : string[]
 *  - rokokMeta   : { [rokokId]: { nama, urutan, harga_beli, harga_grosir, harga_toko } }
 */
export function buildRincianPerSalesData(rows, rokokList) {
  const rokokMeta = Object.fromEntries(
    rokokList.map((r) => [
      r.id,
      { nama: r.nama, urutan: r.urutan ?? 0, harga_beli: r.harga_beli || 0, harga_grosir: r.harga_grosir || 0, harga_toko: r.harga_toko || 0 },
    ])
  )

  const dataMap     = {}
  const allRokokIds = new Set()

  function addData(rokokId, salesName, delta) {
    if (!rokokId || !salesName) return
    const { langsungQty = 0, langsungUang = 0, titipQty = 0, titipUang = 0, tukarQty = 0, tukarUang = 0 } = delta
    if (langsungQty + titipQty + tukarQty <= 0) return
    allRokokIds.add(rokokId)
    if (!dataMap[rokokId]) dataMap[rokokId] = {}
    if (!dataMap[rokokId][salesName]) dataMap[rokokId][salesName] = { langsungQty: 0, langsungUang: 0, titipQty: 0, titipUang: 0, tukarQty: 0, tukarUang: 0 }
    const d = dataMap[rokokId][salesName]
    d.langsungQty += langsungQty
    d.langsungUang += langsungUang
    d.titipQty += titipQty
    d.titipUang += titipUang
    d.tukarQty += tukarQty
    d.tukarUang += tukarUang
  }

  for (const sesi of rows) {
    const salesName = sesi.sales

    // 1. Penjualan Langsung — harga aktual dari laporan sore
    for (const it of sesi.penjualan || []) {
      if (!(it.qty > 0)) continue
      addData(it.rokok_id, salesName, { langsungQty: it.qty, langsungUang: it.qty * (it.harga || 0) })
    }

    // 2. Titip Jual Selesai — harga yang disepakati saat konsinyasi
    for (const k of sesi.konsinyasi || []) {
      if (k.status !== "selesai") continue
      for (const it of k.items || []) {
        if (!(it.qty_terjual > 0)) continue
        addData(it.rokok_id, salesName, { titipQty: it.qty_terjual, titipUang: it.qty_terjual * (it.harga || 0) })
      }
    }

    // 3. Tukar Barang Selesai — itemsKeluar = barang pengganti yang diberikan
    for (const t of sesi.tukarBarangSelesaiDiSesi || []) {
      for (const it of t.itemsKeluar || []) {
        if (!(it.qty > 0)) continue
        addData(it.rokok_id, salesName, { tukarQty: it.qty, tukarUang: it.qty * (it.harga_satuan || 0) })
      }
    }
  }

  const activeSales = [...new Set(rows.map((r) => r.sales))].sort((a, b) => a.localeCompare(b, "id"))

  const rokokIdOrderMap = Object.fromEntries(rokokList.map((r) => [r.id, r.urutan ?? 0]))
  const sortedRokokIds  = [...allRokokIds].sort((a, b) => (rokokIdOrderMap[a] ?? 0) - (rokokIdOrderMap[b] ?? 0))

  return { dataMap, activeSales, sortedRokokIds, rokokMeta }
}
