/**
 * Agregasi data sesi untuk export "Rincian per Sales".
 *
 * Sumber data per rokok per sales:
 *  1. Penjualan Langsung  → qty & uang aktual (qty × harga laporan sore)
 *  2. Titip Jual Selesai  → qty_terjual & uang aktual (qty × harga konsinyasi)
 *  3. Tukar Barang Selesai → net qty per rokok (keluar − masuk) & net selisih uang
 *     (totalKeluar − totalMasuk), didistribusikan proporsional ke produk net positif.
 *     Jika selisih = 0 (tukar setara), TB uang = 0 meski ada qty yang bergerak.
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
    const completedKonsinyasi = new Map()
    for (const k of sesi.konsinyasi || []) {
      if (k.status === "selesai") completedKonsinyasi.set(k.id, k)
    }
    for (const k of sesi.konsinyasiSelesaiDiSesi || []) {
      if (k.status === "selesai") completedKonsinyasi.set(k.id, k)
    }
    for (const k of completedKonsinyasi.values()) {
      for (const it of k.items || []) {
        if (!(it.qty_terjual > 0)) continue
        addData(it.rokok_id, salesName, { titipQty: it.qty_terjual, titipUang: it.qty_terjual * (it.harga || 0) })
      }
    }

    // 3. Tukar Barang Selesai — gunakan SELISIH BERSIH (totalKeluar − totalMasuk)
    // Sama dengan logika nilaiTukar di backend (distribusi.js).
    // Contoh: keluar SCHIOSMAS x20 @ 9.700 & masuk AL KRETEK x20 @ 9.700 → selisih = 0 → TB uang = 0.
    for (const t of sesi.tukarBarangSelesaiDiSesi || []) {
      const totalMasukUang  = (t.itemsMasuk  || []).reduce((s, it) => s + it.qty * (it.harga_satuan || 0), 0)
      const totalKeluarUang = (t.itemsKeluar || []).reduce((s, it) => s + it.qty * (it.harga_satuan || 0), 0)
      const selisihUang = totalKeluarUang - totalMasukUang  // net kontribusi moneter

      // Net qty per rokok_id (keluar − masuk untuk rokok yang sama)
      const netByRokok = {}
      for (const it of t.itemsKeluar || []) {
        if (!netByRokok[it.rokok_id]) netByRokok[it.rokok_id] = { qty: 0, grossKeluar: 0 }
        netByRokok[it.rokok_id].qty        += it.qty
        netByRokok[it.rokok_id].grossKeluar += it.qty * (it.harga_satuan || 0)
      }
      for (const it of t.itemsMasuk || []) {
        if (!netByRokok[it.rokok_id]) netByRokok[it.rokok_id] = { qty: 0, grossKeluar: 0 }
        netByRokok[it.rokok_id].qty -= it.qty
      }

      // Distribusikan selisihUang proporsional ke produk dengan net qty > 0
      // berdasarkan nilai gross keluar masing-masing produk
      const posEntries = Object.entries(netByRokok).filter(([, v]) => v.qty > 0)
      const totalPosGrossKeluar = posEntries.reduce((s, [, v]) => s + v.grossKeluar, 0)

      for (const [rokok_id, { qty, grossKeluar }] of posEntries) {
        const proportion = totalPosGrossKeluar > 0 ? grossKeluar / totalPosGrossKeluar : 1 / posEntries.length
        const tukarUang  = Math.round(selisihUang * proportion)
        addData(rokok_id, salesName, { tukarQty: qty, tukarUang })
      }
    }
  }

  const activeSales = [...new Set(rows.map((r) => r.sales))].sort((a, b) => a.localeCompare(b, "id"))

  const rokokIdOrderMap = Object.fromEntries(rokokList.map((r) => [r.id, r.urutan ?? 0]))
  const sortedRokokIds  = [...allRokokIds].sort((a, b) => (rokokIdOrderMap[a] ?? 0) - (rokokIdOrderMap[b] ?? 0))

  return { dataMap, activeSales, sortedRokokIds, rokokMeta }
}
