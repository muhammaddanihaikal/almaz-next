import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from "vitest"
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

const {
  addRokok,
  updateRokok,
  deleteRokok,
  toggleAktifRokok,
  tambahStok,
  koreksiStok,
} = await import("@/actions/rokok")

const TEST_NAMA = "__TEST_ROKOK__"
const TODAY     = new Date().toISOString().split("T")[0]

let testRokokId = null

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRokokData(overrides = {}) {
  return {
    nama:             TEST_NAMA,
    stok:             0,
    harga_beli:       10000,
    harga_grosir:     12000,
    harga_toko:       13000,
    harga_perorangan: 14000,
    ...overrides,
  }
}

// Buat rokok test langsung via Prisma (tanpa melewati action) agar state bersih
async function createTestRokok(overrides = {}) {
  const r = await prisma.rokok.create({
    data: {
      nama:             TEST_NAMA,
      stok:             0,
      harga_beli:       10000,
      harga_grosir:     12000,
      harga_toko:       13000,
      harga_perorangan: 14000,
      urutan:           9999,
      ...overrides,
    },
  })
  testRokokId = r.id
  return r
}

async function cleanupTestRokok() {
  if (!testRokokId) return
  await prisma.auditLog.deleteMany({ where: { entity_id: testRokokId } })
  await prisma.stokMasuk.deleteMany({ where: { rokok_id: testRokokId } })
  await prisma.stockMutation.deleteMany({ where: { rokok_id: testRokokId } })
  await prisma.rokok.deleteMany({ where: { id: testRokokId } })
  testRokokId = null
}

afterEach(async () => {
  await cleanupTestRokok()
})

afterAll(async () => {
  // Bersihkan sisa rokok test jika ada yang tertinggal
  const sisa = await prisma.rokok.findMany({ where: { nama: TEST_NAMA } })
  for (const r of sisa) {
    await prisma.auditLog.deleteMany({ where: { entity_id: r.id } })
    await prisma.stokMasuk.deleteMany({ where: { rokok_id: r.id } })
    await prisma.stockMutation.deleteMany({ where: { rokok_id: r.id } })
    await prisma.rokok.delete({ where: { id: r.id } })
  }
  await prisma.$disconnect()
})

// ─── TESTS ────────────────────────────────────────────────────────────────────

describe("addRokok", () => {
  it("berhasil tambah rokok baru tanpa stok awal", async () => {
    await addRokok(makeRokokData({ stok: 0 }))

    const r = await prisma.rokok.findFirst({ where: { nama: TEST_NAMA } })
    testRokokId = r.id

    expect(r).not.toBeNull()
    expect(r.nama).toBe(TEST_NAMA)
    expect(r.stok).toBe(0)
    expect(r.harga_grosir).toBe(12000)
    expect(r.aktif).toBe(true)

    // Stok 0 → tidak ada StockMutation dibuat
    const mutations = await prisma.stockMutation.findMany({ where: { rokok_id: r.id } })
    expect(mutations).toHaveLength(0)
  })

  it("berhasil tambah rokok dengan stok awal — StokMasuk dan StockMutation dibuat", async () => {
    await addRokok(makeRokokData({ stok: 50 }))

    const r = await prisma.rokok.findFirst({ where: { nama: TEST_NAMA } })
    testRokokId = r.id

    expect(r.stok).toBe(50)

    const sm = await prisma.stokMasuk.findFirst({ where: { rokok_id: r.id } })
    expect(sm).not.toBeNull()
    expect(sm.qty).toBe(50)
    expect(sm.keterangan).toBe("Stok Awal")

    const mutation = await prisma.stockMutation.findFirst({ where: { rokok_id: r.id } })
    expect(mutation.jenis).toBe("in")
    expect(mutation.qty).toBe(50)
    expect(mutation.source).toBe("stok_awal")
  })

  it("urutan rokok baru lebih besar dari urutan tertinggi sebelumnya", async () => {
    const maxSebelum = (await prisma.rokok.aggregate({ _max: { urutan: true } }))._max.urutan ?? -1

    await addRokok(makeRokokData())
    const r = await prisma.rokok.findFirst({ where: { nama: TEST_NAMA } })
    testRokokId = r.id

    expect(r.urutan).toBe(maxSebelum + 1)
  })
})

describe("updateRokok", () => {
  it("berhasil update nama dan harga", async () => {
    const r = await createTestRokok()

    await updateRokok(r.id, {
      nama:             "Rokok Test Diupdate",
      harga_beli:       11000,
      harga_grosir:     13000,
      harga_toko:       14000,
      harga_perorangan: 15000,
    }, "test: update nama dan harga")

    const updated = await prisma.rokok.findUnique({ where: { id: r.id } })
    expect(updated.nama).toBe("Rokok Test Diupdate")
    expect(updated.harga_beli).toBe(11000)
    expect(updated.harga_grosir).toBe(13000)

    // Stok tidak disertakan → tidak ada mutasi koreksi
    const mutations = await prisma.stockMutation.findMany({ where: { rokok_id: r.id } })
    expect(mutations).toHaveLength(0)
  })

  it("update stok naik — koreksi mutation 'in' dibuat", async () => {
    const r = await createTestRokok({ stok: 10 })

    await updateRokok(r.id, {
      nama:             TEST_NAMA,
      harga_beli:       10000,
      harga_grosir:     12000,
      harga_toko:       13000,
      harga_perorangan: 14000,
      stok:             15,
    }, "test: naikkan stok")

    const updated = await prisma.rokok.findUnique({ where: { id: r.id } })
    expect(updated.stok).toBe(15)

    const mutation = await prisma.stockMutation.findFirst({ where: { rokok_id: r.id } })
    expect(mutation.jenis).toBe("in")
    expect(mutation.qty).toBe(5)
    expect(mutation.source).toBe("koreksi")
  })

  it("update stok turun — koreksi mutation 'out' dibuat", async () => {
    const r = await createTestRokok({ stok: 20 })

    await updateRokok(r.id, {
      nama:             TEST_NAMA,
      harga_beli:       10000,
      harga_grosir:     12000,
      harga_toko:       13000,
      harga_perorangan: 14000,
      stok:             12,
    }, "test: turunkan stok")

    const updated = await prisma.rokok.findUnique({ where: { id: r.id } })
    expect(updated.stok).toBe(12)

    const mutation = await prisma.stockMutation.findFirst({ where: { rokok_id: r.id } })
    expect(mutation.jenis).toBe("out")
    expect(mutation.qty).toBe(8)
  })

  it("update stok sama — tidak ada mutation koreksi dibuat", async () => {
    const r = await createTestRokok({ stok: 10 })

    await updateRokok(r.id, {
      nama:             TEST_NAMA,
      harga_beli:       10000,
      harga_grosir:     12000,
      harga_toko:       13000,
      harga_perorangan: 14000,
      stok:             10, // sama
    }, "test: stok tidak berubah")

    const mutations = await prisma.stockMutation.findMany({ where: { rokok_id: r.id } })
    expect(mutations).toHaveLength(0)
  })
})

