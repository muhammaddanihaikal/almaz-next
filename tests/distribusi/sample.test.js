import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest"
import { prisma } from "@/lib/db"
import {
  seedTestData,
  cleanupTestSales,
  cleanupTestToko,
  cleanupSesiWithAllStock,
} from "../helpers/db"

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

const { konversiKeSampleCukai, tambahStokSampleBiasa } = await import("@/actions/rokok")
const { createSesi, submitLaporanSore } = await import("@/actions/distribusi")
const { getSesiSample } = await import("@/actions/sample")

const TEST_DATE = "2099-12-28"

let testSales
let testToko
let testRokok
let createdSesiId = null

beforeAll(async () => {
  const { sales, toko, rokok } = await seedTestData()
  testSales = sales
  testToko  = toko
  testRokok = rokok
})

afterEach(async () => {
  if (createdSesiId) {
    await cleanupSesiWithAllStock(createdSesiId)
    createdSesiId = null
  }
  // Revert sample stok konversi & biasa yang dibuat selama test
  await prisma.sampleCukaiKonversi.deleteMany({ where: { rokok_id: testRokok?.id, tanggal: new Date(TEST_DATE + "T00:00:00.000Z") } })
  await prisma.stokMasuk.deleteMany({ where: { rokok_id: testRokok?.id, jenis: "sample_biasa" } })
})

