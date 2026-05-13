import { describe, it, expect, afterEach, afterAll, vi } from "vitest"
import { prisma } from "@/lib/db"
import { mutateStock, getStock } from "@/lib/stock"
import { tambahStok, tambahStokSampleBiasa, pindahStokSampleCukai, konversiKeSampleCukai, getMutasiStok } from "@/actions/rokok"
import { saveSesiSampleKeluar, saveSesiSampleKembali, revertSesiSampleKeluar } from "@/actions/sample"

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag:  vi.fn(),
  unstable_cache: (_fn) => _fn,
}))

vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({
    user: { id: null, name: "Test User", role: "admin" },
  }),
}))

const TEST_NAMA = "__TEST_MULTI_POOL__"
const TEST_DATE = "2099-12-01"
let testRokok = null
let testSales = null

async function createTestRokok() {
  const uniqueNama = `${TEST_NAMA}_${Math.random().toString(36).substring(7)}`
  testRokok = await prisma.rokok.create({
    data: {
      nama:             uniqueNama,
      stok:             0,
      stok_sample_cukai: 0,
      stok_sample_biasa: 0,
      harga_beli:       10000,
      harga_grosir:     12000,
      harga_toko:       13000,
      harga_perorangan: 14000,
      urutan:           9999,
    },
  })
  return testRokok
}

async function createTestSales() {
  const uniqueNama = `__TEST_SALES__${Math.random().toString(36).substring(7)}`
  testSales = await prisma.sales.create({
    data: { nama: uniqueNama },
  })
  return testSales
}

async function cleanup() {
  // Ambil rokok test jika ada (prefix TEST_NAMA)
  const rokokList = await prisma.rokok.findMany({ where: { nama: { startsWith: TEST_NAMA } } })
  const rokokIds = rokokList.map(r => r.id)

  if (rokokIds.length > 0) {
    await prisma.auditLog.deleteMany({ where: { entity_id: { in: rokokIds } } })
    await prisma.stockMutation.deleteMany({ where: { rokok_id: { in: rokokIds } } })
    await prisma.stokMasuk.deleteMany({ where: { rokok_id: { in: rokokIds } } })
    await prisma.sampleCukaiKonversi.deleteMany({ where: { rokok_id: { in: rokokIds } } })
    await prisma.closingHarian.deleteMany({ where: { rokok_id: { in: rokokIds } } })
    await prisma.sesiSample.deleteMany({ where: { rokok_id: { in: rokokIds } } })
    await prisma.sesiPenjualan.deleteMany({ where: { rokok_id: { in: rokokIds } } })
    await prisma.sesiBarangKeluar.deleteMany({ where: { rokok_id: { in: rokokIds } } })
    await prisma.sesiBarangKembali.deleteMany({ where: { rokok_id: { in: rokokIds } } })
    await prisma.titipJualItem.deleteMany({ where: { rokok_id: { in: rokokIds } } })
    await prisma.rokok.deleteMany({ where: { id: { in: rokokIds } } })
  }

  const salesList = await prisma.sales.findMany({ where: { nama: { startsWith: "__TEST_SALES__" } } })
  const salesIds = salesList.map(s => s.id)
  if (salesIds.length > 0) {
    const sesis = await prisma.sesiHarian.findMany({ where: { sales_id: { in: salesIds } } })
    const sesiIds = sesis.map(s => s.id)
    if (sesiIds.length > 0) {
      await prisma.sesiSample.deleteMany({ where: { sesi_id: { in: sesiIds } } })
      await prisma.sesiPenjualan.deleteMany({ where: { sesi_id: { in: sesiIds } } })
      await prisma.sesiSetoran.deleteMany({ where: { sesi_id: { in: sesiIds } } })
      await prisma.sesiBarangKeluar.deleteMany({ where: { sesi_id: { in: sesiIds } } })
      await prisma.sesiBarangKembali.deleteMany({ where: { sesi_id: { in: sesiIds } } })
      await prisma.titipJual.deleteMany({ where: { sesi_id: { in: sesiIds } } })
      await prisma.sesiHarian.deleteMany({ where: { id: { in: sesiIds } } })
    }
    await prisma.sales.deleteMany({ where: { id: { in: salesIds } } })
  }
  testRokok = null
  testSales = null
}

