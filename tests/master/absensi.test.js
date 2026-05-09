import { describe, it, expect, afterEach, afterAll, vi } from "vitest"
import { prisma } from "@/lib/db"

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

const { saveAbsensi, getAbsensi, deleteAbsensi } = await import("@/actions/absensi")

const TEST_SALES_NAMA = "__TEST_SALES_ABSENSI__"
const TEST_DATE       = "2099-11-30"
const OLD_DATE        = "2020-01-15"

let testSalesId = null

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function createTestSales() {
  const s = await prisma.sales.upsert({
    where:  { nama: TEST_SALES_NAMA },
    update: {},
    create: { nama: TEST_SALES_NAMA, kategori: "grosir" },
  })
  testSalesId = s.id
  return s
}

async function cleanupAbsensi() {
  if (!testSalesId) return
  await prisma.absensi.deleteMany({ where: { sales_id: testSalesId } })
}

afterEach(async () => {
  await cleanupAbsensi()
})

afterAll(async () => {
  if (testSalesId) {
    await prisma.absensi.deleteMany({ where: { sales_id: testSalesId } })
    await prisma.sales.deleteMany({ where: { id: testSalesId } })
  }
  await prisma.$disconnect()
})

// ─── TESTS ────────────────────────────────────────────────────────────────────

describe("saveAbsensi", () => {
  it("berhasil simpan absensi — data tersimpan dengan status benar", async () => {
    const s = await createTestSales()

    await saveAbsensi(TEST_DATE, [{ sales_id: s.id, status: "hadir" }])

    const rows = await prisma.absensi.findMany({
      where: { tanggal: new Date(TEST_DATE), sales_id: s.id },
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe("hadir")
    expect(rows[0].sales_id).toBe(s.id)
  })

  it("save dua kali pada tanggal sama — replace, bukan duplikat", async () => {
    const s = await createTestSales()

    await saveAbsensi(TEST_DATE, [{ sales_id: s.id, status: "hadir" }])
    await saveAbsensi(TEST_DATE, [{ sales_id: s.id, status: "izin" }])

    const rows = await prisma.absensi.findMany({
      where: { tanggal: new Date(TEST_DATE), sales_id: s.id },
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe("izin")
  })

  it("reason kosong — tersimpan sebagai null", async () => {
    const s = await createTestSales()

    await saveAbsensi(TEST_DATE, [{ sales_id: s.id, status: "sakit", reason: "" }])

    const row = await prisma.absensi.findFirst({
      where: { tanggal: new Date(TEST_DATE), sales_id: s.id },
    })
    expect(row.reason).toBeNull()
  })

  it("reason terisi — tersimpan dengan benar", async () => {
    const s = await createTestSales()

    await saveAbsensi(TEST_DATE, [{ sales_id: s.id, status: "izin", reason: "keperluan keluarga" }])

    const row = await prisma.absensi.findFirst({
      where: { tanggal: new Date(TEST_DATE), sales_id: s.id },
    })
    expect(row.reason).toBe("keperluan keluarga")
  })

  it("save dengan array kosong — hapus semua absensi tanggal itu", async () => {
    const s = await createTestSales()
    await saveAbsensi(TEST_DATE, [{ sales_id: s.id, status: "hadir" }])

    await saveAbsensi(TEST_DATE, [])

    const rows = await prisma.absensi.findMany({
      where: { tanggal: new Date(TEST_DATE), sales_id: s.id },
    })
    expect(rows).toHaveLength(0)
  })
})

describe("getAbsensi", () => {
  it("format tanggal benar (YYYY-MM-DD)", async () => {
    const s = await createTestSales()
    await prisma.absensi.create({
      data: { tanggal: new Date(TEST_DATE), sales_id: s.id, status: "hadir" },
    })

    const rows = await getAbsensi(null) // null = ambil semua tanpa batas
    const row = rows.find((r) => r.sales_id === s.id && r.tanggal === TEST_DATE)

    expect(row).toBeDefined()
    expect(row.tanggal).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(row.tanggal).toBe(TEST_DATE)
  })

  it("reason null di-return sebagai string kosong", async () => {
    const s = await createTestSales()
    await prisma.absensi.create({
      data: { tanggal: new Date(TEST_DATE), sales_id: s.id, status: "alpha", reason: null },
    })

    const rows = await getAbsensi(null)
    const row = rows.find((r) => r.sales_id === s.id)

    expect(row.reason).toBe("")
  })

  it("filter daysBack — data lama tidak muncul", async () => {
    const s = await createTestSales()
    // Insert absensi di tanggal lama (jauh melewati daysBack=30)
    await prisma.absensi.create({
      data: { tanggal: new Date(OLD_DATE), sales_id: s.id, status: "hadir" },
    })

    const rows = await getAbsensi(30)
    const row = rows.find((r) => r.sales_id === s.id && r.tanggal === OLD_DATE)

    expect(row).toBeUndefined()
  })

  it("getAbsensi(null) — ambil semua tanpa filter tanggal", async () => {
    const s = await createTestSales()
    await prisma.absensi.create({
      data: { tanggal: new Date(OLD_DATE), sales_id: s.id, status: "hadir" },
    })

    const rows = await getAbsensi(null)
    const row = rows.find((r) => r.sales_id === s.id && r.tanggal === OLD_DATE)

    expect(row).toBeDefined()
  })
})

describe("deleteAbsensi", () => {
  it("berhasil hapus semua absensi untuk tanggal tertentu", async () => {
    const s = await createTestSales()
    await prisma.absensi.create({
      data: { tanggal: new Date(TEST_DATE), sales_id: s.id, status: "hadir" },
    })

    await deleteAbsensi(TEST_DATE)

    const rows = await prisma.absensi.findMany({
      where: { tanggal: new Date(TEST_DATE), sales_id: s.id },
    })
    expect(rows).toHaveLength(0)
  })

  it("hapus tanggal yang tidak ada data — tidak error", async () => {
    await createTestSales()
    await expect(deleteAbsensi("2099-01-01")).resolves.not.toThrow()
  })
})
