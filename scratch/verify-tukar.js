// Verifikasi logika baru tukar barang di export-rincian-sales
// Test Case: AL KRETEK REFFILL (masuk 20 @ 9700) <-> SCHIOSMAS KRETEK (keluar 20 @ 9700)
// Expected: selisih = 0, jadi SCHIOSMAS KRETEK TB uang = Rp 0

function testTukarBarangFix() {
  const tukarBarang = {
    id: "test-1",
    selisih_uang: 0,
    itemsKeluar: [{ rokok_id: "SCHIOSMAS", qty: 20, harga_satuan: 9700 }],
    itemsMasuk:  [{ rokok_id: "AL_KRETEK",  qty: 20, harga_satuan: 9700 }],
  }

  const totalMasukUang  = tukarBarang.itemsMasuk.reduce((s, it) => s + it.qty * it.harga_satuan, 0)
  const totalKeluarUang = tukarBarang.itemsKeluar.reduce((s, it) => s + it.qty * it.harga_satuan, 0)
  const selisihUang = totalKeluarUang - totalMasukUang

  console.log(`Test Case 1: Tukar setara (sama harga, beda produk)`)
  console.log(`  totalMasukUang:  Rp ${totalMasukUang.toLocaleString("id-ID")}`)
  console.log(`  totalKeluarUang: Rp ${totalKeluarUang.toLocaleString("id-ID")}`)
  console.log(`  selisihUang:     Rp ${selisihUang.toLocaleString("id-ID")}`)

  const netByRokok = {}
  for (const it of tukarBarang.itemsKeluar) {
    if (!netByRokok[it.rokok_id]) netByRokok[it.rokok_id] = { qty: 0, grossKeluar: 0 }
    netByRokok[it.rokok_id].qty        += it.qty
    netByRokok[it.rokok_id].grossKeluar += it.qty * it.harga_satuan
  }
  for (const it of tukarBarang.itemsMasuk) {
    if (!netByRokok[it.rokok_id]) netByRokok[it.rokok_id] = { qty: 0, grossKeluar: 0 }
    netByRokok[it.rokok_id].qty -= it.qty
  }

  const posEntries = Object.entries(netByRokok).filter(([, v]) => v.qty > 0)
  const totalPosGrossKeluar = posEntries.reduce((s, [, v]) => s + v.grossKeluar, 0)

  console.log(`  netByRokok:`, netByRokok)
  console.log(`  posEntries:`, posEntries.map(([k, v]) => `${k}: qty=${v.qty}`))

  for (const [rokok_id, { qty, grossKeluar }] of posEntries) {
    const proportion = totalPosGrossKeluar > 0 ? grossKeluar / totalPosGrossKeluar : 1 / posEntries.length
    const tukarUang  = Math.round(selisihUang * proportion)
    console.log(`  -> ${rokok_id}: TB qty=${qty}, TB uang=Rp ${tukarUang.toLocaleString("id-ID")}`)
    if (tukarUang === 0) {
      console.log(`  ✅ CORRECT: TB uang = Rp 0 (selisih = 0)`)
    } else {
      console.log(`  ❌ WRONG: TB uang should be Rp 0`)
    }
  }

  console.log()

  // Test Case 2: Toko bayar lebih (SCHIOSMAS keluar, ALMAZ BOLD masuk - beda harga)
  const tukar2 = {
    itemsKeluar: [{ rokok_id: "SCHIOSMAS", qty: 20, harga_satuan: 9700 }],
    itemsMasuk:  [{ rokok_id: "ALMAZ_BOLD", qty: 5, harga_satuan: 23500 }],
  }
  const tm2 = tukar2.itemsMasuk.reduce((s, it) => s + it.qty * it.harga_satuan, 0)
  const tk2 = tukar2.itemsKeluar.reduce((s, it) => s + it.qty * it.harga_satuan, 0)
  const selisih2 = tk2 - tm2

  console.log(`Test Case 2: Tukar tidak setara (selisih positif)`)
  console.log(`  SCHIOSMAS KRETEK keluar 20 @ 9700 = Rp ${tk2.toLocaleString("id-ID")}`)
  console.log(`  ALMAZ BOLD masuk 5 @ 23500 = Rp ${tm2.toLocaleString("id-ID")}`)
  console.log(`  selisihUang = Rp ${selisih2.toLocaleString("id-ID")}`)

  const nb2 = {}
  for (const it of tukar2.itemsKeluar) {
    if (!nb2[it.rokok_id]) nb2[it.rokok_id] = { qty: 0, grossKeluar: 0 }
    nb2[it.rokok_id].qty += it.qty
    nb2[it.rokok_id].grossKeluar += it.qty * it.harga_satuan
  }
  for (const it of tukar2.itemsMasuk) {
    if (!nb2[it.rokok_id]) nb2[it.rokok_id] = { qty: 0, grossKeluar: 0 }
    nb2[it.rokok_id].qty -= it.qty
  }
  const pos2 = Object.entries(nb2).filter(([, v]) => v.qty > 0)
  const tpgk2 = pos2.reduce((s, [, v]) => s + v.grossKeluar, 0)
  for (const [rokok_id, { qty, grossKeluar }] of pos2) {
    const proportion = tpgk2 > 0 ? grossKeluar / tpgk2 : 1 / pos2.length
    const tukarUang  = Math.round(selisih2 * proportion)
    console.log(`  -> ${rokok_id}: TB qty=${qty}, TB uang=Rp ${tukarUang.toLocaleString("id-ID")}`)
    console.log(`     (selisih=Rp ${selisih2.toLocaleString("id-ID")}, proporsi=${(proportion*100).toFixed(1)}%)`)
  }

  console.log()

  // Test Case 3: Sama produk, keluar lebih banyak (net positif)
  const tukar3 = {
    itemsKeluar: [{ rokok_id: "SCHIOSMAS", qty: 30, harga_satuan: 9700 }],
    itemsMasuk:  [{ rokok_id: "SCHIOSMAS", qty: 10, harga_satuan: 9700 }],
  }
  const tm3 = tukar3.itemsMasuk.reduce((s, it) => s + it.qty * it.harga_satuan, 0)
  const tk3 = tukar3.itemsKeluar.reduce((s, it) => s + it.qty * it.harga_satuan, 0)
  const selisih3 = tk3 - tm3

  console.log(`Test Case 3: Sama produk, keluar>masuk`)
  console.log(`  SCHIOSMAS keluar 30, masuk 10, selisih=${selisih3.toLocaleString("id-ID")}`)

  const nb3 = {}
  for (const it of tukar3.itemsKeluar) {
    if (!nb3[it.rokok_id]) nb3[it.rokok_id] = { qty: 0, grossKeluar: 0 }
    nb3[it.rokok_id].qty += it.qty
    nb3[it.rokok_id].grossKeluar += it.qty * it.harga_satuan
  }
  for (const it of tukar3.itemsMasuk) {
    if (!nb3[it.rokok_id]) nb3[it.rokok_id] = { qty: 0, grossKeluar: 0 }
    nb3[it.rokok_id].qty -= it.qty
  }
  const pos3 = Object.entries(nb3).filter(([, v]) => v.qty > 0)
  const tpgk3 = pos3.reduce((s, [, v]) => s + v.grossKeluar, 0)
  for (const [rokok_id, { qty, grossKeluar }] of pos3) {
    const proportion = tpgk3 > 0 ? grossKeluar / tpgk3 : 1 / pos3.length
    const tukarUang  = Math.round(selisih3 * proportion)
    console.log(`  -> ${rokok_id}: TB qty=${qty} (net), TB uang=Rp ${tukarUang.toLocaleString("id-ID")}`)
    const expected = selisih3
    console.log(`     Expected: Rp ${expected.toLocaleString("id-ID")} ${tukarUang === expected ? "✅" : "❌"}`)
  }
}

testTukarBarangFix()
