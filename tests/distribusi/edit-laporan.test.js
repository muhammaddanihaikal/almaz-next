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

const { createSesi, submitLaporanSore, editLaporanSore } = await import("@/actions/distribusi")

let testSales
let testToko
let testRokok
let createdSesiId = null

const TEST_DATE    = "2099-12-29"
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

async function buatSesiAktif(qtyKeluar = 5) {
  const result = await createSesi({
    tanggal:      TEST_DATE,
    sales_id:     testSales.id,
    catatan:      null,
    barangKeluar: qtyKeluar > 0 ? [{ rokok_id: testRokok.id, qty: qtyKeluar }] : [],
  })
  if (!result.success) throw new Error(`Gagal buat sesi: ${result.error}`)
  createdSesiId = result.data.id
  return result.data
}

async function submitLaporan(sesiId, overrides = {}) {
  const result = await submitLaporanSore(sesiId, {
    tanggal:               TEST_DATE,
    sales_id:              testSales.id,
    penjualan:             [],
    setoran:               [],
    barangKembali:         [],
    konsinyasiBaru:        [],
    tukarBaru:             [],
    returFromTukar:        null,
    penyelesaianTukar:     [],
    penyelesaianKonsinyasi:[],
    ...overrides,
  })
  if (!result.success) throw new Error(`Gagal submit laporan: ${result.error}`)
  return result.data
}

async function editLaporan(sesiId, overrides = {}, alasan = "test edit") {
  return editLaporanSore(sesiId, {
    tanggal:               TEST_DATE,
    sales_id:              testSales.id,
    penjualan:             [],
    setoran:               [],
    barangKembali:         [],
    konsinyasiBaru:        [],
    tukarBaru:             [],
    returFromTukar:        null,
    penyelesaianTukar:     [],
    penyelesaianKonsinyasi:[],
    ...overrides,
  }, alasan)
}

// ─── TESTS ────────────────────────────────────────────────────────────────────

describe("editLaporanSore — penjualan langsung", () => {
  it("berhasil edit qty penjualan — data ter-update, status tetap selesai", async () => {
    const sesi = await buatSesiAktif(5)
    await submitLaporan(sesi.id, {
      penjualan: [{ rokok_id: testRokok.id, kategori: "grosir", qty: 2 }],
    })

    const result = await editLaporan(sesi.id, {
      penjualan: [{ rokok_id: testRokok.id, kategori: "grosir", qty: 5 }],
    })

    expect(result.success).toBe(true)
    expect(result.data.status).toBe("selesai")
    expect(result.data.penjualan[0].qty).toBe(5)
  })

  it("berhasil edit setoran — jumlah dan metode ter-update", async () => {
    const sesi = await buatSesiAktif(5)
    await submitLaporan(sesi.id, {
      penjualan: [{ rokok_id: testRokok.id, kategori: "grosir", qty: 2 }],
      setoran:   [{ metode: "cash", jumlah: 10000 }],
    })

    const result = await editLaporan(sesi.id, {
      penjualan: [{ rokok_id: testRokok.id, kategori: "grosir", qty: 2 }],
      setoran:   [{ metode: "transfer", jumlah: 25000 }],
    })

    expect(result.success).toBe(true)
    expect(result.data.setoran[0].metode).toBe("transfer")
    expect(result.data.setoran[0].jumlah).toBe(25000)
  })

  it("berhasil hapus semua penjualan — laporan jadi kosong", async () => {
    const sesi = await buatSesiAktif(5)
    await submitLaporan(sesi.id, {
      penjualan: [{ rokok_id: testRokok.id, kategori: "grosir", qty: 3 }],
    })

    const result = await editLaporan(sesi.id, { penjualan: [] })

    expect(result.success).toBe(true)
    expect(result.data.penjualan).toHaveLength(0)
    expect(result.data.nilaiPenjualan).toBe(0)
  })
})

