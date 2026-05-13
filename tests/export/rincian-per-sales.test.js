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
      makeSesi("DANDI", { penjualan: [{ rokok_id: "r1", qty: 5 }, { rokok_id: "r2", qty: 3 }] }),
      makeSesi("MAS AMAR", { penjualan: [{ rokok_id: "r1", qty: 2 }] }),
    ]
    const { dataMap } = buildRincianPerSalesData(rows, rokokList)
    expect(dataMap["r1"]["DANDI"]).toBe(5)
    expect(dataMap["r2"]["DANDI"]).toBe(3)
    expect(dataMap["r1"]["MAS AMAR"]).toBe(2)
  })

  it("aggregates multiple sessions of same sales for penjualan", () => {
    const rows = [
      makeSesi("DANDI", { penjualan: [{ rokok_id: "r1", qty: 5 }] }),
      makeSesi("DANDI", { penjualan: [{ rokok_id: "r1", qty: 3 }] }),
    ]
    const { dataMap } = buildRincianPerSalesData(rows, rokokList)
    expect(dataMap["r1"]["DANDI"]).toBe(8)
  })

  // ── 3. Titip Jual Selesai ─────────────────────────────────────────────────
  it("counts titip jual selesai (qty_terjual) per sales", () => {
    const rows = [
      makeSesi("PAK TROY", {
        konsinyasi: [
          {
            status: "selesai",
            items: [
              { rokok_id: "r2", qty_terjual: 10 },
              { rokok_id: "r3", qty_terjual: 0 },  // 0 → should not count
            ],
          },
        ],
      }),
    ]
    const { dataMap } = buildRincianPerSalesData(rows, rokokList)
    expect(dataMap["r2"]["PAK TROY"]).toBe(10)
    expect(dataMap["r3"]).toBeUndefined()  // qty_terjual 0 → not added
  })

  it("ignores titip jual with status !== selesai", () => {
    const rows = [
      makeSesi("PAK TROY", {
        konsinyasi: [
          { status: "aktif", items: [{ rokok_id: "r1", qty_terjual: 20 }] },
        ],
      }),
    ]
    const { dataMap } = buildRincianPerSalesData(rows, rokokList)
    expect(dataMap["r1"]).toBeUndefined()
  })

  // ── 4. Tukar Barang Selesai ───────────────────────────────────────────────
  it("counts tukar barang selesai itemsKeluar per sales", () => {
    const rows = [
      makeSesi("MAS BOBI", {
        tukarBarangSelesaiDiSesi: [
          {
            itemsKeluar: [{ rokok_id: "r1", qty: 7 }, { rokok_id: "r3", qty: 4 }],
          },
        ],
      }),
    ]
    const { dataMap } = buildRincianPerSalesData(rows, rokokList)
    expect(dataMap["r1"]["MAS BOBI"]).toBe(7)
    expect(dataMap["r3"]["MAS BOBI"]).toBe(4)
  })

  it("does NOT count tukar barang itemsMasuk (barang retur dari customer)", () => {
    const rows = [
      makeSesi("MAS BOBI", {
        tukarBarangSelesaiDiSesi: [
          {
            itemsMasuk:  [{ rokok_id: "r2", qty: 5 }],  // retur dari customer → tidak dihitung
            itemsKeluar: [{ rokok_id: "r1", qty: 3 }],  // pengganti → dihitung
          },
        ],
      }),
    ]
    const { dataMap } = buildRincianPerSalesData(rows, rokokList)
    expect(dataMap["r1"]["MAS BOBI"]).toBe(3)
    expect(dataMap["r2"]).toBeUndefined()
  })

  // ── 5. Kombinasi semua sumber ─────────────────────────────────────────────
  it("aggregates all sources (penjualan + titip jual + tukar barang) for same sales and rokok", () => {
    const rows = [
      makeSesi("DANDI", {
        penjualan: [{ rokok_id: "r1", qty: 10 }],
        konsinyasi: [
          { status: "selesai", items: [{ rokok_id: "r1", qty_terjual: 5 }] },
        ],
        tukarBarangSelesaiDiSesi: [
          { itemsKeluar: [{ rokok_id: "r1", qty: 3 }] },
        ],
      }),
    ]
    const { dataMap } = buildRincianPerSalesData(rows, rokokList)
    // 10 (penjualan) + 5 (titip jual) + 3 (tukar) = 18
    expect(dataMap["r1"]["DANDI"]).toBe(18)
  })

  it("handles multiple sales with mixed sources correctly", () => {
    const rows = [
      makeSesi("DANDI", {
        penjualan:  [{ rokok_id: "r1", qty: 6 }],
        konsinyasi: [{ status: "selesai", items: [{ rokok_id: "r2", qty_terjual: 4 }] }],
      }),
      makeSesi("PAK YAHMIN", {
        penjualan:               [{ rokok_id: "r1", qty: 8 }],
        tukarBarangSelesaiDiSesi: [{ itemsKeluar: [{ rokok_id: "r3", qty: 2 }] }],
      }),
    ]
    const { dataMap, activeSales } = buildRincianPerSalesData(rows, rokokList)

    expect(dataMap["r1"]["DANDI"]).toBe(6)
    expect(dataMap["r2"]["DANDI"]).toBe(4)
    expect(dataMap["r1"]["PAK YAHMIN"]).toBe(8)
    expect(dataMap["r3"]["PAK YAHMIN"]).toBe(2)
    // DANDI harus tidak punya r3
    expect(dataMap["r3"]?.["DANDI"]).toBeUndefined()
    // activeSales sorted alphabetically
    expect(activeSales).toEqual(["DANDI", "PAK YAHMIN"])
  })

  // ── 6. rokokMeta ─────────────────────────────────────────────────────────
  it("returns correct rokokMeta with all harga fields", () => {
    const rows = [makeSesi("DANDI", { penjualan: [{ rokok_id: "r1", qty: 1 }] })]
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
          { rokok_id: "r3", qty: 1 },
          { rokok_id: "r1", qty: 1 },
          { rokok_id: "r2", qty: 1 },
        ],
      }),
    ]
    const { sortedRokokIds } = buildRincianPerSalesData(rows, rokokList)
    expect(sortedRokokIds).toEqual(["r1", "r2", "r3"])
  })
})
