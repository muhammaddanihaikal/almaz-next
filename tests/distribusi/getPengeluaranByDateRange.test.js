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

const { getPengeluaranByDateRange, addPengeluaran } = await import("@/actions/pengeluaran")

// ─── Fixtures ─────────────────────────────────────────────────────────────────
let testSales
const createdPengeluaranIds = []

const DATE_A = "2053-08-05"
const DATE_B = "2053-08-20"
const DATE_C = "2053-09-15"

beforeAll(async () => {
  const seed = await seedTestData()
  testSales = seed.sales

  // Buat 3 pengeluaran di tanggal berbeda (sumber "lainnya" agar tidak butuh posisi uang)
  for (const [tanggal, jumlah, ket] of [
    [DATE_A, 50000,  "Test pengeluaran A"],
    [DATE_B, 75000,  "Test pengeluaran B"],
    [DATE_C, 100000, "Test pengeluaran C"],
  ]) {
    await addPengeluaran({ tanggal, jumlah, keterangan: ket, sumber: "lainnya" })
  }

  // Ambil ID yang baru dibuat untuk cleanup
  const rows = await prisma.pengeluaran.findMany({
    where: {
      keterangan: { in: ["Test pengeluaran A", "Test pengeluaran B", "Test pengeluaran C"] }
    }
  })
  createdPengeluaranIds.push(...rows.map((r) => r.id))
})

afterAll(async () => {
  await prisma.pengeluaran.deleteMany({
    where: { id: { in: createdPengeluaranIds } }
  })
  await cleanupTestSales(testSales?.id)
  await prisma.$disconnect()
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("getPengeluaranByDateRange", () => {
  it("mengembalikan pengeluaran dalam range tanggal", async () => {
    const result = await getPengeluaranByDateRange(DATE_A, DATE_B)
    const milik = result.filter((r) => createdPengeluaranIds.includes(r.id))
    const tanggals = milik.map((r) => r.tanggal)

    expect(tanggals).toContain(DATE_A)
    expect(tanggals).toContain(DATE_B)
    expect(tanggals).not.toContain(DATE_C)
  })

  it("range satu hari — hanya tanggal itu yang dikembalikan", async () => {
    const result = await getPengeluaranByDateRange(DATE_A, DATE_A)
    const milik = result.filter((r) => createdPengeluaranIds.includes(r.id))

    expect(milik).toHaveLength(1)
    expect(milik[0].tanggal).toBe(DATE_A)
    expect(milik[0].jumlah).toBe(50000)
  })

  it("range mencakup semua tanggal — semua 3 pengeluaran dikembalikan", async () => {
    const result = await getPengeluaranByDateRange(DATE_A, DATE_C)
    const milik = result.filter((r) => createdPengeluaranIds.includes(r.id))

    expect(milik).toHaveLength(3)
  })

  it("range di luar semua data test — return kosong untuk data ini", async () => {
    const result = await getPengeluaranByDateRange("2040-01-01", "2040-01-31")
    const milik = result.filter((r) => createdPengeluaranIds.includes(r.id))
    expect(milik).toHaveLength(0)
  })

  it("tanpa parameter — tidak melempar error, return array", async () => {
    const result = await getPengeluaranByDateRange()
    expect(Array.isArray(result)).toBe(true)
  })

  it("setiap record punya field standar: id, tanggal, jumlah, keterangan, sumber", async () => {
    const result = await getPengeluaranByDateRange(DATE_A, DATE_C)
    const sample = result.find((r) => createdPengeluaranIds.includes(r.id))

    expect(sample).toBeDefined()
    expect(sample).toHaveProperty("id")
    expect(sample).toHaveProperty("tanggal")
    expect(sample).toHaveProperty("jumlah")
    expect(sample).toHaveProperty("keterangan")
    expect(sample).toHaveProperty("sumber")
    expect(sample).toHaveProperty("createdAt")
  })

  it("nilai jumlah dikembalikan sebagai angka", async () => {
    const result = await getPengeluaranByDateRange(DATE_A, DATE_A)
    const milik = result.filter((r) => createdPengeluaranIds.includes(r.id))
    expect(typeof milik[0].jumlah).toBe("number")
  })
})
