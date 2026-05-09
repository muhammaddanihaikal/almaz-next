import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest"
import { prisma } from "@/lib/db"
import { getStock } from "@/lib/stock"

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

const { getMutasiStok, getMutasiHariIni, tambahStok, koreksiStok } = await import("@/actions/rokok")

const TEST_DATE  = "2099-11-15"
const TEST_NAMA  = "__TEST_ROKOK_MUTASI__"
const TODAY      = new Date().toISOString().split("T")[0]

let testRokok = null

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function createTestRokok(stok = 0) {
  testRokok = await prisma.rokok.create({
    data: {
      nama:             TEST_NAMA,
      stok,
      harga_beli:       10000,
      harga_grosir:     12000,
      harga_toko:       13000,
      harga_perorangan: 14000,
      urutan:           9998,
    },
  })
  return testRokok
}

// Buat StockMutation langsung untuk tanggal spesifik tanpa melalui action
// (dipakai agar bisa set tanggal di masa depan yang tidak dibatasi action)
async function insertMutation({ rokokId, tanggal, jenis, qty, source = "koreksi" }) {
  const delta = jenis === "in" ? qty : -qty
  await prisma.$transaction(async (tx) => {
    await tx.stockMutation.create({
      data: { rokok_id: rokokId, tanggal: new Date(tanggal), jenis, qty, source, reference_id: "test" },
    })
    await tx.rokok.update({
      where: { id: rokokId },
      data:  { stok: { increment: delta } },
    })
  })
}

async function cleanupTestRokok() {
  if (!testRokok) return
  await prisma.auditLog.deleteMany({ where: { entity_id: testRokok.id } })
  await prisma.stokMasuk.deleteMany({ where: { rokok_id: testRokok.id } })
  await prisma.stockMutation.deleteMany({ where: { rokok_id: testRokok.id } })
  await prisma.rokok.deleteMany({ where: { id: testRokok.id } })
  testRokok = null
}

afterEach(async () => {
  await cleanupTestRokok()
})

