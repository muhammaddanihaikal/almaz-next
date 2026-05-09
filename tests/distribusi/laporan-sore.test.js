import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest"
import { prisma } from "@/lib/db"
import {
  seedTestData,
  cleanupTestSales,
  cleanupTestToko,
  cleanupSesiWithAllStock,
} from "../helpers/db"

// ─── Mock next/cache ──────────────────────────────────────────────────────────
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

const { createSesi, submitLaporanSore } = await import("@/actions/distribusi")

let testSales
let testToko
let testRokok
let createdSesiId = null

// Tanggal jauh di masa depan — tidak bentrok data nyata & unique constraint
const TEST_DATE = "2099-12-30"
const TEST_DATE_JT = "2099-12-31" // tanggal jatuh tempo titip jual

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
})

afterAll(async () => {
  await cleanupTestSales(testSales?.id)
  await cleanupTestToko(testToko?.id)
  await prisma.$disconnect()
})

// ─── Helper: buat sesi aktif sebagai prasyarat laporan sore ──────────────────
async function buatSesiAktif(qtyKeluar = 5) {
  const result = await createSesi({
    tanggal:      TEST_DATE,
    sales_id:     testSales.id,
    catatan:      null,
    barangKeluar: [{ rokok_id: testRokok.id, qty: qtyKeluar }],
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
    barangKembali:         [],
    konsinyasiBaru:        [],
    tukarBaru:             [],
    returFromTukar:        null,
    penyelesaianTukar:     [],
    penyelesaianKonsinyasi:[],
    ...overrides,
  }
}

// ─── TESTS ────────────────────────────────────────────────────────────────────

describe("submitLaporanSore — penjualan langsung", () => {
  it("berhasil submit dengan penjualan langsung dan setoran", async () => {
    const sesi = await buatSesiAktif(5)

    const result = await submitLaporanSore(sesi.id, makeLaporanData({
      penjualan: [{ rokok_id: testRokok.id, kategori: "grosir", qty: 3 }],
      setoran:   [{ metode: "cash", jumlah: 15000 }],
    }))

    expect(result.success).toBe(true)
    expect(result.data.status).toBe("selesai")
    expect(result.data.penjualan).toHaveLength(1)
    expect(result.data.penjualan[0].qty).toBe(3)
    expect(result.data.setoran).toHaveLength(1)
    expect(result.data.setoran[0].jumlah).toBe(15000)
  })

  it("berhasil submit penjualan dengan kategori berbeda (grosir & toko)", async () => {
    const sesi = await buatSesiAktif(10)

    const result = await submitLaporanSore(sesi.id, makeLaporanData({
      penjualan: [
        { rokok_id: testRokok.id, kategori: "grosir",    qty: 3 },
        { rokok_id: testRokok.id, kategori: "perorangan", qty: 2 },
      ],
      setoran: [{ metode: "transfer", jumlah: 30000 }],
    }))

    expect(result.success).toBe(true)
    expect(result.data.penjualan).toHaveLength(2)
    expect(result.data.nilaiPenjualan).toBeGreaterThan(0)
  })

  it("berhasil submit dengan barang kembali — stok bertambah", async () => {
    const stokSebelum = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok
    const sesi = await buatSesiAktif(5)
    const stokSetelahKeluar = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok

    const result = await submitLaporanSore(sesi.id, makeLaporanData({
      penjualan:     [{ rokok_id: testRokok.id, kategori: "grosir", qty: 3 }],
      barangKembali: [{ rokok_id: testRokok.id, qty: 2 }],
    }))

    expect(result.success).toBe(true)
    expect(result.data.barangKembali).toHaveLength(1)

    const stokSesudah = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok
    // Keluar 5, kembali 2 → net -3 dari stok awal
    expect(stokSesudah).toBe(stokSebelum - 3)
  })

  it("berhasil submit laporan kosong (tidak ada penjualan)", async () => {
    const sesi = await buatSesiAktif(0)

    const result = await submitLaporanSore(sesi.id, makeLaporanData())

    expect(result.success).toBe(true)
    expect(result.data.status).toBe("selesai")
    expect(result.data.penjualan).toHaveLength(0)
    expect(result.data.nilaiPenjualan).toBe(0)
  })
})

describe("submitLaporanSore — titip jual (konsinyasi)", () => {
  it("berhasil submit dengan konsinyasi baru ke toko", async () => {
    const sesi = await buatSesiAktif(10)

    const result = await submitLaporanSore(sesi.id, makeLaporanData({
      konsinyasiBaru: [{
        toko_id:             testToko.id,
        kategori:            "toko",
        tanggal_jatuh_tempo: TEST_DATE_JT,
        catatan:             null,
        items: [{ rokok_id: testRokok.id, qty: 5 }],
      }],
    }))

    expect(result.success).toBe(true)
    expect(result.data.konsinyasi).toHaveLength(1)
    expect(result.data.konsinyasi[0].toko_id).toBe(testToko.id)
    expect(result.data.konsinyasi[0].status).toBe("aktif")
    expect(result.data.konsinyasi[0].items[0].qty_keluar).toBe(5)
  })

  it("titip jual tidak mempengaruhi stok (sudah dihitung di barangKeluar)", async () => {
    const stokSetelahKeluar = async () =>
      (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok

    const sesi = await buatSesiAktif(10)
    const stokSaatAktif = await stokSetelahKeluar()

    await submitLaporanSore(sesi.id, makeLaporanData({
      konsinyasiBaru: [{
        toko_id:             testToko.id,
        kategori:            "toko",
        tanggal_jatuh_tempo: TEST_DATE_JT,
        catatan:             null,
        items: [{ rokok_id: testRokok.id, qty: 5 }],
      }],
    }))

    // Stok tidak berubah setelah add konsinyasi (physical movement model)
    const stokSesudah = await stokSetelahKeluar()
    expect(stokSesudah).toBe(stokSaatAktif)
  })

  it("berhasil submit dengan beberapa konsinyasi ke toko yang sama", async () => {
    const sesi = await buatSesiAktif(10)

    const result = await submitLaporanSore(sesi.id, makeLaporanData({
      konsinyasiBaru: [
        {
          toko_id:             testToko.id,
          kategori:            "toko",
          tanggal_jatuh_tempo: TEST_DATE_JT,
          catatan:             "batch 1",
          items: [{ rokok_id: testRokok.id, qty: 3 }],
        },
        {
          toko_id:             testToko.id,
          kategori:            "grosir",
          tanggal_jatuh_tempo: TEST_DATE_JT,
          catatan:             "batch 2",
          items: [{ rokok_id: testRokok.id, qty: 2 }],
        },
      ],
    }))

    expect(result.success).toBe(true)
    expect(result.data.konsinyasi).toHaveLength(2)
  })
})

describe("submitLaporanSore — tukar barang", () => {
  it("berhasil submit tukar barang aktif — stok masuk bertambah", async () => {
    const stokSebelum = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok
    const sesi = await buatSesiAktif(5)

    const result = await submitLaporanSore(sesi.id, makeLaporanData({
      tukarBaru: [{
        kategori:   "grosir",
        catatan:    "test tukar aktif",
        itemsMasuk: [{ rokok_id: testRokok.id, qty: 2, harga_satuan: 5000 }],
        itemsKeluar: [],
        langsungSelesai: false,
      }],
    }))

    expect(result.success).toBe(true)
    expect(result.data.tukarBarang).toHaveLength(1)
    expect(result.data.tukarBarang[0].status).toBe("aktif")

    // itemsMasuk (B dari toko) → stok gudang bertambah
    const stokSesudah = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok
    expect(stokSesudah).toBe(stokSebelum - 5 + 2) // keluar 5 sesi, masuk 2 dari tukar
  })

  it("berhasil submit tukar barang langsung selesai — stok masuk bertambah", async () => {
    const stokSebelum = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok
    const sesi = await buatSesiAktif(5)

    const result = await submitLaporanSore(sesi.id, makeLaporanData({
      tukarBaru: [{
        kategori:   "grosir",
        catatan:    "test tukar selesai",
        itemsMasuk:  [{ rokok_id: testRokok.id, qty: 2, harga_satuan: 5000 }],
        itemsKeluar: [{ rokok_id: testRokok.id, qty: 2, harga_satuan: 5000 }],
        langsungSelesai: true,
      }],
    }))

    expect(result.success).toBe(true)
    expect(result.data.tukarBarangSelesaiDiSesi).toHaveLength(1)
    expect(result.data.tukarBarangSelesaiDiSesi[0].status).toBe("selesai")

    const stokSesudah = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok
    expect(stokSesudah).toBe(stokSebelum - 5 + 2)
  })

  it("gagal submit tukar barang aktif tanpa itemsMasuk", async () => {
    const sesi = await buatSesiAktif(5)

    const result = await submitLaporanSore(sesi.id, makeLaporanData({
      tukarBaru: [{
        kategori:    "grosir",
        itemsMasuk:  [],
        itemsKeluar: [],
        langsungSelesai: false,
      }],
    }))

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/minimal 1 rokok/i)
  })
})

describe("submitLaporanSore — retur", () => {
  it("berhasil submit retur — stok bertambah", async () => {
    const stokSebelum = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok
    const sesi = await buatSesiAktif(5)

    const result = await submitLaporanSore(sesi.id, makeLaporanData({
      returFromTukar: {
        tipe_penjualan: null,
        alasan:  "barang rusak saat distribusi",
        items:   [{ rokok_id: testRokok.id, qty: 1 }],
      },
    }))

    expect(result.success).toBe(true)
    expect(result.data.returDiSesi).toHaveLength(1)
    expect(result.data.returDiSesi[0].alasan).toBe("barang rusak saat distribusi")
    expect(result.data.returDiSesi[0].items[0].qty).toBe(1)

    // Retur → stok gudang bertambah
    const stokSesudah = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok
    expect(stokSesudah).toBe(stokSebelum - 5 + 1)
  })

  it("retur dengan qty 0 diabaikan — stok tidak berubah", async () => {
    const sesi = await buatSesiAktif(5)
    const stokSaatAktif = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok

    const result = await submitLaporanSore(sesi.id, makeLaporanData({
      returFromTukar: {
        alasan: "test qty 0",
        items:  [{ rokok_id: testRokok.id, qty: 0 }],
      },
    }))

    expect(result.success).toBe(true)
    // Item qty 0 difilter — tidak ada retur yang masuk
    expect(result.data.returDiSesi).toHaveLength(0)

    const stokSesudah = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok
    expect(stokSesudah).toBe(stokSaatAktif)
  })

  it("berhasil submit kombinasi retur + penjualan + barang kembali", async () => {
    const stokSebelum = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok
    const sesi = await buatSesiAktif(8)

    const result = await submitLaporanSore(sesi.id, makeLaporanData({
      penjualan:     [{ rokok_id: testRokok.id, kategori: "grosir", qty: 3 }],
      barangKembali: [{ rokok_id: testRokok.id, qty: 2 }],
      returFromTukar: {
        alasan: "retur dari toko",
        items:  [{ rokok_id: testRokok.id, qty: 1 }],
      },
    }))

    expect(result.success).toBe(true)
    expect(result.data.status).toBe("selesai")
    expect(result.data.penjualan).toHaveLength(1)
    expect(result.data.barangKembali).toHaveLength(1)
    expect(result.data.returDiSesi).toHaveLength(1)

    // Keluar 8 (sesi), kembali 2 + retur 1 = +3 → net -5
    const stokSesudah = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok
    expect(stokSesudah).toBe(stokSebelum - 5)
  })
})
