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

const { addToko, updateToko, deleteToko, toggleAktifToko, getUsedTokoIds } = await import("@/actions/toko")

const TEST_NAMA = "__TEST_TOKO_MASTER__"
let testTokoId = null

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function createTestToko(overrides = {}) {
  const t = await prisma.toko.create({
    data: { nama: TEST_NAMA, alamat: null, kategori: "toko", ...overrides },
  })
  testTokoId = t.id
  return t
}

async function cleanupTestToko() {
  if (!testTokoId) return
  await prisma.toko.deleteMany({ where: { id: testTokoId } })
  testTokoId = null
}

afterEach(async () => {
  await cleanupTestToko()
})

afterAll(async () => {
  const sisa = await prisma.toko.findMany({ where: { nama: TEST_NAMA } })
  for (const t of sisa) {
    await prisma.toko.delete({ where: { id: t.id } })
  }
  await prisma.$disconnect()
})

// ─── TESTS ────────────────────────────────────────────────────────────────────

describe("addToko", () => {
  it("berhasil tambah toko baru", async () => {
    await addToko({ nama: TEST_NAMA, alamat: "Jl. Test No. 1", kategori: "toko" })

    const t = await prisma.toko.findFirst({ where: { nama: TEST_NAMA } })
    testTokoId = t.id

    expect(t).not.toBeNull()
    expect(t.nama).toBe(TEST_NAMA)
    expect(t.alamat).toBe("Jl. Test No. 1")
    expect(t.aktif).toBe(true)
  })

  it("nama di-trim — spasi di awal/akhir dihapus", async () => {
    await addToko({ nama: `  ${TEST_NAMA}  `, kategori: "toko" })

    const t = await prisma.toko.findFirst({ where: { nama: TEST_NAMA } })
    testTokoId = t?.id

    expect(t?.nama).toBe(TEST_NAMA)
  })

  it("alamat kosong — tersimpan sebagai null", async () => {
    await addToko({ nama: TEST_NAMA, alamat: "", kategori: "toko" })

    const t = await prisma.toko.findFirst({ where: { nama: TEST_NAMA } })
    testTokoId = t.id

    expect(t.alamat).toBeNull()
  })

  it("gagal tambah toko dengan nama duplikat", async () => {
    await createTestToko()
    await expect(addToko({ nama: TEST_NAMA, kategori: "toko" })).rejects.toThrow()
  })
})

describe("updateToko", () => {
  it("berhasil update alamat", async () => {
    const t = await createTestToko()

    await updateToko(t.id, { nama: TEST_NAMA, alamat: "Jl. Update No. 2", kategori: "toko" })

    const updated = await prisma.toko.findUnique({ where: { id: t.id } })
    expect(updated.alamat).toBe("Jl. Update No. 2")
  })

  it("alamat di-trim saat update", async () => {
    const t = await createTestToko()

    await updateToko(t.id, { nama: TEST_NAMA, alamat: "  Jl. Trim  ", kategori: "toko" })

    const updated = await prisma.toko.findUnique({ where: { id: t.id } })
    expect(updated.alamat).toBe("Jl. Trim")
  })

  it("berhasil ubah kategori ke 'grosir'", async () => {
    const t = await createTestToko()

    await updateToko(t.id, { nama: TEST_NAMA, kategori: "grosir" })

    const updated = await prisma.toko.findUnique({ where: { id: t.id } })
    expect(updated.kategori).toBe("grosir")
  })
})

describe("toggleAktifToko", () => {
  it("aktif → nonaktif", async () => {
    const t = await createTestToko()
    expect(t.aktif).toBe(true)

    await toggleAktifToko(t.id)

    const updated = await prisma.toko.findUnique({ where: { id: t.id } })
    expect(updated.aktif).toBe(false)
  })

  it("nonaktif → aktif kembali", async () => {
    const t = await createTestToko()

    await toggleAktifToko(t.id) // → nonaktif
    await toggleAktifToko(t.id) // → aktif

    const updated = await prisma.toko.findUnique({ where: { id: t.id } })
    expect(updated.aktif).toBe(true)
  })
})

describe("deleteToko", () => {
  it("berhasil hapus toko tanpa relasi", async () => {
    const t = await createTestToko()

    await deleteToko(t.id)

    const deleted = await prisma.toko.findUnique({ where: { id: t.id } })
    expect(deleted).toBeNull()
    testTokoId = null
  })
})

describe("getUsedTokoIds", () => {
  it("return array (tidak error)", async () => {
    const result = await getUsedTokoIds()
    expect(Array.isArray(result)).toBe(true)
  })

  it("toko baru tanpa histori titip jual tidak masuk daftar", async () => {
    const t = await createTestToko()
    const usedIds = await getUsedTokoIds()
    expect(usedIds).not.toContain(t.id)
  })
})
