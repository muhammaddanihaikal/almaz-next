import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { prisma } from "@/lib/db"
import { seedTestData, cleanupSesiWithAllStock, cleanupTestSales } from "../helpers/db"

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

// Import SETELAH mock
const { createSesi, getSesiListByDateRange } = await import("@/actions/distribusi")

// ─── Fixtures ────────────────────────────────────────────────────────────────
let testSales
let testRokok
const createdSesiIds = []

// Tanggal di masa jauh — tidak konflik dengan data nyata
const DATE_LAMA    = "2050-01-15"  // "lama" (historical)
const DATE_BARU    = "2050-02-20"  // lebih baru
const DATE_TENGAH  = "2050-01-20"

beforeAll(async () => {
  const seed = await seedTestData()
  testSales = seed.sales
  testRokok = seed.rokok

  // Buat 3 sesi di tanggal berbeda
  for (const tgl of [DATE_LAMA, DATE_TENGAH, DATE_BARU]) {
    const result = await createSesi({
      tanggal:      tgl,
      sales_id:     testSales.id,
      catatan:      null,
      barangKeluar: [{ rokok_id: testRokok.id, qty: 1 }],
    })
    if (result.success) createdSesiIds.push(result.data.id)
  }
})

afterAll(async () => {
  for (const id of createdSesiIds) {
    await cleanupSesiWithAllStock(id)
  }
  await cleanupTestSales(testSales?.id)
  await prisma.$disconnect()
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("getSesiListByDateRange", () => {
  it("mengembalikan sesi dalam range tanggal yang diberikan", async () => {
    const result = await getSesiListByDateRange(DATE_LAMA, DATE_TENGAH)
    const tanggalList = result.map((s) => s.tanggal)

    expect(tanggalList).toContain(DATE_LAMA)
    expect(tanggalList).toContain(DATE_TENGAH)
    expect(tanggalList).not.toContain(DATE_BARU)
  })

  it("range satu hari — hanya mengembalikan sesi di tanggal itu", async () => {
    const result = await getSesiListByDateRange(DATE_LAMA, DATE_LAMA)
    const milik = result.filter((s) => s.sales_id === testSales.id)

    expect(milik).toHaveLength(1)
    expect(milik[0].tanggal).toBe(DATE_LAMA)
  })

  it("range mencakup semua tanggal test — semua 3 sesi dikembalikan", async () => {
    const result = await getSesiListByDateRange(DATE_LAMA, DATE_BARU)
    const idDapat = result.map((s) => s.id)

    for (const id of createdSesiIds) {
      expect(idDapat).toContain(id)
    }
  })

  it("range di luar semua data — return array kosong (untuk test sales ini)", async () => {
    const result = await getSesiListByDateRange("2040-01-01", "2040-01-31")
    const milik = result.filter((s) => s.sales_id === testSales.id)
    expect(milik).toHaveLength(0)
  })

  it("tanpa parameter — tidak melempar error, return array", async () => {
    const result = await getSesiListByDateRange()
    expect(Array.isArray(result)).toBe(true)
  })

  it("setiap sesi punya field standar yang diperlukan UI", async () => {
    const result = await getSesiListByDateRange(DATE_LAMA, DATE_BARU)
    const sesi = result.find((s) => s.id === createdSesiIds[0])

    expect(sesi).toBeDefined()
    expect(sesi).toHaveProperty("id")
    expect(sesi).toHaveProperty("tanggal")
    expect(sesi).toHaveProperty("sales_id")
    expect(sesi).toHaveProperty("status")
    expect(sesi).toHaveProperty("barangKeluar")
    expect(sesi).toHaveProperty("setoran")
  })
})