afterAll(async () => {
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

describe("getStock (lib/stock.js)", () => {
  it("stok 0 jika tidak ada mutasi", async () => {
    const r = await createTestRokok(0)
    const result = await getStock(r.id)
    expect(result).toBe(0)
  })

  it("hitung stok dari ledger: total in - total out", async () => {
    const r = await createTestRokok(0)
    await insertMutation({ rokokId: r.id, tanggal: TEST_DATE, jenis: "in",  qty: 30 })
    await insertMutation({ rokokId: r.id, tanggal: TEST_DATE, jenis: "in",  qty: 20 })
    await insertMutation({ rokokId: r.id, tanggal: TEST_DATE, jenis: "out", qty: 15 })

    const result = await getStock(r.id)
    expect(result).toBe(35) // 30+20-15
  })

  it("filter hingga tanggal tertentu — tidak hitung mutasi setelahnya", async () => {
    const r = await createTestRokok(0)
    await insertMutation({ rokokId: r.id, tanggal: "2099-11-01", jenis: "in",  qty: 50 })
    await insertMutation({ rokokId: r.id, tanggal: "2099-11-20", jenis: "out", qty: 10 })

    // Hitung stok hingga 2099-11-10 (sebelum mutasi out)
    const result = await getStock(r.id, new Date("2099-11-10"))
    expect(result).toBe(50)
  })

  it("stok bisa negatif jika out > in", async () => {
    const r = await createTestRokok(0)
    await insertMutation({ rokokId: r.id, tanggal: TEST_DATE, jenis: "in",  qty: 10 })
    await insertMutation({ rokokId: r.id, tanggal: TEST_DATE, jenis: "out", qty: 25, source: "revert" })

    const result = await getStock(r.id)
    expect(result).toBe(-15)
  })
})

describe("getMutasiStok — laporan per tanggal", () => {
  it("return laporan harian dengan stok_awal, masuk, keluar, akhir yang benar", async () => {
    const r = await createTestRokok(0)
    // Mutasi masuk 20, keluar 8 pada TEST_DATE
    await insertMutation({ rokokId: r.id, tanggal: TEST_DATE, jenis: "in",  qty: 20, source: "supplier" })
    await insertMutation({ rokokId: r.id, tanggal: TEST_DATE, jenis: "out", qty: 8,  source: "distribusi_sales" })

    const report = await getMutasiStok(TEST_DATE, TEST_DATE)

    const dayEntry = report.find((d) => d.tanggal === TEST_DATE)
    expect(dayEntry).toBeDefined()

    const rokokEntry = dayEntry.data.find((d) => d.rokok_id === r.id)
    expect(rokokEntry).toBeDefined()
    expect(rokokEntry.awal).toBe(0)   // tidak ada mutasi sebelum TEST_DATE
    expect(rokokEntry.masuk).toBe(20)
    expect(rokokEntry.keluar).toBe(8)
    expect(rokokEntry.akhir).toBe(12) // 0 + 20 - 8
  })

  it("stok_awal hari ini = stok_akhir hari sebelumnya", async () => {
    const r = await createTestRokok(0)
    const DAY1 = "2099-11-10"
    const DAY2 = "2099-11-11"

    await insertMutation({ rokokId: r.id, tanggal: DAY1, jenis: "in", qty: 30, source: "supplier" })
    await insertMutation({ rokokId: r.id, tanggal: DAY2, jenis: "out", qty: 10, source: "distribusi_sales" })

    const report = await getMutasiStok(DAY1, DAY2)

    const day1 = report.find((d) => d.tanggal === DAY1)?.data.find((d) => d.rokok_id === r.id)
    const day2 = report.find((d) => d.tanggal === DAY2)?.data.find((d) => d.rokok_id === r.id)

    expect(day1.awal).toBe(0)
    expect(day1.akhir).toBe(30)
    expect(day2.awal).toBe(30) // awal hari 2 = akhir hari 1
    expect(day2.akhir).toBe(20)
  })

  it("tanggal tanpa aktivitas dan awal=0 tidak muncul di laporan", async () => {
    const r = await createTestRokok(0)
    // Rokok ini belum ada mutasi sama sekali sebelum range "2099-11-20..2099-11-22"
    // Hanya ada mutasi di 2099-11-20, tidak di 2099-11-21 dan 2099-11-22
    await insertMutation({ rokokId: r.id, tanggal: "2099-11-20", jenis: "in", qty: 10, source: "supplier" })

    const report = await getMutasiStok("2099-11-20", "2099-11-22")

    const dayEntries = report.flatMap((d) => d.data).filter((d) => d.rokok_id === r.id)
    const tanggalDenganRokok = report.filter((d) => d.data.some((x) => x.rokok_id === r.id)).map((d) => d.tanggal)

    // 2099-11-20 harus muncul karena ada mutasi
    expect(tanggalDenganRokok).toContain("2099-11-20")
    // 2099-11-21 tetap muncul karena awal=10 (bukan 0), tapi masuk dan keluar = 0
    const day21 = report.find((d) => d.tanggal === "2099-11-21")?.data.find((d) => d.rokok_id === r.id)
    if (day21) {
      expect(day21.masuk).toBe(0)
      expect(day21.keluar).toBe(0)
    }
    // 2099-11-22 sama: jika muncul, masuk dan keluar harus 0
    const day22 = report.find((d) => d.tanggal === "2099-11-22")?.data.find((d) => d.rokok_id === r.id)
    if (day22) {
      expect(day22.masuk).toBe(0)
      expect(day22.keluar).toBe(0)
    }
  })

  it("rokok tanpa riwayat sama sekali tidak muncul dalam range tanpa aktivitas", async () => {
    const r = await createTestRokok(0)
    // Tidak ada mutasi sama sekali → awal=0 untuk semua tanggal dalam range
    const report = await getMutasiStok("2099-11-21", "2099-11-22")
    const entries = report.flatMap((d) => d.data).filter((d) => d.rokok_id === r.id)
    expect(entries).toHaveLength(0)
  })

  it("laporan kosong jika tidak ada mutasi dalam range", async () => {
    const r = await createTestRokok(0)

    const report = await getMutasiStok("2099-10-01", "2099-10-05")

    // Tidak ada entry untuk rokok test ini karena tidak ada mutasi dan awal=akhir=0
    const entries = report.flatMap((d) => d.data).filter((d) => d.rokok_id === r.id)
    expect(entries).toHaveLength(0)
  })

  it("detail_masuk hanya hitung source 'supplier'", async () => {
    const r = await createTestRokok(0)
    await insertMutation({ rokokId: r.id, tanggal: TEST_DATE, jenis: "in", qty: 15, source: "supplier" })
    await insertMutation({ rokokId: r.id, tanggal: TEST_DATE, jenis: "in", qty: 5,  source: "retur_sales" }) // bukan supplier

    const report = await getMutasiStok(TEST_DATE, TEST_DATE)
    const entry = report[0].data.find((d) => d.rokok_id === r.id)

    expect(entry.masuk).toBe(20)         // total in
    expect(entry.detail_masuk).toBe(15)  // hanya supplier
    expect(entry.detail_kembali).toBe(5) // retur_sales
  })
})

describe("getMutasiHariIni — mutasi hari ini", () => {
  it("tambahStok hari ini muncul di getMutasiHariIni", async () => {
    const r = await createTestRokok(0)

    await tambahStok(r.id, 25, TODAY, "stok test hari ini")

    const mutasi = await getMutasiHariIni()
    const entry = mutasi.find((m) => m.rokok_id === r.id)

    expect(entry).toBeDefined()
    expect(entry.jenis).toBe("in")
    expect(entry.qty).toBe(25)
    expect(entry.source).toBe("supplier")
  })

  it("koreksiStok hari ini muncul di getMutasiHariIni", async () => {
    const r = await createTestRokok(50) // perlu stok awal agar bisa out
    await insertMutation({ rokokId: r.id, tanggal: TEST_DATE, jenis: "in", qty: 50 }) // seed stok

    await koreksiStok(r.id, 10, "out", "koreksi test hari ini")

    const mutasi = await getMutasiHariIni()
    const entries = mutasi.filter((m) => m.rokok_id === r.id && m.source === "koreksi")

    expect(entries.length).toBeGreaterThan(0)
    expect(entries[0].qty).toBe(10)
    expect(entries[0].jenis).toBe("out")
  })

  it("mutasi dari hari lain tidak muncul", async () => {
    const r = await createTestRokok(0)
    // Buat mutasi di masa lalu langsung ke DB
    await insertMutation({ rokokId: r.id, tanggal: "2020-01-01", jenis: "in", qty: 100, source: "supplier" })

    const mutasi = await getMutasiHariIni()
    const entry = mutasi.find((m) => m.rokok_id === r.id && m.source === "supplier")

    expect(entry).toBeUndefined()
  })

  it("format createdAt dalam WIB (string tanpa T, format YYY-MM-DD HH:mm)", async () => {
    const r = await createTestRokok(0)
    await tambahStok(r.id, 5, TODAY, "format test")

    const mutasi = await getMutasiHariIni()
    const entry = mutasi.find((m) => m.rokok_id === r.id)

    expect(entry.createdAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
  })
})
