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

const { addSales, updateSales, deleteSales, toggleAktifSales } = await import("@/actions/sales")

const TEST_NAMA = "__TEST_SALES_MASTER__"
let testSalesId = null

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function createTestSales(overrides = {}) {
  const s = await prisma.sales.create({
    data: { nama: TEST_NAMA, no_hp: null, kategori: "grosir", ...overrides },
  })
  testSalesId = s.id
  return s
}

async function cleanupTestSales() {
  if (!testSalesId) return
  await prisma.absensi.deleteMany({ where: { sales_id: testSalesId } })
  await prisma.sales.deleteMany({ where: { id: testSalesId } })
  testSalesId = null
}

afterEach(async () => {
  await cleanupTestSales()
})

afterAll(async () => {
  const sisa = await prisma.sales.findMany({ where: { nama: TEST_NAMA } })
  for (const s of sisa) {
    await prisma.absensi.deleteMany({ where: { sales_id: s.id } })
    await prisma.sales.delete({ where: { id: s.id } })
  }
  await prisma.$disconnect()
})

// ─── TESTS ────────────────────────────────────────────────────────────────────

describe("addSales", () => {
  it("berhasil tambah sales baru", async () => {
    await addSales({ nama: TEST_NAMA, no_hp: "08123456789", kategori: "grosir" })

    const s = await prisma.sales.findFirst({ where: { nama: TEST_NAMA } })
    testSalesId = s.id

    expect(s).not.toBeNull()
    expect(s.nama).toBe(TEST_NAMA)
    expect(s.no_hp).toBe("08123456789")
    expect(s.kategori).toBe("grosir")
    expect(s.aktif).toBe(true)
  })

  it("kategori default 'grosir' jika tidak diisi", async () => {
    await addSales({ nama: TEST_NAMA })

    const s = await prisma.sales.findFirst({ where: { nama: TEST_NAMA } })
    testSalesId = s.id

    expect(s.kategori).toBe("grosir")
  })

  it("no_hp kosong — tersimpan sebagai null", async () => {
    await addSales({ nama: TEST_NAMA, no_hp: "" })

    const s = await prisma.sales.findFirst({ where: { nama: TEST_NAMA } })
    testSalesId = s.id

    expect(s.no_hp).toBeNull()
  })

  it("gagal tambah sales dengan nama duplikat", async () => {
    await createTestSales()
    await expect(addSales({ nama: TEST_NAMA })).rejects.toThrow()
  })
})

describe("updateSales", () => {
  it("berhasil update no_hp dan kategori", async () => {
    const s = await createTestSales()

    await updateSales(s.id, { nama: TEST_NAMA, no_hp: "0811111111", kategori: "toko" })

    const updated = await prisma.sales.findUnique({ where: { id: s.id } })
    expect(updated.no_hp).toBe("0811111111")
    expect(updated.kategori).toBe("toko")
  })

  it("no_hp kosong diubah menjadi null saat update", async () => {
    const s = await createTestSales({ no_hp: "08123456789" })

    await updateSales(s.id, { nama: TEST_NAMA, no_hp: "" })

    const updated = await prisma.sales.findUnique({ where: { id: s.id } })
    expect(updated.no_hp).toBeNull()
  })
})

describe("toggleAktifSales", () => {
  it("aktif → nonaktif", async () => {
    const s = await createTestSales()
    expect(s.aktif).toBe(true)

    await toggleAktifSales(s.id)

    const updated = await prisma.sales.findUnique({ where: { id: s.id } })
    expect(updated.aktif).toBe(false)
  })

  it("nonaktif → aktif kembali", async () => {
    const s = await createTestSales()

    await toggleAktifSales(s.id) // → nonaktif
    await toggleAktifSales(s.id) // → aktif

    const updated = await prisma.sales.findUnique({ where: { id: s.id } })
    expect(updated.aktif).toBe(true)
  })
})

describe("deleteSales", () => {
  it("berhasil hapus sales tanpa relasi", async () => {
    const s = await createTestSales()

    await deleteSales(s.id)

    const deleted = await prisma.sales.findUnique({ where: { id: s.id } })
    expect(deleted).toBeNull()
    testSalesId = null
  })

  it("gagal hapus sales yang punya relasi absensi (FK constraint)", async () => {
    const s = await createTestSales()
    await prisma.absensi.create({
      data: { tanggal: new Date("2099-11-01"), sales_id: s.id, status: "hadir" },
    })

    await expect(deleteSales(s.id)).rejects.toThrow()
    // afterEach bersihkan absensi dulu sebelum hapus sales
  })
})
