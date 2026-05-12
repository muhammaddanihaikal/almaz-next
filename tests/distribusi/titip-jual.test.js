import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest"
import { prisma } from "@/lib/db"
import {
  seedTestData,
  cleanupTestSales,
  cleanupTestToko,
  cleanupSesiWithAllStock,
} from "../helpers/db"

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
const {
  createTitipJual,
  settleTitipJual,
  partialSettleTitipJual,
  editTitipJualDetail,
  deleteTitipJual,
  editSettlement,
  revertSettlement,
} = await import("@/actions/titip_jual")

let testSales
let testToko
let testRokok
let createdSesiId = null

const TEST_DATE    = "2099-12-28"
const TEST_DATE_JT = "2099-12-31"

beforeAll(async () => {
  const { sales, toko, rokok } = await seedTestData()
  testSales = sales
  testToko  = toko
  testRokok = rokok
})

afterEach(async () => {
  if (createdSesiId) {
    await cleanupSesiWithAllStock(createdSesiId)
    createdSesiId = null
  }
})

afterAll(async () => {
  await cleanupTestSales(testSales?.id)
  await cleanupTestToko(testToko?.id)
  await prisma.$disconnect()
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function buatSesi() {
  const result = await createSesi({
    tanggal:      TEST_DATE,
    sales_id:     testSales.id,
    catatan:      null,
    barangKeluar: [],
  })
  if (!result.success) throw new Error(`Gagal buat sesi: ${result.error}`)
  createdSesiId = result.data.id
  return result.data
}

async function buatTitipJual(sesiId, overrides = {}) {
  return createTitipJual(sesiId, testSales.id, {
    toko_id:             testToko.id,
    kategori:            "toko",
    tanggal_jatuh_tempo: TEST_DATE_JT,
    catatan:             null,
    items: [{ rokok_id: testRokok.id, qty: 5 }],
    ...overrides,
  })
}

// ─── TESTS ────────────────────────────────────────────────────────────────────

describe("createTitipJual", () => {
  it("berhasil membuat titip jual — data tersimpan dan stok berkurang", async () => {
    const stokSebelum = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok
    const sesi = await buatSesi()

    const result = await buatTitipJual(sesi.id, { items: [{ rokok_id: testRokok.id, qty: 5 }] })

    expect(result).toBeDefined()
    expect(result.status).toBe("aktif")
    expect(result.toko_id).toBe(testToko.id)
    expect(result.items[0].qty_keluar).toBe(5)
    expect(result.items[0].qty_terjual).toBe(0)
    expect(result.items[0].qty_kembali).toBe(0)

    // createTitipJual (halaman titip jual) mengurangi stok — berbeda dengan laporan sore
    const stokSesudah = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok
    expect(stokSesudah).toBe(stokSebelum - 5)
  })

  it("item dengan qty 0 difilter — tidak tersimpan", async () => {
    const sesi = await buatSesi()

    const result = await buatTitipJual(sesi.id, {
      items: [
        { rokok_id: testRokok.id, qty: 3 },
        { rokok_id: testRokok.id, qty: 0 },
      ],
    })

    // Qty 0 difilter — hanya 1 item yang tersimpan (qty 3)
    const itemsValid = result.items.filter((it) => it.qty_keluar > 0)
    expect(itemsValid).toHaveLength(1)
    expect(itemsValid[0].qty_keluar).toBe(3)
  })
})

describe("deleteTitipJual", () => {
  it("hapus titip jual aktif — stok kembali ke semula", async () => {
    const stokSebelum = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok
    const sesi = await buatSesi()
    const titipJual = await buatTitipJual(sesi.id, { items: [{ rokok_id: testRokok.id, qty: 4 }] })

    const stokSetelahBuat = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok
    expect(stokSetelahBuat).toBe(stokSebelum - 4)

    await deleteTitipJual(titipJual.id, "test: hapus titip jual")

    const stokSesudah = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok
    expect(stokSesudah).toBe(stokSebelum)

    const diDb = await prisma.titipJual.findUnique({ where: { id: titipJual.id } })
    expect(diDb).toBeNull()
  })

  it("gagal hapus titip jual yang sudah selesai", async () => {
    const sesi = await buatSesi()
    const titipJual = await buatTitipJual(sesi.id, { items: [{ rokok_id: testRokok.id, qty: 3 }] })

    // Settle dulu
    await settleTitipJual(titipJual.id, {
      tanggal: TEST_DATE,
      items:   [{ id: titipJual.items[0].id, rokok_id: testRokok.id, qty_terjual: 3, qty_kembali: 0 }],
      setoran: [{ metode: "cash", jumlah: titipJual.items[0].harga * 3 }],
    })

    await expect(deleteTitipJual(titipJual.id, "test")).rejects.toThrow(/aktif/i)
  })
})

describe("editTitipJualDetail", () => {
  it("berhasil update tanggal jatuh tempo dan catatan", async () => {
    const sesi = await buatSesi()
    const titipJual = await buatTitipJual(sesi.id)

    await editTitipJualDetail(titipJual.id, {
      tanggal_jatuh_tempo: "2099-12-15",
      catatan:             "perpanjang 2 minggu",
    }, "test: perpanjang jatuh tempo")

    const updated = await prisma.titipJual.findUnique({ where: { id: titipJual.id } })
    expect(updated.tanggal_jatuh_tempo.toISOString().split("T")[0]).toBe("2099-12-15")
    expect(updated.catatan).toBe("perpanjang 2 minggu")
  })
})

describe("settleTitipJual", () => {
  it("settlement semua terjual — status selesai, stok tidak berubah", async () => {
    const sesi = await buatSesi()
    const titipJual = await buatTitipJual(sesi.id, { items: [{ rokok_id: testRokok.id, qty: 5 }] })
    const stokSaatAktif = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok

    await settleTitipJual(titipJual.id, {
      tanggal: TEST_DATE,
      items:   [{ id: titipJual.items[0].id, rokok_id: testRokok.id, qty_terjual: 5, qty_kembali: 0 }],
      setoran: [{ metode: "cash", jumlah: titipJual.items[0].harga * 5 }],
    })

    const settled = await prisma.titipJual.findUnique({
      where: { id: titipJual.id },
      include: { items: true, setoran: true },
    })
    expect(settled.status).toBe("selesai")
    expect(settled.items[0].qty_terjual).toBe(5)
    expect(settled.items[0].qty_kembali).toBe(0)
    expect(settled.setoran).toHaveLength(1)

    // Semua terjual → stok tidak berubah (qty_kembali=0)
    const stokSesudah = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok
    expect(stokSesudah).toBe(stokSaatAktif)
  })

  it("settlement sebagian kembali — stok bertambah sesuai qty_kembali", async () => {
    const sesi = await buatSesi()
    const titipJual = await buatTitipJual(sesi.id, { items: [{ rokok_id: testRokok.id, qty: 5 }] })
    const stokSaatAktif = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok

    await settleTitipJual(titipJual.id, {
      tanggal: TEST_DATE,
      items:   [{ id: titipJual.items[0].id, rokok_id: testRokok.id, qty_terjual: 3, qty_kembali: 2 }],
      setoran: [{ metode: "cash", jumlah: titipJual.items[0].harga * 3 }],
    })

    // 2 kembali → stok gudang bertambah 2
    const stokSesudah = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok
    expect(stokSesudah).toBe(stokSaatAktif + 2)
  })

  it("flag_selisih_setoran = true jika setoran tidak sesuai nilai terjual", async () => {
    const sesi = await buatSesi()
    const titipJual = await buatTitipJual(sesi.id, { items: [{ rokok_id: testRokok.id, qty: 5 }] })

    await settleTitipJual(titipJual.id, {
      tanggal: TEST_DATE,
      items:   [{ id: titipJual.items[0].id, rokok_id: testRokok.id, qty_terjual: 5, qty_kembali: 0 }],
      setoran: [{ metode: "cash", jumlah: 1 }], // sengaja tidak sesuai
    })

    const settled = await prisma.titipJual.findUnique({ where: { id: titipJual.id } })
    expect(settled.flag_selisih_setoran).toBe(true)
  })

  it("flag_selisih_setoran = false jika setoran sesuai nilai terjual", async () => {
    const sesi = await buatSesi()
    const titipJual = await buatTitipJual(sesi.id, { items: [{ rokok_id: testRokok.id, qty: 5 }] })
    const nilaiPer   = titipJual.items[0].harga

    await settleTitipJual(titipJual.id, {
      tanggal: TEST_DATE,
      items:   [{ id: titipJual.items[0].id, rokok_id: testRokok.id, qty_terjual: 5, qty_kembali: 0 }],
      setoran: [{ metode: "cash", jumlah: nilaiPer * 5 }],
    })

    const settled = await prisma.titipJual.findUnique({ where: { id: titipJual.id } })
    expect(settled.flag_selisih_setoran).toBe(false)
  })
})

describe("revertSettlement", () => {
  it("batalkan settlement — status aktif kembali, stok revert qty_kembali", async () => {
    const sesi = await buatSesi()
    const titipJual = await buatTitipJual(sesi.id, { items: [{ rokok_id: testRokok.id, qty: 5 }] })

    // Settle dengan 2 kembali
    await settleTitipJual(titipJual.id, {
      tanggal: TEST_DATE,
      items:   [{ id: titipJual.items[0].id, rokok_id: testRokok.id, qty_terjual: 3, qty_kembali: 2 }],
      setoran: [],
    })
    const stokSetelahSettle = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok

    // Revert settlement
    await revertSettlement(titipJual.id, "test: batalkan settlement")

    const reverted = await prisma.titipJual.findUnique({
      where: { id: titipJual.id },
      include: { items: true },
    })
    expect(reverted.status).toBe("aktif")
    expect(reverted.tanggal_selesai).toBeNull()
    expect(reverted.items[0].qty_terjual).toBe(0)
    expect(reverted.items[0].qty_kembali).toBe(0)

    // Stok balik berkurang 2 (revert qty_kembali yang sebelumnya masuk)
    const stokSesudah = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok
    expect(stokSesudah).toBe(stokSetelahSettle - 2)
  })
})

describe("editSettlement", () => {
  it("edit qty kembali — stok disesuaikan dengan selisih", async () => {
    const sesi = await buatSesi()
    const titipJual = await buatTitipJual(sesi.id, { items: [{ rokok_id: testRokok.id, qty: 5 }] })

    // Settle: terjual 3, kembali 2 → stok +2
    await settleTitipJual(titipJual.id, {
      tanggal: TEST_DATE,
      items:   [{ id: titipJual.items[0].id, rokok_id: testRokok.id, qty_terjual: 3, qty_kembali: 2 }],
      setoran: [],
    })
    const stokSetelahSettle = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok

    // Edit settlement: naikkan kembali dari 2 → 4
    await editSettlement(titipJual.id, {
      tanggal: TEST_DATE,
      items:   [{ id: titipJual.items[0].id, rokok_id: testRokok.id, qty_terjual: 1, qty_kembali: 4 }],
      setoran: [],
    }, "test: edit settlement")

    // Stok bertambah 2 lagi (4-2 = selisih kembali)
    const stokSesudah = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok
    expect(stokSesudah).toBe(stokSetelahSettle + 2)
  })

  it("edit hapus qty kembali — stok berkurang (revert kembali lama)", async () => {
    const sesi = await buatSesi()
    const titipJual = await buatTitipJual(sesi.id, { items: [{ rokok_id: testRokok.id, qty: 5 }] })

    await settleTitipJual(titipJual.id, {
      tanggal: TEST_DATE,
      items:   [{ id: titipJual.items[0].id, rokok_id: testRokok.id, qty_terjual: 3, qty_kembali: 2 }],
      setoran: [],
    })
    const stokSetelahSettle = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok

    // Edit: hapus qty kembali (jadi 0)
    await editSettlement(titipJual.id, {
      tanggal: TEST_DATE,
      items:   [{ id: titipJual.items[0].id, rokok_id: testRokok.id, qty_terjual: 5, qty_kembali: 0 }],
      setoran: [],
    }, "test: hapus kembali")

    // Stok berkurang 2 (revert kembali lama 2, kembali baru 0)
    const stokSesudah = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok
    expect(stokSesudah).toBe(stokSetelahSettle - 2)
  })

  it("edit setoran — setoran lama dihapus, setoran baru masuk", async () => {
    const sesi = await buatSesi()
    const titipJual = await buatTitipJual(sesi.id, { items: [{ rokok_id: testRokok.id, qty: 5 }] })
    const nilaiPer   = titipJual.items[0].harga

    await settleTitipJual(titipJual.id, {
      tanggal: TEST_DATE,
      items:   [{ id: titipJual.items[0].id, rokok_id: testRokok.id, qty_terjual: 5, qty_kembali: 0 }],
      setoran: [{ metode: "cash", jumlah: nilaiPer * 5 }],
    })

    await editSettlement(titipJual.id, {
      tanggal: TEST_DATE,
      items:   [{ id: titipJual.items[0].id, rokok_id: testRokok.id, qty_terjual: 5, qty_kembali: 0 }],
      setoran: [{ metode: "transfer", jumlah: nilaiPer * 5 }],
    }, "test: ganti metode setoran")

    const updated = await prisma.titipJual.findUnique({
      where: { id: titipJual.id },
      include: { setoran: true },
    })
    expect(updated.setoran).toHaveLength(1)
    expect(updated.setoran[0].metode).toBe("transfer")
  })
})

describe("partialSettleTitipJual", () => {
  it("semua item bayar — sama seperti settlement normal, tidak ada rollover", async () => {
    const sesi = await buatSesi()
    const titipJual = await buatTitipJual(sesi.id, { items: [{ rokok_id: testRokok.id, qty: 5 }] })
    const item = titipJual.items[0]
    const stokSaatAktif = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok

    const rollover = await partialSettleTitipJual(titipJual.id, {
      tanggal: TEST_DATE,
      perpanjang_tanggal: null,
      items:   [{ id: item.id, rokok_id: testRokok.id, action: "bayar", qty_terjual: 4, qty_kembali: 1 }],
      setoran: [{ metode: "cash", jumlah: item.harga * 4 }],
    })

    expect(rollover).toBeNull()

    const settled = await prisma.titipJual.findUnique({ where: { id: titipJual.id } })
    expect(settled.status).toBe("selesai")

    const stokSesudah = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok
    expect(stokSesudah).toBe(stokSaatAktif + 1)
  })

  it("sebagian item perpanjang — rollover dibuat, original selesai, stok tidak berubah untuk perpanjang", async () => {
    const sesi = await buatSesi()
    // Buat titip jual dengan 2 item dari rokok yang sama
    const titipJual = await buatTitipJual(sesi.id, {
      items: [
        { rokok_id: testRokok.id, qty: 3 },
        { rokok_id: testRokok.id, qty: 2 },
      ],
    })
    const items = titipJual.items
    const stokSaatAktif = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok

    const PERPANJANG_DATE = "2099-12-10"
    const rollover = await partialSettleTitipJual(titipJual.id, {
      tanggal:            TEST_DATE,
      perpanjang_tanggal: PERPANJANG_DATE,
      items: [
        { id: items[0].id, rokok_id: testRokok.id, action: "bayar",      qty_terjual: 3, qty_kembali: 0 },
        { id: items[1].id, rokok_id: testRokok.id, action: "perpanjang", qty_terjual: 0, qty_kembali: 0 },
      ],
      setoran: [{ metode: "cash", jumlah: items[0].harga * 3 }],
    })

    // Original ditutup
    const original = await prisma.titipJual.findUnique({
      where: { id: titipJual.id },
      include: { setoran: true },
    })
    expect(original.status).toBe("selesai")
    expect(original.setoran).toHaveLength(1)

    // Rollover dibuat
    expect(rollover).not.toBeNull()
    expect(rollover.status).toBe("aktif")
    expect(rollover.tanggal_jatuh_tempo).toBe(PERPANJANG_DATE)
    expect(rollover.items).toHaveLength(1)
    expect(rollover.items[0].qty_keluar).toBe(2)

    // Stok: item bayar semua terjual (qty_kembali=0) → tidak ada perubahan stok
    // item perpanjang tidak memutasi stok
    const stokSesudah = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok
    expect(stokSesudah).toBe(stokSaatAktif)
  })

  it("gagal jika semua item perpanjang", async () => {
    const sesi = await buatSesi()
    const titipJual = await buatTitipJual(sesi.id, { items: [{ rokok_id: testRokok.id, qty: 5 }] })
    const item = titipJual.items[0]

    await expect(
      partialSettleTitipJual(titipJual.id, {
        tanggal:            TEST_DATE,
        perpanjang_tanggal: "2099-12-10",
        items:   [{ id: item.id, rokok_id: testRokok.id, action: "perpanjang", qty_terjual: 0, qty_kembali: 0 }],
        setoran: [],
      })
    ).rejects.toThrow(/minimal satu item/i)
  })

  it("gagal jika perpanjang_tanggal kosong padahal ada item perpanjang", async () => {
    const sesi = await buatSesi()
    const titipJual = await buatTitipJual(sesi.id, {
      items: [
        { rokok_id: testRokok.id, qty: 3 },
        { rokok_id: testRokok.id, qty: 2 },
      ],
    })
    const items = titipJual.items

    await expect(
      partialSettleTitipJual(titipJual.id, {
        tanggal:            TEST_DATE,
        perpanjang_tanggal: null,
        items: [
          { id: items[0].id, rokok_id: testRokok.id, action: "bayar",      qty_terjual: 3, qty_kembali: 0 },
          { id: items[1].id, rokok_id: testRokok.id, action: "perpanjang", qty_terjual: 0, qty_kembali: 0 },
        ],
        setoran: [{ metode: "cash", jumlah: 100 }],
      })
    ).rejects.toThrow(/tanggal perpanjang/i)
  })

  it("item bayar dengan qty_kembali > 0 — stok naik sesuai kembali, perpanjang tidak mutasi stok", async () => {
    const sesi = await buatSesi()
    const titipJual = await buatTitipJual(sesi.id, {
      items: [
        { rokok_id: testRokok.id, qty: 4 },
        { rokok_id: testRokok.id, qty: 3 },
      ],
    })
    const items = titipJual.items
    const stokSaatAktif = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok

    await partialSettleTitipJual(titipJual.id, {
      tanggal:            TEST_DATE,
      perpanjang_tanggal: "2099-12-20",
      items: [
        { id: items[0].id, rokok_id: testRokok.id, action: "bayar",      qty_terjual: 2, qty_kembali: 2 },
        { id: items[1].id, rokok_id: testRokok.id, action: "perpanjang", qty_terjual: 0, qty_kembali: 0 },
      ],
      setoran: [{ metode: "cash", jumlah: items[0].harga * 2 }],
    })

    // Kembali 2 dari item bayar → stok naik 2
    // Perpanjang 3 → tidak mutasi stok
    const stokSesudah = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok
    expect(stokSesudah).toBe(stokSaatAktif + 2)
  })

  it("data rollover mewarisi sales, toko, kategori, sesi dari original", async () => {
    const sesi = await buatSesi()
    const titipJual = await buatTitipJual(sesi.id, {
      items: [
        { rokok_id: testRokok.id, qty: 5 },
        { rokok_id: testRokok.id, qty: 2 },
      ],
    })
    const items = titipJual.items

    const PERPANJANG_DATE = "2099-12-15"
    const rollover = await partialSettleTitipJual(titipJual.id, {
      tanggal:            TEST_DATE,
      perpanjang_tanggal: PERPANJANG_DATE,
      items: [
        { id: items[0].id, rokok_id: testRokok.id, action: "bayar",      qty_terjual: 5, qty_kembali: 0 },
        { id: items[1].id, rokok_id: testRokok.id, action: "perpanjang", qty_terjual: 0, qty_kembali: 0 },
      ],
      setoran: [{ metode: "cash", jumlah: items[0].harga * 5 }],
    })

    const rolloverDb = await prisma.titipJual.findUnique({
      where:   { id: rollover.id },
      include: { items: true },
    })
    expect(rolloverDb.sesi_id).toBe(sesi.id)
    expect(rolloverDb.sales_id).toBe(testSales.id)
    expect(rolloverDb.toko_id).toBe(testToko.id)
    expect(rolloverDb.kategori).toBe("toko")
    expect(rolloverDb.tanggal_jatuh_tempo.toISOString().split("T")[0]).toBe(PERPANJANG_DATE)
    expect(rolloverDb.items).toHaveLength(1)
    expect(rolloverDb.items[0].qty_keluar).toBe(2)
    expect(rolloverDb.items[0].qty_terjual).toBe(0)
    expect(rolloverDb.items[0].qty_kembali).toBe(0)
    expect(rolloverDb.items[0].harga).toBe(items[1].harga)
  })

  it("flag_selisih_setoran dihitung hanya dari item bayar, bukan item perpanjang", async () => {
    const sesi = await buatSesi()
    const titipJual = await buatTitipJual(sesi.id, {
      items: [
        { rokok_id: testRokok.id, qty: 3 },
        { rokok_id: testRokok.id, qty: 4 },
      ],
    })
    const items = titipJual.items

    // Setoran sesuai nilai item bayar saja (3 × harga)
    await partialSettleTitipJual(titipJual.id, {
      tanggal:            TEST_DATE,
      perpanjang_tanggal: "2099-12-25",
      items: [
        { id: items[0].id, rokok_id: testRokok.id, action: "bayar",      qty_terjual: 3, qty_kembali: 0 },
        { id: items[1].id, rokok_id: testRokok.id, action: "perpanjang", qty_terjual: 0, qty_kembali: 0 },
      ],
      setoran: [{ metode: "cash", jumlah: items[0].harga * 3 }],
    })

    const original = await prisma.titipJual.findUnique({ where: { id: titipJual.id } })
    expect(original.flag_selisih_setoran).toBe(false)
  })

  it("flag_selisih_setoran = true jika setoran tidak sesuai nilai item bayar", async () => {
    const sesi = await buatSesi()
    const titipJual = await buatTitipJual(sesi.id, {
      items: [
        { rokok_id: testRokok.id, qty: 3 },
        { rokok_id: testRokok.id, qty: 4 },
      ],
    })
    const items = titipJual.items

    // Setoran sengaja kurang
    await partialSettleTitipJual(titipJual.id, {
      tanggal:            TEST_DATE,
      perpanjang_tanggal: "2099-12-25",
      items: [
        { id: items[0].id, rokok_id: testRokok.id, action: "bayar",      qty_terjual: 3, qty_kembali: 0 },
        { id: items[1].id, rokok_id: testRokok.id, action: "perpanjang", qty_terjual: 0, qty_kembali: 0 },
      ],
      setoran: [{ metode: "cash", jumlah: 1 }],
    })

    const original = await prisma.titipJual.findUnique({ where: { id: titipJual.id } })
    expect(original.flag_selisih_setoran).toBe(true)
  })

  it("catatan otomatis di original mencatat item yang diperpanjang", async () => {
    const sesi = await buatSesi()
    const titipJual = await buatTitipJual(sesi.id, {
      items: [
        { rokok_id: testRokok.id, qty: 3 },
        { rokok_id: testRokok.id, qty: 2 },
      ],
    })
    const items = titipJual.items

    await partialSettleTitipJual(titipJual.id, {
      tanggal:            TEST_DATE,
      perpanjang_tanggal: "2099-12-20",
      items: [
        { id: items[0].id, rokok_id: testRokok.id, action: "bayar",      qty_terjual: 3, qty_kembali: 0 },
        { id: items[1].id, rokok_id: testRokok.id, action: "perpanjang", qty_terjual: 0, qty_kembali: 0 },
      ],
      setoran: [{ metode: "cash", jumlah: items[0].harga * 3 }],
    })

    const original = await prisma.titipJual.findUnique({ where: { id: titipJual.id } })
    expect(original.catatan).toMatch(/diperpanjang/i)
    expect(original.catatan).toMatch(testRokok.nama)
  })

  it("rollover dapat diselesaikan dengan settleTitipJual normal", async () => {
    const sesi = await buatSesi()
    const titipJual = await buatTitipJual(sesi.id, {
      items: [
        { rokok_id: testRokok.id, qty: 3 },
        { rokok_id: testRokok.id, qty: 4 },
      ],
    })
    const items = titipJual.items

    const rollover = await partialSettleTitipJual(titipJual.id, {
      tanggal:            TEST_DATE,
      perpanjang_tanggal: "2099-12-20",
      items: [
        { id: items[0].id, rokok_id: testRokok.id, action: "bayar",      qty_terjual: 3, qty_kembali: 0 },
        { id: items[1].id, rokok_id: testRokok.id, action: "perpanjang", qty_terjual: 0, qty_kembali: 0 },
      ],
      setoran: [{ metode: "cash", jumlah: items[0].harga * 3 }],
    })

    const rolloverItem = rollover.items[0]
    const stokSebelumSettle = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok

    // Settle rollover: semua terjual
    await settleTitipJual(rollover.id, {
      tanggal: TEST_DATE,
      items:   [{ id: rolloverItem.id, rokok_id: testRokok.id, qty_terjual: 4, qty_kembali: 0 }],
      setoran: [{ metode: "transfer", jumlah: rolloverItem.harga * 4 }],
    })

    const rolloverDb = await prisma.titipJual.findUnique({
      where: { id: rollover.id },
      include: { setoran: true },
    })
    expect(rolloverDb.status).toBe("selesai")
    expect(rolloverDb.setoran).toHaveLength(1)
    expect(rolloverDb.setoran[0].metode).toBe("transfer")

    // Semua terjual dari rollover → stok tidak berubah
    const stokSesudahSettle = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok
    expect(stokSesudahSettle).toBe(stokSebelumSettle)
  })

  it("rollover dapat dihapus — stok kembali sesuai qty_keluar rollover", async () => {
    const sesi = await buatSesi()
    const titipJual = await buatTitipJual(sesi.id, {
      items: [
        { rokok_id: testRokok.id, qty: 3 },
        { rokok_id: testRokok.id, qty: 2 },
      ],
    })
    const items = titipJual.items

    const rollover = await partialSettleTitipJual(titipJual.id, {
      tanggal:            TEST_DATE,
      perpanjang_tanggal: "2099-12-20",
      items: [
        { id: items[0].id, rokok_id: testRokok.id, action: "bayar",      qty_terjual: 3, qty_kembali: 0 },
        { id: items[1].id, rokok_id: testRokok.id, action: "perpanjang", qty_terjual: 0, qty_kembali: 0 },
      ],
      setoran: [{ metode: "cash", jumlah: items[0].harga * 3 }],
    })

    const stokSebelumHapus = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok

    // Hapus rollover → 2 item "dikembalikan" ke gudang
    await deleteTitipJual(rollover.id, "test: hapus rollover")

    const stokSesudahHapus = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok
    expect(stokSesudahHapus).toBe(stokSebelumHapus + 2)

    const rolloverDb = await prisma.titipJual.findUnique({ where: { id: rollover.id } })
    expect(rolloverDb).toBeNull()
  })

  it("gagal settle titip jual yang sudah selesai (double settle)", async () => {
    const sesi = await buatSesi()
    const titipJual = await buatTitipJual(sesi.id, {
      items: [
        { rokok_id: testRokok.id, qty: 3 },
        { rokok_id: testRokok.id, qty: 2 },
      ],
    })
    const items = titipJual.items

    await partialSettleTitipJual(titipJual.id, {
      tanggal:            TEST_DATE,
      perpanjang_tanggal: "2099-12-20",
      items: [
        { id: items[0].id, rokok_id: testRokok.id, action: "bayar",      qty_terjual: 3, qty_kembali: 0 },
        { id: items[1].id, rokok_id: testRokok.id, action: "perpanjang", qty_terjual: 0, qty_kembali: 0 },
      ],
      setoran: [{ metode: "cash", jumlah: items[0].harga * 3 }],
    })

    // Coba settle lagi → harus gagal (sudah selesai)
    await expect(
      partialSettleTitipJual(titipJual.id, {
        tanggal:            TEST_DATE,
        perpanjang_tanggal: null,
        items: [
          { id: items[0].id, rokok_id: testRokok.id, action: "bayar", qty_terjual: 3, qty_kembali: 0 },
        ],
        setoran: [{ metode: "cash", jumlah: 100 }],
      })
    ).rejects.toThrow(/aktif/i)
  })

  it("revert settlement — rollover aktif ikut dihapus otomatis", async () => {
    const sesi = await buatSesi()
    const titipJual = await buatTitipJual(sesi.id, {
      items: [
        { rokok_id: testRokok.id, qty: 3 },
        { rokok_id: testRokok.id, qty: 2 },
      ],
    })
    const items = titipJual.items

    const rollover = await partialSettleTitipJual(titipJual.id, {
      tanggal:            TEST_DATE,
      perpanjang_tanggal: "2099-12-20",
      items: [
        { id: items[0].id, rokok_id: testRokok.id, action: "bayar",      qty_terjual: 3, qty_kembali: 0 },
        { id: items[1].id, rokok_id: testRokok.id, action: "perpanjang", qty_terjual: 0, qty_kembali: 0 },
      ],
      setoran: [{ metode: "cash", jumlah: items[0].harga * 3 }],
    })

    // Revert settlement original → rollover aktif harus ikut dihapus
    await revertSettlement(titipJual.id, "test: revert setelah partial settle")

    const originalDb = await prisma.titipJual.findUnique({ where: { id: titipJual.id } })
    expect(originalDb.status).toBe("aktif")

    const rolloverDb = await prisma.titipJual.findUnique({ where: { id: rollover.id } })
    expect(rolloverDb).toBeNull()
  })

  it("revert settlement diblokir jika rollover sudah selesai", async () => {
    const sesi = await buatSesi()
    const titipJual = await buatTitipJual(sesi.id, {
      items: [
        { rokok_id: testRokok.id, qty: 3 },
        { rokok_id: testRokok.id, qty: 2 },
      ],
    })
    const items = titipJual.items

    const rollover = await partialSettleTitipJual(titipJual.id, {
      tanggal:            TEST_DATE,
      perpanjang_tanggal: "2099-12-20",
      items: [
        { id: items[0].id, rokok_id: testRokok.id, action: "bayar",      qty_terjual: 3, qty_kembali: 0 },
        { id: items[1].id, rokok_id: testRokok.id, action: "perpanjang", qty_terjual: 0, qty_kembali: 0 },
      ],
      setoran: [{ metode: "cash", jumlah: items[0].harga * 3 }],
    })

    // Settle rollover terlebih dahulu
    const rolloverItem = rollover.items[0]
    await settleTitipJual(rollover.id, {
      tanggal: TEST_DATE,
      items:   [{ id: rolloverItem.id, rokok_id: testRokok.id, qty_terjual: 2, qty_kembali: 0 }],
      setoran: [{ metode: "cash", jumlah: rolloverItem.harga * 2 }],
    })

    // Revert original → harus diblokir karena rollover sudah selesai
    await expect(
      revertSettlement(titipJual.id, "test: revert setelah rollover selesai")
    ).rejects.toThrow(/rollover.*selesai|perpanjang.*diselesaikan/i)
  })

  it("edit settlement diblokir jika rollover masih ada", async () => {
    const sesi = await buatSesi()
    const titipJual = await buatTitipJual(sesi.id, {
      items: [
        { rokok_id: testRokok.id, qty: 3 },
        { rokok_id: testRokok.id, qty: 2 },
      ],
    })
    const items = titipJual.items

    await partialSettleTitipJual(titipJual.id, {
      tanggal:            TEST_DATE,
      perpanjang_tanggal: "2099-12-20",
      items: [
        { id: items[0].id, rokok_id: testRokok.id, action: "bayar",      qty_terjual: 3, qty_kembali: 0 },
        { id: items[1].id, rokok_id: testRokok.id, action: "perpanjang", qty_terjual: 0, qty_kembali: 0 },
      ],
      setoran: [{ metode: "cash", jumlah: items[0].harga * 3 }],
    })

    // Edit settlement original → harus diblokir selama rollover masih ada
    await expect(
      editSettlement(titipJual.id, {
        tanggal: TEST_DATE,
        items:   [{ id: items[0].id, rokok_id: testRokok.id, qty_terjual: 3, qty_kembali: 0 }],
        setoran: [{ metode: "cash", jumlah: items[0].harga * 3 }],
      }, "test: edit setelah partial settle")
    ).rejects.toThrow(/rollover|perpanjang/i)
  })

  it("edit settlement diizinkan setelah rollover dihapus", async () => {
    const sesi = await buatSesi()
    const titipJual = await buatTitipJual(sesi.id, {
      items: [
        { rokok_id: testRokok.id, qty: 3 },
        { rokok_id: testRokok.id, qty: 2 },
      ],
    })
    const items = titipJual.items

    const rollover = await partialSettleTitipJual(titipJual.id, {
      tanggal:            TEST_DATE,
      perpanjang_tanggal: "2099-12-20",
      items: [
        { id: items[0].id, rokok_id: testRokok.id, action: "bayar",      qty_terjual: 3, qty_kembali: 0 },
        { id: items[1].id, rokok_id: testRokok.id, action: "perpanjang", qty_terjual: 0, qty_kembali: 0 },
      ],
      setoran: [{ metode: "cash", jumlah: items[0].harga * 3 }],
    })

    // Hapus rollover → edit seharusnya bisa
    await deleteTitipJual(rollover.id, "test: hapus rollover sebelum edit")

    await expect(
      editSettlement(titipJual.id, {
        tanggal: TEST_DATE,
        items:   [{ id: items[0].id, rokok_id: testRokok.id, qty_terjual: 2, qty_kembali: 1 }],
        setoran: [{ metode: "transfer", jumlah: items[0].harga * 2 }],
      }, "test: edit setelah rollover dihapus")
    ).resolves.not.toThrow()

    const updated = await prisma.titipJual.findUnique({
      where:   { id: titipJual.id },
      include: { items: true, setoran: true },
    })
    expect(updated.items.find(it => it.id === items[0].id).qty_kembali).toBe(1)
    expect(updated.setoran[0].metode).toBe("transfer")
  })
})