afterAll(async () => {
  await cleanupTestSales(testSales?.id)
  await cleanupTestToko(testToko?.id)
  await prisma.$disconnect()
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function freshRokok() {
  return prisma.rokok.findUnique({ where: { id: testRokok.id } })
}

async function buatSesiDenganSample({ qtyCukai = 0, qtyBiasa = 0 } = {}) {
  const samples = []
  if (qtyCukai > 0) samples.push({ rokok_id: testRokok.id, type: "cukai", qty_keluar: qtyCukai })
  if (qtyBiasa > 0) samples.push({ rokok_id: testRokok.id, type: "biasa", qty_keluar: qtyBiasa })

  const result = await createSesi({
    tanggal:      TEST_DATE,
    sales_id:     testSales.id,
    catatan:      null,
    barangKeluar: [{ rokok_id: testRokok.id, qty: 5 }],
    samples,
  })
  if (!result.success) throw new Error(`Gagal buat sesi: ${result.error}`)
  createdSesiId = result.data.id
  return result.data
}

function makeLaporanData(overrides = {}) {
  return {
    tanggal:               TEST_DATE,
    sales_id:              testSales.id,
    penjualan:             [],
    setoran:               [],
    barangKembali:         [{ rokok_id: testRokok.id, qty: 5 }],
    konsinyasiBaru:        [],
    tukarBaru:             [],
    returFromTukar:        null,
    penyelesaianTukar:     [],
    penyelesaianKonsinyasi:[],
    sampleKembali:         [],
    ...overrides,
  }
}

// ─── Tests: konversiKeSampleCukai ─────────────────────────────────────────────

describe("konversiKeSampleCukai", () => {
  it("mengurangi stok reguler dan menambah stok_sample_cukai", async () => {
    const before = await freshRokok()
    const qtyKonversi = 2

    await expect(konversiKeSampleCukai(testRokok.id, qtyKonversi, "test konversi")).resolves.not.toThrow()

    const after = await freshRokok()
    expect(after.stok).toBe(before.stok - qtyKonversi)
    expect(after.stok_sample_cukai).toBe(before.stok_sample_cukai + qtyKonversi)

    // Revert untuk cleanup
    await prisma.$transaction(async (tx) => {
      await tx.stockMutation.deleteMany({
        where: { rokok_id: testRokok.id, source: "sample_cukai_konversi" },
      })
      await tx.rokok.update({
        where: { id: testRokok.id },
        data: { stok: { increment: qtyKonversi }, stok_sample_cukai: { decrement: qtyKonversi } },
      })
    })
    await prisma.sampleCukaiKonversi.deleteMany({ where: { rokok_id: testRokok.id } })
  })

  it("mencatat StockMutation out untuk stok reguler", async () => {
    const qtyKonversi = 1
    const beforeMut = await prisma.stockMutation.count({ where: { rokok_id: testRokok.id, source: "sample_cukai_konversi" } })

    await konversiKeSampleCukai(testRokok.id, qtyKonversi, "test mutation")
    const afterMut = await prisma.stockMutation.count({ where: { rokok_id: testRokok.id, source: "sample_cukai_konversi" } })
    expect(afterMut).toBe(beforeMut + 1)

    // Revert
    await prisma.$transaction(async (tx) => {
      await tx.stockMutation.deleteMany({ where: { rokok_id: testRokok.id, source: "sample_cukai_konversi" } })
      await tx.rokok.update({ where: { id: testRokok.id }, data: { stok: { increment: qtyKonversi }, stok_sample_cukai: { decrement: qtyKonversi } } })
    })
    await prisma.sampleCukaiKonversi.deleteMany({ where: { rokok_id: testRokok.id } })
  })

  it("gagal jika stok tidak cukup", async () => {
    const before = await freshRokok()
    await expect(konversiKeSampleCukai(testRokok.id, before.stok + 1000, "test gagal")).rejects.toThrow(/stok/i)
  })
})

// ─── Tests: tambahStokSampleBiasa ─────────────────────────────────────────────

describe("tambahStokSampleBiasa", () => {
  it("menambah stok_sample_biasa dan membuat StokMasuk", async () => {
    const before = await freshRokok()
    const qty = 3

    await expect(tambahStokSampleBiasa(testRokok.id, qty, TEST_DATE, "test biasa")).resolves.not.toThrow()

    const after = await freshRokok()
    expect(after.stok_sample_biasa).toBe(before.stok_sample_biasa + qty)
    expect(after.stok).toBe(before.stok) // stok reguler tidak berubah

    const stokMasuk = await prisma.stokMasuk.findFirst({
      where: { rokok_id: testRokok.id, jenis: "sample_biasa" },
      orderBy: { createdAt: "desc" },
    })
    expect(stokMasuk).not.toBeNull()
    expect(stokMasuk.qty).toBe(qty)

    // Revert
    await prisma.$transaction(async (tx) => {
      await tx.stokMasuk.deleteMany({ where: { id: stokMasuk.id } })
      await tx.rokok.update({ where: { id: testRokok.id }, data: { stok_sample_biasa: { decrement: qty } } })
    })
  })

  it("tidak membuat StockMutation (tidak lewat ledger reguler)", async () => {
    const before = await prisma.stockMutation.count({ where: { rokok_id: testRokok.id } })
    await tambahStokSampleBiasa(testRokok.id, 2, TEST_DATE, "test no ledger")
    const after = await prisma.stockMutation.count({ where: { rokok_id: testRokok.id } })
    expect(after).toBe(before) // tidak ada mutasi ledger baru

    // Revert
    await prisma.$transaction(async (tx) => {
      await tx.stokMasuk.deleteMany({ where: { rokok_id: testRokok.id, jenis: "sample_biasa" } })
      await tx.rokok.update({ where: { id: testRokok.id }, data: { stok_sample_biasa: { decrement: 2 } } })
    })
  })
})

// ─── Tests: Sample Keluar (via createSesi) ────────────────────────────────────

describe("sample keluar saat sesi pagi dibuat", () => {
  it("mengurangi stok_sample_cukai saat sesi dibuat", async () => {
    const qtyKonversi = 3
    // Setup: konversi dulu agar ada stok sample cukai
    await prisma.rokok.update({ where: { id: testRokok.id }, data: { stok_sample_cukai: { increment: qtyKonversi } } })
    const before = await freshRokok()

    const sesi = await buatSesiDenganSample({ qtyCukai: qtyKonversi })

    const after = await freshRokok()
    expect(after.stok_sample_cukai).toBe(before.stok_sample_cukai - qtyKonversi)

    // Cleanup sample cukai setup
    await prisma.rokok.update({ where: { id: testRokok.id }, data: { stok_sample_cukai: { increment: qtyKonversi } } })
  })

  it("mengurangi stok_sample_biasa saat sesi dibuat", async () => {
    const qtyBiasa = 2
    await prisma.rokok.update({ where: { id: testRokok.id }, data: { stok_sample_biasa: { increment: qtyBiasa } } })
    const before = await freshRokok()

    await buatSesiDenganSample({ qtyBiasa })

    const after = await freshRokok()
    expect(after.stok_sample_biasa).toBe(before.stok_sample_biasa - qtyBiasa)

    await prisma.rokok.update({ where: { id: testRokok.id }, data: { stok_sample_biasa: { increment: qtyBiasa } } })
  })

  it("tidak mengubah stok reguler akibat sample keluar", async () => {
    const qtySetup = 2
    await prisma.rokok.update({ where: { id: testRokok.id }, data: { stok_sample_cukai: { increment: qtySetup } } })
    const before = await freshRokok()

    await buatSesiDenganSample({ qtyCukai: qtySetup })

    const after = await freshRokok()
    // stok reguler hanya berkurang karena barangKeluar sesi (5), bukan sample
    expect(after.stok).toBe(before.stok - 5)

    await prisma.rokok.update({ where: { id: testRokok.id }, data: { stok_sample_cukai: { increment: qtySetup } } })
  })

  it("menyimpan SesiSample dengan qty_keluar dan qty_kembali=0", async () => {
    const qtyCukai = 1
    const qtyBiasa = 1
    await prisma.rokok.update({ where: { id: testRokok.id }, data: { stok_sample_cukai: { increment: qtyCukai }, stok_sample_biasa: { increment: qtyBiasa } } })

    const sesi = await buatSesiDenganSample({ qtyCukai, qtyBiasa })
    const samples = await getSesiSample(sesi.id)

    expect(samples).toHaveLength(2)
    const cukai = samples.find(s => s.type === "cukai")
    const biasa = samples.find(s => s.type === "biasa")
    expect(cukai).toBeDefined()
    expect(cukai.qty_keluar).toBe(qtyCukai)
    expect(cukai.qty_kembali).toBe(0)
    expect(biasa).toBeDefined()
    expect(biasa.qty_keluar).toBe(qtyBiasa)
    expect(biasa.qty_kembali).toBe(0)

    await prisma.rokok.update({ where: { id: testRokok.id }, data: { stok_sample_cukai: { increment: qtyCukai }, stok_sample_biasa: { increment: qtyBiasa } } })
  })
})

// ─── Tests: Sample Kembali (via submitLaporanSore) ────────────────────────────

describe("sample kembali saat laporan sore disubmit", () => {
  it("menambah kembali stok_sample_cukai sesuai qty kembali", async () => {
    const qtySetup = 3
    await prisma.rokok.update({ where: { id: testRokok.id }, data: { stok_sample_cukai: { increment: qtySetup } } })
    const sesi = await buatSesiDenganSample({ qtyCukai: qtySetup })
    const afterKeluar = await freshRokok()

    const qtyKembali = 2
    await submitLaporanSore(sesi.id, makeLaporanData({
      sampleKembali: [{ rokok_id: testRokok.id, type: "cukai", qty_kembali: qtyKembali }],
    }))

    const afterKembali = await freshRokok()
    expect(afterKembali.stok_sample_cukai).toBe(afterKeluar.stok_sample_cukai + qtyKembali)

    await prisma.rokok.update({ where: { id: testRokok.id }, data: { stok_sample_cukai: { increment: qtySetup - qtyKembali } } })
  })

  it("menambah kembali stok_sample_biasa sesuai qty kembali", async () => {
    const qtySetup = 2
    await prisma.rokok.update({ where: { id: testRokok.id }, data: { stok_sample_biasa: { increment: qtySetup } } })
    const sesi = await buatSesiDenganSample({ qtyBiasa: qtySetup })
    const afterKeluar = await freshRokok()

    const qtyKembali = 1
    await submitLaporanSore(sesi.id, makeLaporanData({
      sampleKembali: [{ rokok_id: testRokok.id, type: "biasa", qty_kembali: qtyKembali }],
    }))

    const afterKembali = await freshRokok()
    expect(afterKembali.stok_sample_biasa).toBe(afterKeluar.stok_sample_biasa + qtyKembali)

    await prisma.rokok.update({ where: { id: testRokok.id }, data: { stok_sample_biasa: { increment: qtySetup - qtyKembali } } })
  })

  it("memperbarui SesiSample.qty_kembali di DB", async () => {
    const qtySetup = 3
    await prisma.rokok.update({ where: { id: testRokok.id }, data: { stok_sample_cukai: { increment: qtySetup } } })
    const sesi = await buatSesiDenganSample({ qtyCukai: qtySetup })

    const qtyKembali = 2
    await submitLaporanSore(sesi.id, makeLaporanData({
      sampleKembali: [{ rokok_id: testRokok.id, type: "cukai", qty_kembali: qtyKembali }],
    }))

    const samples = await getSesiSample(sesi.id)
    const cukai = samples.find(s => s.type === "cukai")
    expect(cukai.qty_kembali).toBe(qtyKembali)

    await prisma.rokok.update({ where: { id: testRokok.id }, data: { stok_sample_cukai: { increment: qtySetup - qtyKembali } } })
  })

  it("tidak mengubah stok reguler saat sample kembali", async () => {
    const qtySetup = 2
    await prisma.rokok.update({ where: { id: testRokok.id }, data: { stok_sample_biasa: { increment: qtySetup } } })
    const sesi = await buatSesiDenganSample({ qtyBiasa: qtySetup })

    const beforeSubmit = await freshRokok()
    await submitLaporanSore(sesi.id, makeLaporanData({
      barangKembali: [{ rokok_id: testRokok.id, qty: 5 }],
      sampleKembali: [{ rokok_id: testRokok.id, type: "biasa", qty_kembali: qtySetup }],
    }))

    const afterSubmit = await freshRokok()
    // stok reguler hanya bertambah dari barangKembali (5), bukan dari sample kembali
    expect(afterSubmit.stok).toBe(beforeSubmit.stok + 5)

    // sample biasa kembali penuh
    expect(afterSubmit.stok_sample_biasa).toBe(beforeSubmit.stok_sample_biasa + qtySetup)

    await prisma.rokok.update({ where: { id: testRokok.id }, data: { stok_sample_biasa: { decrement: qtySetup } } })
  })

  it("tidak mengubah nilai penjualan atau setoran (keuangan tidak terpengaruh)", async () => {
    const qtySetup = 2
    await prisma.rokok.update({ where: { id: testRokok.id }, data: { stok_sample_cukai: { increment: qtySetup } } })
    const sesi = await buatSesiDenganSample({ qtyCukai: qtySetup })

    const result = await submitLaporanSore(sesi.id, makeLaporanData({
      sampleKembali: [{ rokok_id: testRokok.id, type: "cukai", qty_kembali: qtySetup }],
    }))
    expect(result.success).toBe(true)

    const sesiDB = await prisma.sesiHarian.findUnique({
      where: { id: sesi.id },
      include: { penjualan: true, setoran: true },
    })
    expect(sesiDB.penjualan).toHaveLength(0)
    expect(sesiDB.setoran).toHaveLength(0)
    expect(sesiDB.status).toBe("selesai")

    await prisma.rokok.update({ where: { id: testRokok.id }, data: { stok_sample_cukai: { decrement: qtySetup } } })
  })

  it("sampleKembali kosong tidak menyebabkan error", async () => {
    const sesi = await buatSesiDenganSample()
    const result = await submitLaporanSore(sesi.id, makeLaporanData({ sampleKembali: [] }))
    expect(result.success).toBe(true)
  })
})

// ─── Tests: revert saat sesi dihapus ─────────────────────────────────────────

describe("revert sample keluar saat sesi dihapus", () => {
  it("mengembalikan stok_sample_cukai net saat sesi dihapus", async () => {
    const qtyKeluar = 3
    await prisma.rokok.update({ where: { id: testRokok.id }, data: { stok_sample_cukai: { increment: qtyKeluar } } })
    const before = await freshRokok()

    const sesi = await buatSesiDenganSample({ qtyCukai: qtyKeluar })
    const afterKeluar = await freshRokok()
    expect(afterKeluar.stok_sample_cukai).toBe(before.stok_sample_cukai - qtyKeluar)

    // Hapus sesi (cleanup juga revert sample via revertSesiSampleKeluar)
    const { deleteSesi } = await import("@/actions/distribusi")
    await deleteSesi(sesi.id, "test cleanup")
    createdSesiId = null // sudah dihapus

    const afterDelete = await freshRokok()
    // Net keluar = 3, kembali = 0, jadi revert +3
    expect(afterDelete.stok_sample_cukai).toBe(before.stok_sample_cukai)

    await prisma.rokok.update({ where: { id: testRokok.id }, data: { stok_sample_cukai: { decrement: qtyKeluar } } })
  })
})
