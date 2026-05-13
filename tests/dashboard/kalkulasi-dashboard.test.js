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
          itemsKeluar: [{ qty: 5, harga_satuan: 12000 }], // Qty: 5, Nilai: 60.000
          itemsMasuk: [{ qty: 2, harga_satuan: 12000 }], // Qty: 2, Nilai: 24.000
        },
      ],
      setoran: [{ jumlah: 500000, metode: "cash" }],
      barangKeluar: [{ qty: 100 }],
      barangKembali: [{ qty: 68 }], // Net Keluar Sesi: 32
    },
  ]

  it("calculates Qty Breakdown correctly", () => {
    const stats = calculateStats(mockSesi, [], [], [], mockRokokById, mockRange, mockIsDateInRange)

    expect(stats.qtyBreakdown.langsung).toBe(10)
    expect(stats.qtyBreakdown.titipJual).toBe(20)
    expect(stats.qtyBreakdown.tukarBarang).toBe(5)
    expect(stats.qtyBreakdown.total).toBe(35)
  })

  it("calculates Revenue Breakdown correctly", () => {
    const stats = calculateStats(mockSesi, [], [], [], mockRokokById, mockRange, mockIsDateInRange)

    expect(stats.penjualanBreakdown.langsung).toBe(120000)
    expect(stats.penjualanBreakdown.titipJual).toBe(360000)
    expect(stats.penjualanBreakdown.tukarBarang).toBe(-36000) // Nilai Tukar (Masuk - Keluar)
    expect(stats.penjualanBreakdown.total).toBe(120000 + 360000 - 36000)
  })

  it("calculates Total Setoran correctly", () => {
    const stats = calculateStats(mockSesi, [], [], [], mockRokokById, mockRange, mockIsDateInRange)
    expect(stats.totalSetoran).toBe(500000)
  })

  it("calculates Total Net Keluar correctly", () => {
    const stats = calculateStats(mockSesi, [], [], [], mockRokokById, mockRange, mockIsDateInRange)
    expect(stats.totalKeluar).toBe(32)
  })
})
