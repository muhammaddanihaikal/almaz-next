import { describe, it, expect } from "vitest"
import {
  fmtIDR,
  fmtTanggal,
  filterByDateRange,
  sortByDateDesc,
  defaultDateRange,
  getDateRanges,
  hitungProfit,
} from "@/lib/utils"

// ─── fmtIDR ──────────────────────────────────────────────────────────────────

describe("fmtIDR", () => {
  it("format angka ke rupiah", () => {
    expect(fmtIDR(15000)).toContain("15.000")
    expect(fmtIDR(1000000)).toContain("1.000.000")
  })

  it("angka 0 → Rp 0", () => {
    expect(fmtIDR(0)).toContain("0")
  })

  it("null/undefined → Rp 0 (fallback)", () => {
    expect(fmtIDR(null)).toContain("0")
    expect(fmtIDR(undefined)).toContain("0")
  })

  it("mengandung simbol mata uang IDR", () => {
    const result = fmtIDR(5000)
    expect(result).toMatch(/Rp|IDR/)
  })
})

// ─── fmtTanggal ──────────────────────────────────────────────────────────────

describe("fmtTanggal", () => {
  it("format ISO date ke lokal Indonesia", () => {
    const result = fmtTanggal("2025-05-09")
    expect(result).toContain("2025")
    expect(result).toMatch(/Mei|May/)
    expect(result).toContain("09")
  })

  it("string invalid dikembalikan apa adanya", () => {
    expect(fmtTanggal("bukan-tanggal")).toBe("bukan-tanggal")
  })
})

// ─── filterByDateRange ───────────────────────────────────────────────────────

describe("filterByDateRange", () => {
  const rows = [
    { tanggal: "2025-05-01" },
    { tanggal: "2025-05-10" },
    { tanggal: "2025-05-20" },
    { tanggal: "2025-06-01" },
  ]

  it("filter data dalam range — hanya tanggal yang masuk range lolos", () => {
    const result = filterByDateRange(rows, { start: "2025-05-01", end: "2025-05-20" })
    expect(result).toHaveLength(3)
    expect(result.map((r) => r.tanggal)).toEqual(["2025-05-01", "2025-05-10", "2025-05-20"])
  })

  it("tanggal tepat di batas start dan end ikut masuk (inclusive)", () => {
    const result = filterByDateRange(rows, { start: "2025-05-10", end: "2025-05-10" })
    expect(result).toHaveLength(1)
    expect(result[0].tanggal).toBe("2025-05-10")
  })

  it("tidak ada data yang lolos jika range tidak mencakup apapun", () => {
    const result = filterByDateRange(rows, { start: "2025-07-01", end: "2025-07-31" })
    expect(result).toHaveLength(0)
  })

  it("tanpa range → return semua data (tidak difilter)", () => {
    expect(filterByDateRange(rows, null)).toHaveLength(4)
    expect(filterByDateRange(rows, {})).toHaveLength(4)
    expect(filterByDateRange(rows, { start: "2025-05-01" })).toHaveLength(4) // end kosong
  })

  it("array kosong → return array kosong", () => {
    expect(filterByDateRange([], { start: "2025-05-01", end: "2025-05-31" })).toHaveLength(0)
  })
})

// ─── sortByDateDesc ───────────────────────────────────────────────────────────

describe("sortByDateDesc", () => {
  it("urutkan dari terbaru ke terlama", () => {
    const rows = [
      { tanggal: "2025-05-01" },
      { tanggal: "2025-05-20" },
      { tanggal: "2025-05-10" },
    ]
    const result = sortByDateDesc(rows)
    expect(result[0].tanggal).toBe("2025-05-20")
    expect(result[1].tanggal).toBe("2025-05-10")
    expect(result[2].tanggal).toBe("2025-05-01")
  })

  it("tidak mengubah array asli (immutable)", () => {
    const rows = [{ tanggal: "2025-05-01" }, { tanggal: "2025-05-20" }]
    sortByDateDesc(rows)
    expect(rows[0].tanggal).toBe("2025-05-01") // urutan asli tidak berubah
  })

  it("satu elemen → tetap satu elemen", () => {
    expect(sortByDateDesc([{ tanggal: "2025-05-01" }])).toHaveLength(1)
  })
})

