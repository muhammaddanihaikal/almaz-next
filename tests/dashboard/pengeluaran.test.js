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

const { addPengeluaran, updatePengeluaran, deletePengeluaran } = await import("@/actions/pengeluaran")

const TEST_DATE = "2099-12-28"
let createdId = null

async function cleanupPengeluaran() {
  if (!createdId) return
  await prisma.auditLog.deleteMany({ where: { entity_id: createdId } })
  await prisma.pengeluaran.deleteMany({ where: { id: createdId } })
  createdId = null
}

afterEach(async () => {
  await cleanupPengeluaran()
})

afterAll(async () => {
  // Bersihkan sisa data test jika ada
  const sisa = await prisma.pengeluaran.findMany({
    where: { tanggal: new Date(TEST_DATE) },
  })
  for (const p of sisa) {
    await prisma.auditLog.deleteMany({ where: { entity_id: p.id } })
    await prisma.pengeluaran.delete({ where: { id: p.id } })
  }
  await prisma.$disconnect()
})

function makePengeluaranData(overrides = {}) {
  return {
    tanggal:     TEST_DATE,
    jumlah:      50000,
    keterangan:  "pengeluaran test",
    sumber:      "penjualan",
    ...overrides,
  }
}

async function findCreated() {
  return prisma.pengeluaran.findFirst({
    where: { tanggal: new Date(TEST_DATE), keterangan: { contains: "test" } },
    orderBy: { createdAt: "desc" },
  })
}

// ─── TESTS ────────────────────────────────────────────────────────────────────

describe("addPengeluaran", () => {
  it("berhasil tambah pengeluaran — data tersimpan dengan benar", async () => {
    await addPengeluaran(makePengeluaranData({ jumlah: 75000, keterangan: "operasional test" }))

    const p = await findCreated()
    createdId = p.id

    expect(p).not.toBeNull()
    expect(p.jumlah).toBe(75000)
    expect(p.keterangan).toBe("operasional test")
    expect(p.sumber).toBe("penjualan")
    expect(p.tanggal.toISOString().split("T")[0]).toBe(TEST_DATE)
  })

  it("sumber 'lainnya' tersimpan dengan benar", async () => {
    await addPengeluaran(makePengeluaranData({ sumber: "lainnya", keterangan: "sumber lain test" }))

    const p = await findCreated()
    createdId = p.id

    expect(p.sumber).toBe("lainnya")
  })

  it("gagal jika jumlah <= 0", async () => {
    await expect(addPengeluaran(makePengeluaranData({ jumlah: 0 }))).rejects.toThrow(/lebih dari 0/i)
    await expect(addPengeluaran(makePengeluaranData({ jumlah: -100 }))).rejects.toThrow(/lebih dari 0/i)
  })

  it("gagal jika jumlah bukan angka", async () => {
    await expect(addPengeluaran(makePengeluaranData({ jumlah: "abc" }))).rejects.toThrow(/lebih dari 0/i)
  })

  it("gagal jika keterangan kosong", async () => {
    await expect(addPengeluaran(makePengeluaranData({ keterangan: "" }))).rejects.toThrow(/keterangan/i)
    await expect(addPengeluaran(makePengeluaranData({ keterangan: "   " }))).rejects.toThrow(/keterangan/i)
  })

  it("gagal jika tanggal tidak diisi", async () => {
    await expect(addPengeluaran(makePengeluaranData({ tanggal: "" }))).rejects.toThrow(/tanggal/i)
    await expect(addPengeluaran(makePengeluaranData({ tanggal: null }))).rejects.toThrow(/tanggal/i)
  })

  it("gagal jika sumber tidak valid", async () => {
    await expect(addPengeluaran(makePengeluaranData({ sumber: "tidak-ada" }))).rejects.toThrow(/sumber/i)
  })

  it("keterangan di-trim — spasi di awal/akhir dihapus", async () => {
    await addPengeluaran(makePengeluaranData({ keterangan: "  trim test  " }))

    const p = await prisma.pengeluaran.findFirst({
      where: { keterangan: "trim test" },
      orderBy: { createdAt: "desc" },
    })
    createdId = p?.id
    expect(p?.keterangan).toBe("trim test")
  })
})

describe("updatePengeluaran", () => {
  it("berhasil update jumlah dan keterangan", async () => {
    await addPengeluaran(makePengeluaranData({ jumlah: 30000, keterangan: "sebelum update test" }))
    const p = await findCreated()
    createdId = p.id

    await updatePengeluaran(p.id, {
      tanggal:    TEST_DATE,
      jumlah:     80000,
      keterangan: "sesudah update test",
      sumber:     "penjualan",
    }, "test: update pengeluaran")

    const updated = await prisma.pengeluaran.findUnique({ where: { id: p.id } })
    expect(updated.jumlah).toBe(80000)
    expect(updated.keterangan).toBe("sesudah update test")
  })

  it("berhasil ubah sumber dari penjualan ke lainnya", async () => {
    await addPengeluaran(makePengeluaranData({ keterangan: "ganti sumber test" }))
    const p = await findCreated()
    createdId = p.id

    await updatePengeluaran(p.id, {
      tanggal:    TEST_DATE,
      jumlah:     50000,
      keterangan: "ganti sumber test",
      sumber:     "lainnya",
    }, "test")

    const updated = await prisma.pengeluaran.findUnique({ where: { id: p.id } })
    expect(updated.sumber).toBe("lainnya")
  })

  it("gagal update jika jumlah <= 0", async () => {
    await addPengeluaran(makePengeluaranData({ keterangan: "update gagal test" }))
    const p = await findCreated()
    createdId = p.id

    await expect(updatePengeluaran(p.id, makePengeluaranData({ jumlah: 0 }), "test")).rejects.toThrow(/lebih dari 0/i)
  })
})

describe("deletePengeluaran", () => {
  it("berhasil hapus pengeluaran", async () => {
    await addPengeluaran(makePengeluaranData({ keterangan: "hapus test" }))
    const p = await findCreated()
    createdId = p.id

    await deletePengeluaran(p.id, "test: hapus pengeluaran")

    const deleted = await prisma.pengeluaran.findUnique({ where: { id: p.id } })
    expect(deleted).toBeNull()
    createdId = null
  })

  it("data terhapus tidak bisa ditemukan lagi", async () => {
    await addPengeluaran(makePengeluaranData({ keterangan: "hapus check test" }))
    const p = await findCreated()
    createdId = p.id

    await deletePengeluaran(p.id, "test")
    createdId = null

    const all = await prisma.pengeluaran.findMany({
      where: { keterangan: "hapus check test" },
    })
    expect(all).toHaveLength(0)
  })
})