describe("editLaporanSore — barang kembali (stok)", () => {
  it("edit tambah barang kembali — stok bertambah sesuai selisih", async () => {
    const sesi = await buatSesiAktif(5)
    await submitLaporan(sesi.id, {
      barangKembali: [{ rokok_id: testRokok.id, qty: 1 }],
    })
    const stokSetelahSubmit = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok

    // Edit: naikkan kembali dari 1 → 3
    const result = await editLaporan(sesi.id, {
      barangKembali: [{ rokok_id: testRokok.id, qty: 3 }],
    })

    expect(result.success).toBe(true)
    expect(result.data.barangKembali[0].qty).toBe(3)

    // Stok bertambah 2 lagi (3-1=2 selisih kembali)
    const stokSesudah = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok
    expect(stokSesudah).toBe(stokSetelahSubmit + 2)
  })

  it("edit hapus barang kembali — stok kembali ke kondisi setelah barang keluar", async () => {
    const stokAwal = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok
    const sesi = await buatSesiAktif(5)
    await submitLaporan(sesi.id, {
      barangKembali: [{ rokok_id: testRokok.id, qty: 2 }],
    })
    // Stok = awal - 5 (keluar) + 2 (kembali) = awal - 3
    const stokSetelahSubmit = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok
    expect(stokSetelahSubmit).toBe(stokAwal - 3)

    // Edit: hapus barang kembali
    await editLaporan(sesi.id, { barangKembali: [] })

    // Stok = awal - 5 (keluar), revert kembali
    const stokSesudahEdit = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok
    expect(stokSesudahEdit).toBe(stokAwal - 5)
  })

  it("edit kurangi barang kembali — stok berkurang sesuai selisih", async () => {
    const sesi = await buatSesiAktif(5)
    await submitLaporan(sesi.id, {
      barangKembali: [{ rokok_id: testRokok.id, qty: 4 }],
    })
    const stokSetelahSubmit = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok

    // Edit: turunkan kembali dari 4 → 2
    await editLaporan(sesi.id, {
      barangKembali: [{ rokok_id: testRokok.id, qty: 2 }],
    })

    const stokSesudah = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok
    expect(stokSesudah).toBe(stokSetelahSubmit - 2)
  })
})

describe("editLaporanSore — tukar barang", () => {
  it("edit tambah tukar barang baru — stok masuk bertambah", async () => {
    const sesi = await buatSesiAktif(5)
    await submitLaporan(sesi.id)
    const stokSetelahSubmit = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok

    const result = await editLaporan(sesi.id, {
      tukarBaru: [{
        kategori:        "grosir",
        catatan:         "edit tambah tukar",
        itemsMasuk:      [{ rokok_id: testRokok.id, qty: 3, harga_satuan: 5000 }],
        itemsKeluar:     [],
        langsungSelesai: false,
      }],
    })

    expect(result.success).toBe(true)
    expect(result.data.tukarBarang).toHaveLength(1)
    expect(result.data.tukarBarang[0].status).toBe("aktif")

    // itemsMasuk dari toko → stok gudang bertambah
    const stokSesudah = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok
    expect(stokSesudah).toBe(stokSetelahSubmit + 3)
  })

  it("edit ganti tukar barang — tukar lama di-revert, tukar baru diterapkan", async () => {
    const sesi = await buatSesiAktif(5)
    // Submit dengan tukar masuk qty 2
    await submitLaporan(sesi.id, {
      tukarBaru: [{
        kategori:        "grosir",
        itemsMasuk:      [{ rokok_id: testRokok.id, qty: 2, harga_satuan: 5000 }],
        itemsKeluar:     [],
        langsungSelesai: false,
      }],
    })
    const stokSetelahSubmit = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok

    // Edit: hapus tukar lama (tidak ada tukarBaru baru) → stok revert -2
    const result = await editLaporan(sesi.id, { tukarBaru: [] })

    expect(result.success).toBe(true)
    expect(result.data.tukarBarang).toHaveLength(0)

    const stokSesudah = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok
    expect(stokSesudah).toBe(stokSetelahSubmit - 2)
  })
})

describe("editLaporanSore — retur", () => {
  it("edit tambah retur — stok bertambah", async () => {
    const sesi = await buatSesiAktif(5)
    await submitLaporan(sesi.id)
    const stokSetelahSubmit = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok

    const result = await editLaporan(sesi.id, {
      returFromTukar: {
        alasan: "barang rusak",
        items:  [{ rokok_id: testRokok.id, qty: 2 }],
      },
    })

    expect(result.success).toBe(true)
    expect(result.data.returDiSesi).toHaveLength(1)
    expect(result.data.returDiSesi[0].items[0].qty).toBe(2)

    const stokSesudah = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok
    expect(stokSesudah).toBe(stokSetelahSubmit + 2)
  })

  it("edit hapus retur — stok kembali berkurang (revert retur)", async () => {
    const sesi = await buatSesiAktif(5)
    await submitLaporan(sesi.id, {
      returFromTukar: {
        alasan: "barang rusak",
        items:  [{ rokok_id: testRokok.id, qty: 2 }],
      },
    })
    const stokSetelahSubmit = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok

    // Edit: hilangkan retur
    await editLaporan(sesi.id, { returFromTukar: null })

    const stokSesudah = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok
    expect(stokSesudah).toBe(stokSetelahSubmit - 2)
  })

  it("edit ubah qty retur — stok disesuaikan dengan selisih", async () => {
    const sesi = await buatSesiAktif(5)
    await submitLaporan(sesi.id, {
      returFromTukar: {
        alasan: "barang rusak",
        items:  [{ rokok_id: testRokok.id, qty: 1 }],
      },
    })
    const stokSetelahSubmit = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok

    // Edit: naikkan retur dari 1 → 3
    await editLaporan(sesi.id, {
      returFromTukar: {
        alasan: "barang rusak (edit)",
        items:  [{ rokok_id: testRokok.id, qty: 3 }],
      },
    })

    const stokSesudah = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok
    expect(stokSesudah).toBe(stokSetelahSubmit + 2) // selisih 3-1=2
  })
})