// ─── getDateRanges & defaultDateRange ────────────────────────────────────────

describe("getDateRanges", () => {
  it("semua preset tersedia: hari_ini, minggu_ini, bulan_ini", () => {
    const ranges = getDateRanges()
    expect(ranges).toHaveProperty("hari_ini")
    expect(ranges).toHaveProperty("minggu_ini")
    expect(ranges).toHaveProperty("bulan_ini")
  })

  it("setiap preset punya start dan end", () => {
    const ranges = getDateRanges()
    for (const key of ["hari_ini", "minggu_ini", "bulan_ini"]) {
      expect(ranges[key]).toHaveProperty("start")
      expect(ranges[key]).toHaveProperty("end")
      expect(ranges[key].start).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(ranges[key].end).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it("hari_ini: start === end === hari ini", () => {
    const today = new Date()
    const fmt = (d) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    const { hari_ini } = getDateRanges()
    expect(hari_ini.start).toBe(fmt(today))
    expect(hari_ini.end).toBe(fmt(today))
  })

  it("bulan_ini: start = tanggal 1 bulan ini, end = akhir bulan ini", () => {
    const today = new Date()
    const { bulan_ini } = getDateRanges()
    expect(bulan_ini.start).toMatch(/-01$/)
    const endDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
    expect(bulan_ini.end).toMatch(new RegExp(`-${endDay}$`))
  })

  it("minggu_ini: start adalah Senin, end adalah Minggu", () => {
    const { minggu_ini } = getDateRanges()
    const startDay = new Date(minggu_ini.start).getDay() // 0=Minggu, 1=Senin
    const endDay   = new Date(minggu_ini.end).getDay()
    expect(startDay).toBe(1) // Senin
    expect(endDay).toBe(0)   // Minggu
  })
})

describe("defaultDateRange", () => {
  it("default preset 'bulan_ini' — return range bulan ini", () => {
    const result = defaultDateRange()
    expect(result.preset).toBe("bulan_ini")
    expect(result).toHaveProperty("start")
    expect(result).toHaveProperty("end")
  })

  it("preset 'hari_ini' — return range hari ini", () => {
    const result = defaultDateRange("hari_ini")
    expect(result.preset).toBe("hari_ini")
    expect(result.start).toBe(result.end)
  })
})

// ─── hitungProfit ─────────────────────────────────────────────────────────────

describe("hitungProfit", () => {
  const rokokList = [
    { nama: "Rokok A", harga_beli: 10000 },
    { nama: "Rokok B", harga_beli: 8000  },
  ]

  it("hitung profit dari selisih harga jual dan harga beli", () => {
    const penjualan = {
      masukItems: [
        { rokok: "Rokok A", qty: 2, harga: 12000 }, // profit: 2*(12000-10000) = 4000
        { rokok: "Rokok B", qty: 3, harga: 10000 }, // profit: 3*(10000-8000)  = 6000
      ],
    }
    expect(hitungProfit(rokokList, penjualan)).toBe(10000)
  })

  it("rokok tidak ada di daftar → profit 0 untuk item itu", () => {
    const penjualan = {
      masukItems: [{ rokok: "Rokok Tidak Ada", qty: 5, harga: 15000 }],
    }
    expect(hitungProfit(rokokList, penjualan)).toBe(0)
  })

  it("harga jual = harga beli → profit 0", () => {
    const penjualan = {
      masukItems: [{ rokok: "Rokok A", qty: 5, harga: 10000 }],
    }
    expect(hitungProfit(rokokList, penjualan)).toBe(0)
  })

  it("masukItems kosong → profit 0", () => {
    expect(hitungProfit(rokokList, { masukItems: [] })).toBe(0)
    expect(hitungProfit(rokokList, {})).toBe(0)
  })
})
