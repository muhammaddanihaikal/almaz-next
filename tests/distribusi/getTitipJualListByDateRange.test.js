import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { prisma } from "@/lib/db"
import {
  seedTestData,
  cleanupTestSales,
  cleanupTestToko,
  revertStockMutationsByRef,
} from "../helpers/db"

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

const { createSesi } = await import("@/actions/distribusi")
const { getTitipJualListByDateRange, createTitipJual } = await import("@/actions/titip_jual")

// ─── Fixtures ─────────────────────────────────────────────────────────────────
let testSales
let testRokok
let testToko

// Sesi + TJ yang dibuat — untuk cleanup
const createdSesiIds = []
const createdTjIds   = []

const DATE_LAMA   = "2051-03-10"
const DATE_BARU   = "2051-04-20"
const DATE_TENGAH = "2051-03-25"

const JATUH_TEMPO = "2099-12-31"

async function buatSesiDenganTJ(tanggal) {
  const sesiResult = await createSesi({
    tanggal,
    sales_id:     testSales.id,
    catatan:      null,
    barangKeluar: [{ rokok_id: testRokok.id, qty: 1 }],
  })
  if (!sesiResult.success) throw new Error("Gagal buat sesi: " + sesiResult.error)
  createdSesiIds.push(sesiResult.data.id)

  const tj = await createTitipJual(sesiResult.data.id, testSales.id, {
    toko_id:             testToko.id,
    kategori:            "toko",
    tanggal_jatuh_tempo: JATUH_TEMPO,
    items: [{ rokok_id: testRokok.id, qty: 1 }],
  })
  createdTjIds.push(tj.id)
  return { sesi: sesiResult.data, tj }
}

beforeAll(async () => {
  const seed = await seedTestData()
  testSales = seed.sales
  testRokok = seed.rokok
  testToko  = seed.toko

  // Buat TJ di 3 tanggal berbeda
  await buatSesiDenganTJ(DATE_LAMA)
  await buatSesiDenganTJ(DATE_TENGAH)
  await buatSesiDenganTJ(DATE_BARU)
})

afterAll(async () => {
  // Hapus TJ + stock mutations
  for (const tjId of createdTjIds) {
    await revertStockMutationsByRef(tjId)
    await prisma.titipJualItem.deleteMany({ where: { titip_jual_id: tjId } })
    await prisma.titipJual.deleteMany({ where: { id: tjId } })
  }
  // Hapus sesi (stock revert sudah di atas)
  for (const sesiId of createdSesiIds) {
    await revertStockMutationsByRef(sesiId)
    await prisma.sesiBarangKeluar.deleteMany({ where: { sesi_id: sesiId } })
    await prisma.sesiHarian.deleteMany({ where: { id: sesiId } })
  }
  await cleanupTestToko(testToko?.id)
  await cleanupTestSales(testSales?.id)
  await prisma.$disconnect()
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("getTitipJualListByDateRange", () => {
  it("mengembalikan TJ aktif tanpa batasan tanggal distribusi", async () => {
    // TJ aktif harus selalu muncul (apapun range-nya)
    const result = await getTitipJualListByDateRange(DATE_LAMA, DATE_LAMA)
    const aktif = result.filter((t) => t.status === "aktif" && t.sales_id === testSales.id)

    // Semua 3 TJ test masih aktif — semuanya harus dikembalikan
    expect(aktif.length).toBeGreaterThanOrEqual(3)
  })

  it("setiap TJ punya field standar yang diperlukan UI", async () => {
    const result = await getTitipJualListByDateRange(DATE_LAMA, DATE_BARU)
    const tj = result.find((t) => t.id === createdTjIds[0])

    expect(tj).toBeDefined()
    expect(tj).toHaveProperty("id")
    expect(tj).toHaveProperty("sales_id")
    expect(tj).toHaveProperty("status")
    expect(tj).toHaveProperty("tanggal_jatuh_tempo")
    expect(tj).toHaveProperty("items")
    expect(tj).toHaveProperty("setoran")
    expect(tj).toHaveProperty("nilaiTotal")
  })

  it("TJ aktif muncul meskipun tanggal sangat jauh ke depan", async () => {
    const result = await getTitipJualListByDateRange("2090-01-01", "2090-12-31")
    const milik = result.filter(
      (t) => t.status === "aktif" && createdTjIds.includes(t.id)
    )
    // TJ aktif harus tetap ada
    expect(milik.length).toBeGreaterThanOrEqual(3)
  })

  it("tanpa parameter — tidak melempar error", async () => {
    const result = await getTitipJualListByDateRange()
    expect(Array.isArray(result)).toBe(true)
  })

  it("semua TJ test ada dalam hasil saat range mencakup semua tanggal", async () => {
    const result = await getTitipJualListByDateRange(DATE_LAMA, DATE_BARU)
    const ids = result.map((t) => t.id)

    for (const id of createdTjIds) {
      expect(ids).toContain(id)
    }
  })
})
