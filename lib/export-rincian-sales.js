/**
 * Agregasi data sesi untuk export "Rincian per Sales".
 *
 * Sumber data yang dihitung per rokok per sales:
 *  1. Penjualan Langsung  (sesi.penjualan)
 *  2. Titip Jual Selesai  (sesi.konsinyasi, status === "selesai", qty_terjual)
 *  3. Tukar Barang Selesai (sesi.tukarBarangSelesaiDiSesi, itemsKeluar = barang pengganti yg diberikan)
 *
 * Return: { dataMap, activeSales, sortedRokokIds, rokokMeta }
 *  - dataMap        : { [rokokId]: { [salesName]: qty } }
 *  - activeSales    : string[] (sorted a-z)
 *  - sortedRokokIds : string[] (sorted by urutan)
 *  - rokokMeta      : { [rokokId]: { nama, urutan, harga_beli, harga_grosir, harga_toko } }
 */
export function buildRincianPerSalesData(rows, rokokList) {
  const rokokMeta = Object.fromEntries(
    rokokList.map((r) => [
      r.id,
      {
        nama:         r.nama,
        urutan:       r.urutan ?? 0,
        harga_beli:   r.harga_beli   || 0,
        harga_grosir: r.harga_grosir || 0,
        harga_toko:   r.harga_toko   || 0,
      },
    ])
  )

  const dataMap     = {}
  const allRokokIds = new Set()

  function addQty(rokokId, salesName, qty) {
    if (!rokokId || !salesName || !(qty > 0)) return
    allRokokIds.add(rokokId)
    if (!dataMap[rokokId]) dataMap[rokokId] = {}
    dataMap[rokokId][salesName] = (dataMap[rokokId][salesName] || 0) + qty
  }

  for (const sesi of rows) {
    const salesName = sesi.sales

    // 1. Penjualan Langsung
    for (const it of sesi.penjualan || []) {
      addQty(it.rokok_id, salesName, it.qty)
    }

    // 2. Titip Jual Selesai (dalam sesi ini)
    for (const k of sesi.konsinyasi || []) {
      if (k.status !== "selesai") continue
      for (const it of k.items || []) {
        addQty(it.rokok_id, salesName, it.qty_terjual)
      }
    }

    // 3. Tukar Barang Selesai — itemsKeluar = barang pengganti yg diberikan ke customer
    for (const t of sesi.tukarBarangSelesaiDiSesi || []) {
      for (const it of t.itemsKeluar || []) {
        addQty(it.rokok_id, salesName, it.qty)
      }
    }
  }

  const activeSales = [...new Set(rows.map((r) => r.sales))].sort((a, b) =>
    a.localeCompare(b, "id")
  )

  const rokokIdOrderMap = Object.fromEntries(
    rokokList.map((r) => [r.id, r.urutan ?? 0])
  )
  const sortedRokokIds = [...allRokokIds].sort(
    (a, b) => (rokokIdOrderMap[a] ?? 0) - (rokokIdOrderMap[b] ?? 0)
  )

  return { dataMap, activeSales, sortedRokokIds, rokokMeta }
}
