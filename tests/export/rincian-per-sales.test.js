import { describe, it, expect } from "vitest"
import { buildRincianPerSalesData } from "@/lib/export-rincian-sales"

// ─── Fixtures ────────────────────────────────────────────────────────────────

const rokokList = [
  { id: "r1", nama: "Produk A", urutan: 1, harga_beli: 10000, harga_grosir: 11000, harga_toko: 12000 },
  { id: "r2", nama: "Produk B", urutan: 2, harga_beli: 9000,  harga_grosir: 10000, harga_toko: 11000 },
  { id: "r3", nama: "Produk C", urutan: 3, harga_beli: 8000,  harga_grosir: 9000,  harga_toko: 10000 },
]

function makeSesi(salesName, overrides = {}) {
  return {
    sales: salesName,
    penjualan:               [],
    konsinyasi:              [],
    tukarBarangSelesaiDiSesi: [],
    ...overrides,
  }
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe("buildRincianPerSalesData", () => {
  // ── 1. Kosong ────────────────────────────────────────────────────────────
  it("returns empty when no rows", () => {
    const { dataMap, sortedRokokIds, activeSales } = buildRincianPerSalesData([], rokokList)
    expect(sortedRokokIds).toHaveLength(0)
    expect(activeSales).toHaveLength(0)
    expect(dataMap).toEqual({})
  })

  it("returns empty when sesi has no penjualan/konsinyasi/tukar", () => {
    const rows = [makeSesi("Sales A")]
    const { sortedRokokIds } = buildRincianPerSalesData(rows, rokokList)
    expect(sortedRokokIds).toHaveLength(0)
  })

  // ── 2. Penjualan Langsung ─────────────────────────────────────────────────
  it("counts penjualan langsung correctly per sales", () => {
    const rows = [
      makeSesi("DANDI", { penjualan: [{ rokok_id: "r1", qty: 5, harga: 11000 }, { rokok_id: "r2", qty: 3, harga: 10000 }] }),
      makeSesi("MAS AMAR", { penjualan: [{ rokok_id: "r1", qty: 2, harga: 12000 }] }),
    ]
    const { dataMap } = buildRincianPerSalesData(rows, rokokList)
    expect(dataMap["r1"]["DANDI"].langsungQty).toBe(5)
    expect(dataMap["r1"]["DANDI"].langsungUang).toBe(55000)
    expect(dataMap["r2"]["DANDI"].langsungQty).toBe(3)
    expect(dataMap["r2"]["DANDI"].langsungUang).toBe(30000)
    expect(dataMap["r1"]["MAS AMAR"].langsungQty).toBe(2)
    expect(dataMap["r1"]["MAS AMAR"].langsungUang).toBe(24000)
  })

  it("aggregates multiple sessions of same sales for penjualan", () => {
    const rows = [
      makeSesi("DANDI", { penjualan: [{ rokok_id: "r1", qty: 5, harga: 11000 }] }),
      makeSesi("DANDI", { penjualan: [{ rokok_id: "r1", qty: 3, harga: 11000 }] }),
    ]
    const { dataMap } = buildRincianPerSalesData(rows, rokokList)
    expect(dataMap["r1"]["DANDI"].langsungQty).toBe(8)
    expect(dataMap["r1"]["DANDI"].langsungUang).toBe(88000)
  })

  // ── 3. Titip Jual Selesai ─────────────────────────────────────────────────
  it("counts titip jual selesai (qty_terjual) per sales", () => {
    const rows = [
      makeSesi("PAK TROY", {
        konsinyasi: [
          {
            status: "selesai",
            items: [
              { rokok_id: "r2", qty_terjual: 10, harga: 10000 },
              { rokok_id: "r3", qty_terjual: 0, harga: 9000 },  // 0 → should not count
            ],
          },
        ],
      }),
    ]
    const { dataMap } = buildRincianPerSalesData(rows, rokokList)
    expect(dataMap["r2"]["PAK TROY"].titipQty).toBe(10)
    expect(dataMap["r2"]["PAK TROY"].titipUang).toBe(100000)
    expect(dataMap["r3"]).toBeUndefined()  // qty_terjual 0 → not added
  })

  it("ignores titip jual with status !== selesai", () => {
    const rows = [
      makeSesi("PAK TROY", {
        konsinyasi: [
          { status: "aktif", items: [{ rokok_id: "r1", qty_terjual: 20, harga: 11000 }] },
        ],
      }),
    ]
    const { dataMap } = buildRincianPerSalesData(rows, rokokList)
    expect(dataMap["r1"]).toBeUndefined()
  })

  // ── 4. Tukar Barang Selesai ───────────────────────────────────────────────
  it("counts tukar barang selesai: uang = selisih (keluar - masuk), qty = net per rokok", () => {
    const rows = [
      makeSesi("MAS BOBI", {
        tukarBarangSelesaiDiSesi: [
          {
            id: "tb1",
            status: "selesai",
            // Tidak ada itemsMasuk → selisih = gross keluar
            itemsMasuk:  [],
            itemsKeluar: [{ rokok_id: "r1", qty: 7, harga_satuan: 11000 }, { rokok_id: "r3", qty: 4, harga_satuan: 9000 }],
          },
        ],
      }),
    ]
    const { dataMap } = buildRincianPerSalesData(rows, rokokList)
    expect(dataMap["r1"]["MAS BOBI"].tukarQty).toBe(7)
    // selisih = (7×11000 + 4×9000) - 0 = 77000+36000 = 113000
    // distribusi proporsional: r1 → 77000/113000 × 113000 = 77000
    expect(dataMap["r1"]["MAS BOBI"].tukarUang).toBe(77000)
    expect(dataMap["r3"]["MAS BOBI"].tukarQty).toBe(4)
    // distribusi proporsional: r3 → 36000/113000 × 113000 = 36000
    expect(dataMap["r3"]["MAS BOBI"].tukarUang).toBe(36000)
  })

  it("tukar barang beda produk dihitung per produk (keluar positif, masuk negatif)", () => {
    const rows = [
      makeSesi("MAS BOBI", {
        tukarBarangSelesaiDiSesi: [
          {
            id: "tb2",
            status: "selesai",
            itemsMasuk:  [{ rokok_id: "r2", qty: 5, harga_satuan: 10000 }],
            itemsKeluar: [{ rokok_id: "r1", qty: 3, harga_satuan: 11000 }],
          },
        ],
      }),
    ]
    const { dataMap } = buildRincianPerSalesData(rows, rokokList)
    
    // r1 keluar (pengganti)
    expect(dataMap["r1"]["MAS BOBI"].tukarQty).toBe(3)
    expect(dataMap["r1"]["MAS BOBI"].tukarUang).toBe(33000)
    
    // r2 masuk (dari customer) -> dihitung sebagai retur negatif
    expect(dataMap["r2"]["MAS BOBI"].tukarQty).toBe(-5)
    expect(dataMap["r2"]["MAS BOBI"].tukarUang).toBe(-50000)
  })

  it("tukar barang setara nilai (produk sama) -> dihitung terpisah per keluar/masuk", () => {
    const rows = [
      makeSesi("PAK TROY", {
        tukarBarangSelesaiDiSesi: [
          {
            id: "tb3",
            status: "selesai",
            itemsMasuk:  [{ rokok_id: "r1", qty: 20, harga_satuan: 9700 }],
            itemsKeluar: [{ rokok_id: "r1", qty: 20, harga_satuan: 9700 }],
          },
        ],
      }),
    ]
    const { dataMap } = buildRincianPerSalesData(rows, rokokList)
    
    // Karena r1 keluar 20 dan masuk 20 pada rokok_id yang SAMA, logic lama vs baru per-produk:
    // addData(r1, tukarQty: 20, tukarUang: 194000)
    // addData(r1, tukarQty: -20, tukarUang: -194000)
    // Hasilnya net menjadi 0.
    expect(dataMap["r1"]["PAK TROY"].tukarQty).toBe(0)
    expect(dataMap["r1"]["PAK TROY"].tukarUang).toBe(0)
  })

  // ── 5. Kombinasi semua sumber ─────────────────────────────────────────────
  it("aggregates all sources (penjualan + titip jual + tukar barang) for same sales and rokok", () => {
    const rows = [
      makeSesi("DANDI", {
        penjualan: [{ rokok_id: "r1", qty: 10, harga: 11000 }],
        konsinyasi: [
          { id: "k1", status: "selesai", items: [{ rokok_id: "r1", qty_terjual: 5, harga: 11000 }] },
        ],
        tukarBarangSelesaiDiSesi: [
          { id: "tb4", status: "selesai", itemsKeluar: [{ rokok_id: "r1", qty: 3, harga_satuan: 11000 }] },
        ],
      }),
    ]
    const { dataMap } = buildRincianPerSalesData(rows, rokokList)
    expect(dataMap["r1"]["DANDI"].langsungQty).toBe(10)
    expect(dataMap["r1"]["DANDI"].langsungUang).toBe(110000)
    expect(dataMap["r1"]["DANDI"].titipQty).toBe(5)
    expect(dataMap["r1"]["DANDI"].titipUang).toBe(55000)
    expect(dataMap["r1"]["DANDI"].tukarQty).toBe(3)
    expect(dataMap["r1"]["DANDI"].tukarUang).toBe(33000)
  })

  it("handles multiple sales with mixed sources correctly", () => {
    const rows = [
      makeSesi("DANDI", {
        penjualan:  [{ rokok_id: "r1", qty: 6, harga: 11000 }],
        konsinyasi: [{ id: "k2", status: "selesai", items: [{ rokok_id: "r2", qty_terjual: 4, harga: 10000 }] }],
      }),
      makeSesi("PAK YAHMIN", {
        penjualan:               [{ rokok_id: "r1", qty: 8, harga: 11000 }],
        tukarBarangSelesaiDiSesi: [{ id: "tb5", status: "selesai", itemsKeluar: [{ rokok_id: "r3", qty: 2, harga_satuan: 9000 }] }],
      }),
    ]
    const { dataMap, activeSales } = buildRincianPerSalesData(rows, rokokList)

    expect(dataMap["r1"]["DANDI"].langsungQty).toBe(6)
    expect(dataMap["r2"]["DANDI"].titipQty).toBe(4)
    expect(dataMap["r1"]["PAK YAHMIN"].langsungQty).toBe(8)
    expect(dataMap["r3"]["PAK YAHMIN"].tukarQty).toBe(2)
    // DANDI harus tidak punya r3
    expect(dataMap["r3"]?.["DANDI"]).toBeUndefined()
    // activeSales sorted alphabetically
    expect(activeSales).toEqual(["DANDI", "PAK YAHMIN"])
  })

  // ── 6. rokokMeta ─────────────────────────────────────────────────────────
  it("returns correct rokokMeta with all harga fields", () => {
    const rows = [makeSesi("DANDI", { penjualan: [{ rokok_id: "r1", qty: 1, harga: 11000 }] })]
    const { rokokMeta } = buildRincianPerSalesData(rows, rokokList)
    expect(rokokMeta["r1"]).toEqual({
      nama:         "Produk A",
      urutan:       1,
      harga_beli:   10000,
      harga_grosir: 11000,
      harga_toko:   12000,
    })
  })

  // ── 7. Urutan sortedRokokIds ──────────────────────────────────────────────
  it("sorts sortedRokokIds by urutan ascending", () => {
    const rows = [
      makeSesi("DANDI", {
        penjualan: [
          { rokok_id: "r3", qty: 1, harga: 9000 },
          { rokok_id: "r1", qty: 1, harga: 11000 },
          { rokok_id: "r2", qty: 1, harga: 10000 },
        ],
      }),
    ]
    const { sortedRokokIds } = buildRincianPerSalesData(rows, rokokList)
    expect(sortedRokokIds).toEqual(["r1", "r2", "r3"])
  })
})
