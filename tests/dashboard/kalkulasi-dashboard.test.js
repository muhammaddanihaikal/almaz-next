import { describe, it, expect } from "vitest"
import { calculateStats } from "@/lib/dashboard-utils"

describe("Dashboard Calculation Logic", () => {
  const mockRokokById = new Map([
    ["rokok-1", { id: "rokok-1", nama: "Almaz Bold", harga_beli: 10000, harga_grosir: 12000 }],
    ["rokok-2", { id: "rokok-2", nama: "Almaz Pro", harga_beli: 15000, harga_grosir: 18000 }],
  ])

  const mockRange = { start: "2024-05-01", end: "2024-05-31" }
  const mockIsDateInRange = (tgl, range) => tgl >= range.start && tgl <= range.end

  const mockSesi = [
    {
      id: "sesi-1",
      tanggal: "2024-05-10",
      penjualan: [
        { rokok_id: "rokok-1", qty: 10, harga: 12000 }, // Omzet: 120.000, Qty: 10
      ],
      konsinyasi: [
        {
          items: [
            { rokok_id: "rokok-2", qty_keluar: 20, harga: 18000 }, // Omzet: 360.000, Qty: 20
          ],
        },
      ],
      tukarBarang: [
        {
          id: "tukar-1",
          status: "selesai",
          itemsKeluar: [{ rokok_id: "rokok-1", qty: 5, harga_satuan: 12000 }], // Qty: 5, Nilai: 60.000
          itemsMasuk: [{ rokok_id: "rokok-1", qty: 2, harga_satuan: 12000 }], // Qty: 2, Nilai: 24.000
        },
      ],
      setoran: [{ jumlah: 500000, metode: "cash" }],
      barangKeluar: [{ qty: 100 }],
      barangKembali: [{ qty: 68 }], // Net Keluar Sesi: 32
    },
  ]

  it("calculates Qty Breakdown correctly", () => {
    const stats = calculateStats(mockSesi, [], [], mockRokokById, mockRange, mockIsDateInRange)

    expect(stats.qtyBreakdown.langsung).toBe(10)
    expect(stats.qtyBreakdown.titipJual).toBe(20)
    expect(stats.qtyBreakdown.tukarBarang).toBe(5)
    expect(stats.qtyBreakdown.total).toBe(32) // Physical Net (100-68)
  })

  it("calculates Revenue Breakdown correctly", () => {
    const stats = calculateStats(mockSesi, [], [], mockRokokById, mockRange, mockIsDateInRange)

    expect(stats.penjualanBreakdown.langsung).toBe(120000)
    expect(stats.penjualanBreakdown.titipJual).toBe(0) // 0 because second arg (titipProfitRows) is empty
    expect(stats.penjualanBreakdown.tukarBarang).toBe(36000) // Net Gain (Keluar 60k - Masuk 24k)
    expect(stats.penjualanBreakdown.total).toBe(120000 + 0 + 36000)
  })

  it("calculates Total Setoran correctly", () => {
    const stats = calculateStats(mockSesi, [], [], mockRokokById, mockRange, mockIsDateInRange)
    expect(stats.totalSetoran).toBe(500000)
  })

  it("calculates Total Net Keluar correctly", () => {
    const stats = calculateStats(mockSesi, [], [], mockRokokById, mockRange, mockIsDateInRange)
    expect(stats.totalKeluar).toBe(32)
  })

  it("calculates Total Profit (including Tukar Barang) correctly", () => {
    const stats = calculateStats(mockSesi, [], [], mockRokokById, mockRange, mockIsDateInRange)
    // Direct profit: 10 * (12000 - 10000) = 20000
    // Tukar Barang net profit: (5 * (12000 - 10000)) - (2 * (12000 - 10000)) = 10000 - 4000 = 6000
    // Total profit: 20000 + 6000 = 26000
    expect(stats.profit).toBe(26000)
  })

  it("excludes aktif tukar barang from omzet and profit", () => {
    const sesiWithAktifTukar = [
      {
        ...mockSesi[0],
        tukarBarang: [
          {
            id: "tukar-aktif",
            status: "aktif",
            itemsKeluar: [],
            itemsMasuk: [{ rokok_id: "rokok-1", qty: 3, harga_satuan: 12000 }],
          },
        ],
      },
    ]
    const stats = calculateStats(sesiWithAktifTukar, [], [], mockRokokById, mockRange, mockIsDateInRange)

    // Tukar barang aktif should NOT count towards omzet or profit
    expect(stats.penjualanBreakdown.tukarBarang).toBe(0)
    expect(stats.penjualanBreakdown.total).toBe(120000) // Only langsung
    // Profit should only be from penjualan langsung
    expect(stats.profit).toBe(20000) // 10 * (12000 - 10000)
  })
})

