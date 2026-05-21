import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { prisma } from "@/lib/db"
import { seedTestData, cleanupTestSales } from "../helpers/db"

// ─── Mock ─────────────────────────────────────────────────────────────────────
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

const { getAbsensiByDateRange } = await import("@/actions/absensi")
const { saveAbsensi } = await import("@/actions/absensi")

// ─── Fixtures ─────────────────────────────────────────────────────────────────
let testSales

const DATE_A = "2052-06-01"
const DATE_B = "2052-06-15"
const DATE_C = "2052-07-10"

beforeAll(async () => {
  const seed = await seedTestData()
  testSales = seed.sales

  // Buat absensi di 3 tanggal berbeda
  for (const [tanggal, status] of [[DATE_A, "hadir"], [DATE_B, "izin"], [DATE_C, "alpha"]]) {
    await saveAbsensi(tanggal, [{ sales_id: testSales.id, status }])
  }
})

afterAll(async () => {
  // Hapus absensi test
  for (const tgl of [DATE_A, DATE_B, DATE_C]) {
    await prisma.absensi.deleteMany({
      where: { tanggal: new Date(tgl), sales_id: testSales.id }
    })
  }
  await cleanupTestSales(testSales?.id)
  await prisma.$disconnect()
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("getAbsensiByDateRange", () => {
  it("mengembalikan absensi dalam range tanggal", async () => {
    const result = await getAbsensiByDateRange(DATE_A, DATE_B)
    const milik = result.filter((a) => a.sales_id === testSales.id)
    const tanggals = milik.map((a) => a.tanggal)

    expect(tanggals).toContain(DATE_A)
    expect(tanggals).toContain(DATE_B)
    expect(tanggals).not.toContain(DATE_C)
  })

  it("range satu hari — hanya tanggal itu yang dikembalikan", async () => {
    const result = await getAbsensiByDateRange(DATE_B, DATE_B)
    const milik = result.filter((a) => a.sales_id === testSales.id)

    expect(milik).toHaveLength(1)
    expect(milik[0].tanggal).toBe(DATE_B)
    expect(milik[0].status).toBe("izin")
  })

  it("range mencakup semua tanggal — semua 3 absensi dikembalikan", async () => {
    const result = await getAbsensiByDateRange(DATE_A, DATE_C)
    const milik = result.filter((a) => a.sales_id === testSales.id)
    const tanggals = milik.map((a) => a.tanggal)

    expect(tanggals).toContain(DATE_A)
    expect(tanggals).toContain(DATE_B)
    expect(tanggals).toContain(DATE_C)
  })

  it("range di luar semua data test — return kosong untuk sales ini", async () => {
    const result = await getAbsensiByDateRange("2040-01-01", "2040-01-31")
    const milik = result.filter((a) => a.sales_id === testSales.id)
    expect(milik).toHaveLength(0)
  })

  it("tanpa parameter — tidak melempar error, return array", async () => {
    const result = await getAbsensiByDateRange()
    expect(Array.isArray(result)).toBe(true)
  })

  it("setiap record punya field standar: id, tanggal, sales_id, status", async () => {
    const result = await getAbsensiByDateRange(DATE_A, DATE_C)
    const sample = result.find((a) => a.sales_id === testSales.id)

    expect(sample).toBeDefined()
    expect(sample).toHaveProperty("id")
    expect(sample).toHaveProperty("tanggal")
    expect(sample).toHaveProperty("sales_id")
    expect(sample).toHaveProperty("status")
  })
})