describe("toggleAktifRokok", () => {
  it("aktif → nonaktif", async () => {
    const r = await createTestRokok()
    expect(r.aktif).toBe(true)

    await toggleAktifRokok(r.id)

    const updated = await prisma.rokok.findUnique({ where: { id: r.id } })
    expect(updated.aktif).toBe(false)
  })

  it("nonaktif → aktif kembali", async () => {
    const r = await createTestRokok()

    await toggleAktifRokok(r.id) // → nonaktif
    await toggleAktifRokok(r.id) // → aktif lagi

    const updated = await prisma.rokok.findUnique({ where: { id: r.id } })
    expect(updated.aktif).toBe(true)
  })
})

describe("tambahStok", () => {
  it("stok bertambah dan StokMasuk tercatat", async () => {
    const r = await createTestRokok({ stok: 10 })

    await tambahStok(r.id, 20, TODAY, "stok dari supplier test")

    const updated = await prisma.rokok.findUnique({ where: { id: r.id } })
    expect(updated.stok).toBe(30)

    const sm = await prisma.stokMasuk.findFirst({ where: { rokok_id: r.id } })
    expect(sm.qty).toBe(20)
    expect(sm.keterangan).toBe("stok dari supplier test")

    const mutation = await prisma.stockMutation.findFirst({ where: { rokok_id: r.id } })
    expect(mutation.jenis).toBe("in")
    expect(mutation.qty).toBe(20)
    expect(mutation.source).toBe("supplier")
  })

  it("keterangan kosong pakai default 'Stok Masuk'", async () => {
    const r = await createTestRokok()

    await tambahStok(r.id, 5, TODAY, "")

    const sm = await prisma.stokMasuk.findFirst({ where: { rokok_id: r.id } })
    expect(sm.keterangan).toBe("Stok Masuk")
  })
})

describe("koreksiStok", () => {
  it("koreksi 'in' — stok bertambah", async () => {
    const r = await createTestRokok({ stok: 10 })

    await koreksiStok(r.id, 5, "in", "koreksi tambah test")

    const updated = await prisma.rokok.findUnique({ where: { id: r.id } })
    expect(updated.stok).toBe(15)

    const mutation = await prisma.stockMutation.findFirst({ where: { rokok_id: r.id } })
    expect(mutation.source).toBe("koreksi")
    expect(mutation.jenis).toBe("in")
    expect(mutation.qty).toBe(5)
  })

  it("koreksi 'out' — stok berkurang", async () => {
    const r = await createTestRokok({ stok: 20 })

    await koreksiStok(r.id, 7, "out", "koreksi kurang test")

    const updated = await prisma.rokok.findUnique({ where: { id: r.id } })
    expect(updated.stok).toBe(13)

    const mutation = await prisma.stockMutation.findFirst({ where: { rokok_id: r.id } })
    expect(mutation.jenis).toBe("out")
    expect(mutation.qty).toBe(7)
  })
})

describe("deleteRokok", () => {
  it("berhasil hapus rokok yang belum ada transaksi", async () => {
    const r = await createTestRokok()

    await deleteRokok(r.id, "test: hapus rokok bersih")

    const deleted = await prisma.rokok.findUnique({ where: { id: r.id } })
    expect(deleted).toBeNull()
    testRokokId = null // sudah dihapus, skip cleanup
  })

  it("berhasil hapus rokok yang hanya punya stok_awal (tidak dianggap transaksi)", async () => {
    // addRokok dengan stok > 0 buat mutation STOK_AWAL
    // getUsedRokokIds exclude STOK_AWAL → masih bisa dihapus
    await addRokok(makeRokokData({ stok: 10 }))
    const r = await prisma.rokok.findFirst({ where: { nama: TEST_NAMA } })
    testRokokId = r.id

    await deleteRokok(r.id, "test: hapus rokok stok awal saja")

    const deleted = await prisma.rokok.findUnique({ where: { id: r.id } })
    expect(deleted).toBeNull()
    testRokokId = null
  })

  it("gagal hapus rokok yang sudah punya transaksi (tambahStok)", async () => {
    const r = await createTestRokok({ stok: 10 })
    await tambahStok(r.id, 5, TODAY, "supplier test") // buat SUPPLIER mutation

    await expect(deleteRokok(r.id, "test")).rejects.toThrow(/histori transaksi/i)
  })
})