describe("editLaporanSore — konsinyasi", () => {
  it("edit tambah konsinyasi baru — konsinyasi tercatat, stok tidak berubah", async () => {
    const sesi = await buatSesiAktif(10)
    await submitLaporan(sesi.id)
    const stokSetelahSubmit = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok

    const result = await editLaporan(sesi.id, {
      konsinyasiBaru: [{
        toko_id:             testToko.id,
        kategori:            "toko",
        tanggal_jatuh_tempo: TEST_DATE_JT,
        catatan:             null,
        items: [{ rokok_id: testRokok.id, qty: 3 }],
      }],
    })

    expect(result.success).toBe(true)
    expect(result.data.konsinyasi).toHaveLength(1)
    expect(result.data.konsinyasi[0].items[0].qty_keluar).toBe(3)

    // Konsinyasi tidak mengubah stok (physical movement model)
    const stokSesudah = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok
    expect(stokSesudah).toBe(stokSetelahSubmit)
  })

  it("edit hapus konsinyasi lama dan ganti dengan yang baru", async () => {
    const sesi = await buatSesiAktif(10)
    await submitLaporan(sesi.id, {
      konsinyasiBaru: [{
        toko_id:             testToko.id,
        kategori:            "toko",
        tanggal_jatuh_tempo: TEST_DATE_JT,
        catatan:             "batch lama",
        items: [{ rokok_id: testRokok.id, qty: 3 }],
      }],
    })

    // Edit: ganti dengan konsinyasi qty 5
    const result = await editLaporan(sesi.id, {
      konsinyasiBaru: [{
        toko_id:             testToko.id,
        kategori:            "toko",
        tanggal_jatuh_tempo: TEST_DATE_JT,
        catatan:             "batch baru",
        items: [{ rokok_id: testRokok.id, qty: 5 }],
      }],
    })

    expect(result.success).toBe(true)
    expect(result.data.konsinyasi).toHaveLength(1)
    expect(result.data.konsinyasi[0].items[0].qty_keluar).toBe(5)
  })
})

describe("editLaporanSore — kombinasi", () => {
  it("edit semua sekaligus: penjualan + kembali + retur — stok akhir konsisten", async () => {
    const stokAwal = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok
    const sesi = await buatSesiAktif(10)

    // Submit: jual 3, kembali 2, retur 1 → net stok: awal -10 +2 +1 = awal -7
    await submitLaporan(sesi.id, {
      penjualan:     [{ rokok_id: testRokok.id, kategori: "grosir", qty: 3 }],
      barangKembali: [{ rokok_id: testRokok.id, qty: 2 }],
      returFromTukar: { alasan: "rusak", items: [{ rokok_id: testRokok.id, qty: 1 }] },
    })
    expect((await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok).toBe(stokAwal - 7)

    // Edit: jual 5, kembali 1, retur 2 → net stok: awal -10 +1 +2 = awal -7 (sama!)
    const result = await editLaporan(sesi.id, {
      penjualan:     [{ rokok_id: testRokok.id, kategori: "grosir", qty: 5 }],
      barangKembali: [{ rokok_id: testRokok.id, qty: 1 }],
      returFromTukar: { alasan: "rusak (edit)", items: [{ rokok_id: testRokok.id, qty: 2 }] },
    })

    expect(result.success).toBe(true)
    expect(result.data.penjualan[0].qty).toBe(5)
    expect(result.data.barangKembali[0].qty).toBe(1)
    expect(result.data.returDiSesi[0].items[0].qty).toBe(2)

    // Net stok: -10 keluar, +1 kembali, +2 retur = -7 (sama dengan sebelum edit)
    const stokAkhir = (await prisma.rokok.findUnique({ where: { id: testRokok.id } })).stok
    expect(stokAkhir).toBe(stokAwal - 7)
  })

  it("gagal jika sesi tidak ditemukan", async () => {
    const result = await editLaporanSore("id-tidak-ada", {
      tanggal: TEST_DATE, sales_id: testSales.id,
      penjualan: [], setoran: [], barangKembali: [],
      konsinyasiBaru: [], tukarBaru: [], returFromTukar: null,
      penyelesaianTukar: [], penyelesaianKonsinyasi: [],
    }, "test")
    expect(result.success).toBe(false)
  })
})