afterEach(async () => {
  await cleanup()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe("Multi-Pool Stock Mutation", () => {
  it("should update regular stock (jual) by default", async () => {
    const r = await createTestRokok()
    await mutateStock({
      rokok_id: r.id,
      tanggal: new Date(TEST_DATE),
      jenis: "in",
      qty: 100,
      source: "manual",
    })

    const updated = await prisma.rokok.findUnique({ where: { id: r.id } })
    expect(updated.stok).toBe(100)
    expect(updated.stok_sample_cukai).toBe(0)
    expect(updated.stok_sample_biasa).toBe(0)

    const mut = await prisma.stockMutation.findFirst({ where: { rokok_id: r.id } })
    expect(mut.stock_type).toBe("jual")
  })

  it("should update sample_cukai stock", async () => {
    const r = await createTestRokok()
    await mutateStock({
      rokok_id: r.id,
      tanggal: new Date(TEST_DATE),
      jenis: "in",
      qty: 50,
      source: "manual",
      stock_type: "sample_cukai",
    })

    const updated = await prisma.rokok.findUnique({ where: { id: r.id } })
    expect(updated.stok).toBe(0)
    expect(updated.stok_sample_cukai).toBe(50)
    expect(updated.stok_sample_biasa).toBe(0)

    const mut = await prisma.stockMutation.findFirst({ where: { rokok_id: r.id } })
    expect(mut.stock_type).toBe("sample_cukai")
  })

  it("should update sample_biasa stock", async () => {
    const r = await createTestRokok()
    await mutateStock({
      rokok_id: r.id,
      tanggal: new Date(TEST_DATE),
      jenis: "in",
      qty: 25,
      source: "manual",
      stock_type: "sample_biasa",
    })

    const updated = await prisma.rokok.findUnique({ where: { id: r.id } })
    expect(updated.stok_sample_biasa).toBe(25)

    const mut = await prisma.stockMutation.findFirst({ where: { rokok_id: r.id } })
    expect(mut.stock_type).toBe("sample_biasa")
  })
})

describe("Rokok Actions Multi-Pool", () => {
  it("tambahStokSampleBiasa should work and record mutation", async () => {
    const r = await createTestRokok()
    await tambahStokSampleBiasa(r.id, 30, TEST_DATE, "Test sample biasa")

    const updated = await prisma.rokok.findUnique({ where: { id: r.id } })
    expect(updated.stok_sample_biasa).toBe(30)

    const mut = await prisma.stockMutation.findFirst({ where: { rokok_id: r.id, stock_type: "sample_biasa" } })
    expect(mut).toBeDefined()
    expect(mut.qty).toBe(30)
    expect(mut.jenis).toBe("in")
  })

  it("konversiKeSampleCukai should work and record two mutations (Jual OUT, Cukai IN)", async () => {
    const r = await createTestRokok()
    // Seed regular stock first
    await mutateStock({ rokok_id: r.id, tanggal: new Date(TEST_DATE), jenis: "in", qty: 100 })
    
    await konversiKeSampleCukai(r.id, 20, TEST_DATE, "Test konversi")

    const updated = await prisma.rokok.findUnique({ where: { id: r.id } })
    expect(updated.stok).toBe(80)
    expect(updated.stok_sample_cukai).toBe(20)

    const muts = await prisma.stockMutation.findMany({ where: { rokok_id: r.id }, orderBy: { createdAt: "asc" } })
    // 1: initial seed (jual in 100)
    // 2: konversi out (jual out 20)
    // 3: konversi in (sample_cukai in 20)
    expect(muts).toHaveLength(3)
    
    const mutOut = muts.find(m => m.jenis === "out" && m.stock_type === "jual")
    const mutIn = muts.find(m => m.jenis === "in" && m.stock_type === "sample_cukai")
    
    expect(mutOut).toBeDefined()
    expect(mutIn).toBeDefined()
    expect(mutOut.qty).toBe(20)
    expect(mutIn.qty).toBe(20)
  })
})

describe("Sample Distribution Mutations", () => {
  it("saveSesiSampleKeluar should record OUT mutation", async () => {
    const r = await createTestRokok()
    const s = await createTestSales()
    // Seed sample cukai stock
    await mutateStock({ rokok_id: r.id, tanggal: new Date(TEST_DATE), jenis: "in", qty: 50, stock_type: "sample_cukai" })

    const sesi = await prisma.sesiHarian.create({ data: { tanggal: new Date(TEST_DATE), sales_id: s.id, status: "aktif" } })
    
    await saveSesiSampleKeluar(sesi.id, [{ rokok_id: r.id, type: "cukai", qty_keluar: 10 }])

    const updated = await prisma.rokok.findUnique({ where: { id: r.id } })
    expect(updated.stok_sample_cukai).toBe(40)

    const mut = await prisma.stockMutation.findFirst({ 
      where: { rokok_id: r.id, stock_type: "sample_cukai", jenis: "out" } 
    })
    expect(mut).toBeDefined()
    expect(mut.qty).toBe(10)
    
    // Cleanup sesi
    await prisma.sesiSample.deleteMany({ where: { sesi_id: sesi.id } })
    await prisma.sesiHarian.delete({ where: { id: sesi.id } })
  })

  it("saveSesiSampleKembali should record IN mutation for returned items", async () => {
    const r = await createTestRokok()
    const s = await createTestSales()
    // Seed and distribute
    await mutateStock({ rokok_id: r.id, tanggal: new Date(TEST_DATE), jenis: "in", qty: 50, stock_type: "sample_biasa" })
    const sesi = await prisma.sesiHarian.create({ data: { tanggal: new Date(TEST_DATE), sales_id: s.id, status: "aktif" } })
    await saveSesiSampleKeluar(sesi.id, [{ rokok_id: r.id, type: "biasa", qty_keluar: 10 }])

    // Return 6 items
    await saveSesiSampleKembali(sesi.id, [{ rokok_id: r.id, type: "biasa", qty_kembali: 6 }])

    const updated = await prisma.rokok.findUnique({ where: { id: r.id } })
    expect(updated.stok_sample_biasa).toBe(46) // 50 - 10 + 6

    const mut = await prisma.stockMutation.findFirst({ 
      where: { rokok_id: r.id, stock_type: "sample_biasa", jenis: "in", source: "retur_sales" } 
    })
    expect(mut).toBeDefined()
    expect(mut.qty).toBe(6)

    // Cleanup
    await prisma.sesiSample.deleteMany({ where: { sesi_id: sesi.id } })
    await prisma.sesiHarian.delete({ where: { id: sesi.id } })
  })
})

describe("getMutasiStok with Filtering", () => {
  it("should filter by stock type correctly", async () => {
    const r = await createTestRokok()
    
    // 1. Jual mutation
    await mutateStock({ rokok_id: r.id, tanggal: new Date(TEST_DATE), jenis: "in", qty: 100, stock_type: "jual" })
    // 2. Sample Cukai mutation
    await mutateStock({ rokok_id: r.id, tanggal: new Date(TEST_DATE), jenis: "in", qty: 50, stock_type: "sample_cukai" })
    // 3. Sample Biasa mutation
    await mutateStock({ rokok_id: r.id, tanggal: new Date(TEST_DATE), jenis: "in", qty: 25, stock_type: "sample_biasa" })

    // Test "utama" (jual + sample_cukai)
    const reportUtama = await getMutasiStok(TEST_DATE, TEST_DATE, "utama")
    const entryUtama = reportUtama[0].data.find(d => d.rokok_id === r.id)
    expect(entryUtama.masuk).toBe(150) // 100 + 50

    // Test "jual"
    const reportJual = await getMutasiStok(TEST_DATE, TEST_DATE, "jual")
    const entryJual = reportJual[0].data.find(d => d.rokok_id === r.id)
    expect(entryJual.masuk).toBe(100)

    // Test "sample_biasa"
    const reportBiasa = await getMutasiStok(TEST_DATE, TEST_DATE, "sample_biasa")
    const entryBiasa = reportBiasa[0].data.find(d => d.rokok_id === r.id)
    expect(entryBiasa.masuk).toBe(25)
  })
})
describe("Negative Stock Adjustment", () => {
  it("tambahStok with negative qty should record OUT mutation", async () => {
    const r = await createTestRokok()
    
    // 1. Initial positive addition
    await tambahStok(r.id, 100, TEST_DATE, "Initial Stock")
    
    // 2. Negative addition (reduction)
    await tambahStok(r.id, -30, TEST_DATE, "Return to Supplier")

    const updated = await prisma.rokok.findUnique({ where: { id: r.id } })
    expect(updated.stok).toBe(70)

    const mutOut = await prisma.stockMutation.findFirst({ 
      where: { rokok_id: r.id, jenis: "out", keterangan: { contains: "Return" } } 
    })
    expect(mutOut).toBeDefined()
    expect(mutOut.qty).toBe(30)
    expect(mutOut.source).toBe("supplier")
  })

  it("tambahStokSampleBiasa with negative qty should record OUT mutation", async () => {
    const r = await createTestRokok()
    
    // 1. Initial addition
    await tambahStokSampleBiasa(r.id, 50, TEST_DATE, "Initial Sample")
    
    // 2. Negative addition
    await tambahStokSampleBiasa(r.id, -10, TEST_DATE, "Sample Correction")

    const updated = await prisma.rokok.findUnique({ where: { id: r.id } })
    expect(updated.stok_sample_biasa).toBe(40)

    const mutOut = await prisma.stockMutation.findFirst({ 
      where: { rokok_id: r.id, stock_type: "sample_biasa", jenis: "out" } 
    })
    expect(mutOut).toBeDefined()
    expect(mutOut.qty).toBe(10)
  })

  it("tambahStokSampleCukai should work and record mutation", async () => {
    const r = await createTestRokok()
    // Seed stock
    await mutateStock({ rokok_id: r.id, tanggal: new Date(TEST_DATE), jenis: "in", qty: 100 })
    await mutateStock({ rokok_id: r.id, tanggal: new Date(TEST_DATE), jenis: "in", qty: 10, stock_type: "sample_cukai" })

    // Pindahkan ke Sample (To Sample)
    await pindahStokSampleCukai(r.id, 5, "to_sample", "Pindah Direct", TEST_DATE)
    const updated1 = await prisma.rokok.findUnique({ where: { id: r.id } })
    expect(updated1.stok_sample_cukai).toBe(15)

    // Kembalikan ke Stok Jual (To Jual)
    await pindahStokSampleCukai(r.id, 3, "to_jual", "Balikin Direct", TEST_DATE)
    const updated2 = await prisma.rokok.findUnique({ where: { id: r.id } })
    expect(updated2.stok_sample_cukai).toBe(12)
    expect(updated2.stok).toBe(98) 

    const report = await getMutasiStok(TEST_DATE, TEST_DATE, "utama")
    const entry = report[0].data.find(d => d.rokok_id === r.id)
    expect(entry).toBeDefined()
    expect(entry.akhir).toBe(110) // 98 + 12
  })
})
