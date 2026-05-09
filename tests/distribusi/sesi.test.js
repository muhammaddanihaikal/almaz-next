import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest"
import { prisma } from "@/lib/db"
import {
  seedTestData,
  cleanupTestSales,
  cleanupSesiWithAllStock,
} from "../helpers/db"

// ─── Mock next/cache ──────────────────────────────────────────────────────────
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag:  vi.fn(),
  unstable_cache: (_fn) => _fn,
}))

// ─── Mock auth — user_id null agar tidak perlu User di DB ────────────────────
vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({
    user: { id: null, name: "Test User", role: "admin" },
  }),
}))

// ─── Import actions SETELAH mock didefinisikan ─────────────────────────────────
const { createSesi, updateSesiPagi, deleteSesi } = await import("@/actions/distribusi")

// ─── Data test ────────────────────────────────────────────────────────────────
let testSales
let testRokok
let createdSesiId = null  // hanya satu sesi aktif per test (karena unique tanggal+sales)

// Tanggal unik per test run agar tidak konflik unique constraint tanggal+sales_id
// Pakai tanggal jauh di masa depan yang tidak mungkin bentrok dengan data nyata
const TEST_DATE = "2099-12-31"

beforeAll(async () => {
  const { sales, rokok } = await seedTestData()
  testSales = sales
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
  await prisma.$disconnect()
})

// ─── Helper ───────────────────────────────────────────────────────────────────
function makeSesiData(overrides = {}) {
  return {
    tanggal:      TEST_DATE,
    sales_id:     testSales.id,
    catatan:      null,
    barangKeluar: [{ rokok_id: testRokok.id, qty: 2 }],
    ...overrides,
  }
}

// ─── TESTS ────────────────────────────────────────────────────────────────────

describe("createSesi (buat sesi)", () => {
  it("berhasil membuat sesi baru dengan barangKeluar", async () => {
    const result = await createSesi(makeSesiData())

    expect(result.success).toBe(true)
    expect(result.data).toBeDefined()
    expect(result.data.sales_id).toBe(testSales.id)
    expect(result.data.status).toBe("aktif")
    expect(result.data.barangKeluar).toHaveLength(1)
    expect(result.data.barangKeluar[0].rokok_id).toBe(testRokok.id)
    expect(result.data.barangKeluar[0].qty).toBe(2)

    createdSesiId = result.data.id
  })

  it("stok rokok berkurang setelah sesi dibuat", async () => {
    const stokSebelum = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok

    const result = await createSesi(makeSesiData({ barangKeluar: [{ rokok_id: testRokok.id, qty: 3 }] }))

    expect(result.success).toBe(true)
    createdSesiId = result.data.id

    const stokSesudah = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok
    expect(stokSesudah).toBe(stokSebelum - 3)
  })

  it("sesi tanpa barangKeluar tetap berhasil dibuat", async () => {
    const result = await createSesi(makeSesiData({ barangKeluar: [] }))

    expect(result.success).toBe(true)
    expect(result.data.barangKeluar).toHaveLength(0)

    createdSesiId = result.data.id
  })

  it("gagal jika stok tidak mencukupi", async () => {
    const stokSaatIni = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok
    const result = await createSesi(
      makeSesiData({ barangKeluar: [{ rokok_id: testRokok.id, qty: stokSaatIni + 9999 }] })
    )

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/stok/i)
    // Tidak ada sesi yang terbuat, tidak perlu cleanup
  })
})

describe("updateSesiPagi (edit laporan pagi)", () => {
  it("berhasil mengubah jumlah barangKeluar dan stok ter-update dengan benar", async () => {
    const created = await createSesi(makeSesiData({ barangKeluar: [{ rokok_id: testRokok.id, qty: 2 }] }))
    expect(created.success).toBe(true)
    createdSesiId = created.data.id

    const stokSetelahBuat = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok

    // Edit: ubah qty dari 2 → 5
    const result = await updateSesiPagi(
      createdSesiId,
      makeSesiData({ barangKeluar: [{ rokok_id: testRokok.id, qty: 5 }] }),
      "test: edit qty"
    )

    expect(result.success).toBe(true)
    expect(result.data.barangKeluar[0].qty).toBe(5)

    // Stok harus berkurang 3 lagi (net: 5-2=3 tambahan keluar)
    const stokSesudahEdit = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok
    expect(stokSesudahEdit).toBe(stokSetelahBuat - 3)
  })

  it("berhasil mengosongkan barangKeluar dan stok kembali ke kondisi sebelum sesi", async () => {
    const stokAwal = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok

    const created = await createSesi(makeSesiData({ barangKeluar: [{ rokok_id: testRokok.id, qty: 2 }] }))
    expect(created.success).toBe(true)
    createdSesiId = created.data.id

    const result = await updateSesiPagi(
      createdSesiId,
      makeSesiData({ barangKeluar: [] }),
      "test: kosongkan barang keluar"
    )

    expect(result.success).toBe(true)
    expect(result.data.barangKeluar).toHaveLength(0)

    const stokAkhir = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok
    expect(stokAkhir).toBe(stokAwal)
  })

  it("gagal jika sesi tidak ditemukan", async () => {
    const result = await updateSesiPagi("id-tidak-ada-sama-sekali", makeSesiData(), "test")
    expect(result.success).toBe(false)
  })
})

describe("deleteSesi (hapus sesi)", () => {
  it("berhasil menghapus sesi dan stok kembali ke kondisi sebelum sesi", async () => {
    const stokAwal = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok

    const created = await createSesi(makeSesiData({ barangKeluar: [{ rokok_id: testRokok.id, qty: 4 }] }))
    expect(created.success).toBe(true)
    createdSesiId = created.data.id

    const stokSetelahBuat = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok
    expect(stokSetelahBuat).toBe(stokAwal - 4)

    const result = await deleteSesi(createdSesiId, "test: hapus sesi")

    expect(result.success).toBe(true)
    createdSesiId = null  // sudah terhapus oleh action, skip cleanup di afterEach

    const stokSetelahHapus = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok
    expect(stokSetelahHapus).toBe(stokAwal)

    const sesiDiDb = await prisma.sesiHarian.findUnique({ where: { id: created.data.id } })
    expect(sesiDiDb).toBeNull()
  })

  it("berhasil menghapus sesi tanpa barangKeluar", async () => {
    const created = await createSesi(makeSesiData({ barangKeluar: [] }))
    expect(created.success).toBe(true)
    createdSesiId = created.data.id

    const result = await deleteSesi(createdSesiId, "test: hapus sesi kosong")

    expect(result.success).toBe(true)
    createdSesiId = null

    const sesiDiDb = await prisma.sesiHarian.findUnique({ where: { id: created.data.id } })
    expect(sesiDiDb).toBeNull()
  })

  it("tetap return success jika sesi tidak ditemukan (idempotent)", async () => {
    const result = await deleteSesi("id-tidak-ada", "test")
    expect(result.success).toBe(true)
  })
})
