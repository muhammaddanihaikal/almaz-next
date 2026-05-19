import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest"
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
  createSampleHarian,
  updateSampleHarian,
  closeSampleHarian,
  deleteSampleHarian,
  getSampleHarianList,
  updateSampleHarianReport,
} = await import("@/actions/sample-harian")

import { getJakartaToday } from "@/lib/utils"
let TEST_DATE = null

let testRokok = null
let createdId   = null

beforeAll(async () => {
  // Find a past date that does not exist in the database yet
  let d = new Date()
  let found = false
  while (!found) {
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const candidate = `${yyyy}-${mm}-${dd}`
    
    const existing = await prisma.sampleHarian.findFirst({
      where: { tanggal: new Date(candidate) }
    })
    if (!existing) {
      TEST_DATE = candidate
      found = true
    } else {
      d.setDate(d.getDate() - 1)
    }
  }

  testRokok = await prisma.rokok.findFirst({
    where: { aktif: true },
    orderBy: { urutan: "asc" },
  })
  if (!testRokok) {
    testRokok = await prisma.rokok.create({
      data: {
        nama: "Test Rokok",
        aktif: true,
        stok: 100,
        stok_sample_biasa: 50,
        stok_sample_cukai: 50,
        harga_grosir: 10000,
        harga_toko: 11000,
        harga_perorangan: 12000,
        urutan: 1,
      }
    })
  } else {
    testRokok = await prisma.rokok.update({
      where: { id: testRokok.id },
      data: {
        stok_sample_biasa: 50,
        stok_sample_cukai: 50,
      }
    })
  }
})

afterEach(async () => {
  // Hapus sisa test data termasuk revert stok
  if (createdId) {
    const sh = await prisma.sampleHarian.findUnique({
      where: { id: createdId },
      include: { items: true },
    })
    if (sh) {
      // Revert mutations yang dibuat oleh test
      const mutations = await prisma.stockMutation.findMany({
        where: { reference_id: createdId },
      })
      await prisma.$transaction(async (tx) => {
        for (const m of mutations) {
          const field = m.stock_type === "sample_biasa" ? "stok_sample_biasa"
                      : m.stock_type === "sample_cukai" ? "stok_sample_cukai"
                      : "stok"
          await tx.rokok.update({
            where: { id: m.rokok_id },
            data: { [field]: m.jenis === "out" ? { increment: m.qty } : { decrement: m.qty } },
          })
        }
        await tx.stockMutation.deleteMany({ where: { reference_id: createdId } })
        await tx.sampleHarian.delete({ where: { id: createdId } })
      })
    }
    createdId = null
  }
  // Bersihkan sisa data dengan tanggal test
  const stale = await prisma.sampleHarian.findMany({
    where: { tanggal: new Date(TEST_DATE) },
    include: { items: true },
  })
  for (const sh of stale) {
    const muts = await prisma.stockMutation.findMany({ where: { reference_id: sh.id } })
    await prisma.$transaction(async (tx) => {
      for (const m of muts) {
        const field = m.stock_type === "sample_biasa" ? "stok_sample_biasa"
                    : m.stock_type === "sample_cukai" ? "stok_sample_cukai"
                    : "stok"
        await tx.rokok.update({
          where: { id: m.rokok_id },
          data: { [field]: m.jenis === "out" ? { increment: m.qty } : { decrement: m.qty } },
        })
      }
      await tx.stockMutation.deleteMany({ where: { reference_id: sh.id } })
      await tx.sampleHarian.delete({ where: { id: sh.id } })
    })
  }
})

afterAll(async () => {
  await prisma.$disconnect()
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function freshRokok() {
  return prisma.rokok.findUnique({ where: { id: testRokok.id } })
}

async function buatSesi(qtyKeluar = 2, type = "biasa") {
  await createSampleHarian(TEST_DATE, [{ rokok_id: testRokok.id, type, qty_keluar: qtyKeluar }], null)
  const sh = await prisma.sampleHarian.findFirst({
    where: { tanggal: new Date(TEST_DATE) },
    orderBy: { createdAt: "desc" },
  })
  createdId = sh.id
  return sh
}

// ─── createSampleHarian ───────────────────────────────────────────────────────

describe("createSampleHarian", () => {
  it("mengurangi stok_sample_biasa sesuai qty_keluar", async () => {
    const before = await freshRokok()
    const qty = 2

    await buatSesi(qty)

    const after = await freshRokok()
    expect(after.stok_sample_biasa).toBe(before.stok_sample_biasa - qty)
  })

  it("stok reguler tidak berubah saat sample harian dibuat", async () => {
    const before = await freshRokok()

    await buatSesi(2)

    const after = await freshRokok()
    expect(after.stok).toBe(before.stok)
  })

  it("membuat StockMutation out stock_type=sample_biasa", async () => {
    const qty = 3
    const beforeCount = await prisma.stockMutation.count({
      where: { rokok_id: testRokok.id, source: "sample_harian_keluar" },
    })

    await buatSesi(qty)

    const afterCount = await prisma.stockMutation.count({
      where: { rokok_id: testRokok.id, source: "sample_harian_keluar" },
    })
    expect(afterCount).toBe(beforeCount + 1)

    const mutation = await prisma.stockMutation.findFirst({
      where: { rokok_id: testRokok.id, source: "sample_harian_keluar" },
      orderBy: { createdAt: "desc" },
    })
    expect(mutation.jenis).toBe("out")
    expect(mutation.qty).toBe(qty)
    expect(mutation.stock_type).toBe("sample_biasa")
  })

  it("status awal adalah 'buka'", async () => {
    const sh = await buatSesi(1)
    expect(sh.status).toBe("buka")
  })

  it("SampleHarianItem tersimpan dengan qty_keluar dan qty_kembali=0", async () => {
    const qty = 2
    const sh = await buatSesi(qty)

    const items = await prisma.sampleHarianItem.findMany({ where: { sample_harian_id: sh.id } })
    expect(items).toHaveLength(1)
    expect(items[0].qty_keluar).toBe(qty)
    expect(items[0].qty_kembali).toBe(0)
    expect(items[0].rokok_id).toBe(testRokok.id)
  })

  it("gagal jika stok_sample_biasa tidak cukup", async () => {
    const current = await freshRokok()
    const tooMany = current.stok_sample_biasa + 9999

    await expect(
      createSampleHarian(TEST_DATE, [{ rokok_id: testRokok.id, qty_keluar: tooMany }], null)
    ).rejects.toThrow(/stok sample biasa/i)
  })

  it("gagal jika tidak ada item dengan qty > 0", async () => {
    await expect(
      createSampleHarian(TEST_DATE, [{ rokok_id: testRokok.id, qty_keluar: 0 }], null)
    ).rejects.toThrow(/minimal satu produk/i)
  })

  it("gagal jika tanggal sudah memiliki sesi", async () => {
    await buatSesi(1)
    
    await expect(
      createSampleHarian(TEST_DATE, [{ rokok_id: testRokok.id, type: "biasa", qty_keluar: 1 }], null)
    ).rejects.toThrow(/sudah ada/i)
  })

  it("gagal jika tanggal adalah besok", async () => {
    const today = getJakartaToday()
    const parts = today.split("-")
    const d = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])))
    d.setUTCDate(d.getUTCDate() + 1)
    const tomorrowStr = d.toISOString().split("T")[0]
    
    await expect(
      createSampleHarian(tomorrowStr, [{ rokok_id: testRokok.id, type: "biasa", qty_keluar: 1 }], null)
    ).rejects.toThrow(/tidak dapat membuat sesi/i)
  })

  it("stok 9 dikurangi 2 menjadi 7", async () => {
    // Setup: pastikan stok_sample_biasa = 9
    await prisma.rokok.update({
      where: { id: testRokok.id },
      data: { stok_sample_biasa: 9 },
    })

    await createSampleHarian(TEST_DATE, [{ rokok_id: testRokok.id, qty_keluar: 2 }], null)
    const sh = await prisma.sampleHarian.findFirst({
      where: { tanggal: new Date(TEST_DATE) },
      orderBy: { createdAt: "desc" },
    })
    createdId = sh.id

    const after = await freshRokok()
    expect(after.stok_sample_biasa).toBe(7)
  })
})

// ─── closeSampleHarian ────────────────────────────────────────────────────────

describe("closeSampleHarian", () => {
  it("menambah stok_sample_biasa sesuai qty_kembali", async () => {
    const sh = await buatSesi(3)
    const afterKeluar = await freshRokok()

    await closeSampleHarian(sh.id, [{ rokok_id: testRokok.id, qty_kembali: 2 }])

    const afterKembali = await freshRokok()
    expect(afterKembali.stok_sample_biasa).toBe(afterKeluar.stok_sample_biasa + 2)
  })

  it("status berubah menjadi 'selesai'", async () => {
    const sh = await buatSesi(2)

    await closeSampleHarian(sh.id, [{ rokok_id: testRokok.id, qty_kembali: 1 }])

    const updated = await prisma.sampleHarian.findUnique({ where: { id: sh.id } })
    expect(updated.status).toBe("selesai")
  })

  it("SampleHarianItem.qty_kembali tersimpan di DB", async () => {
    const sh = await buatSesi(3)
    const qtyKembali = 2

    await closeSampleHarian(sh.id, [{ rokok_id: testRokok.id, qty_kembali: qtyKembali }])

    const item = await prisma.sampleHarianItem.findFirst({ where: { sample_harian_id: sh.id } })
    expect(item.qty_kembali).toBe(qtyKembali)
  })

  it("selisih keluar-kembali = sample terpakai (stok tidak kembali seluruhnya)", async () => {
    const qtyKeluar  = 5
    const qtyKembali = 3
    const terpakai   = qtyKeluar - qtyKembali

    const sh = await buatSesi(qtyKeluar)
    const afterKeluar = await freshRokok()

    await closeSampleHarian(sh.id, [{ rokok_id: testRokok.id, qty_kembali: qtyKembali }])

    const afterKembali = await freshRokok()
    // Stok hanya bertambah sebesar yang kembali, bukan seluruh keluar
    expect(afterKembali.stok_sample_biasa).toBe(afterKeluar.stok_sample_biasa + qtyKembali)
    // Selisih = terpakai (hilang/dibagi ke toko)
    expect(afterKeluar.stok_sample_biasa + qtyKembali).not.toBe(
      afterKeluar.stok_sample_biasa + qtyKeluar
    )
  })

  it("membuat StockMutation in stock_type=sample_biasa saat kembali", async () => {
    const sh = await buatSesi(3)
    const beforeCount = await prisma.stockMutation.count({
      where: { rokok_id: testRokok.id, source: "sample_harian_kembali" },
    })

    await closeSampleHarian(sh.id, [{ rokok_id: testRokok.id, qty_kembali: 2 }])

    const afterCount = await prisma.stockMutation.count({
      where: { rokok_id: testRokok.id, source: "sample_harian_kembali" },
    })
    expect(afterCount).toBe(beforeCount + 1)

    const mutation = await prisma.stockMutation.findFirst({
      where: { rokok_id: testRokok.id, source: "sample_harian_kembali" },
      orderBy: { createdAt: "desc" },
    })
    expect(mutation.jenis).toBe("in")
    expect(mutation.qty).toBe(2)
    expect(mutation.stock_type).toBe("sample_biasa")
  })

  it("tidak membuat StockMutation jika qty_kembali = 0", async () => {
    const sh = await buatSesi(2)
    const beforeCount = await prisma.stockMutation.count({
      where: { rokok_id: testRokok.id, source: "sample_harian_kembali" },
    })

    await closeSampleHarian(sh.id, [{ rokok_id: testRokok.id, qty_kembali: 0 }])

    const afterCount = await prisma.stockMutation.count({
      where: { rokok_id: testRokok.id, source: "sample_harian_kembali" },
    })
    expect(afterCount).toBe(beforeCount)
  })

  it("gagal jika sesi sudah selesai", async () => {
    const sh = await buatSesi(2)
    await closeSampleHarian(sh.id, [{ rokok_id: testRokok.id, qty_kembali: 1 }])

    await expect(
      closeSampleHarian(sh.id, [{ rokok_id: testRokok.id, qty_kembali: 1 }])
    ).rejects.toThrow(/sudah ditutup/i)
  })

  it("gagal jika qty_kembali melebihi qty_keluar", async () => {
    const sh = await buatSesi(2)

    await expect(
      closeSampleHarian(sh.id, [{ rokok_id: testRokok.id, qty_kembali: 99 }])
    ).rejects.toThrow(/melebihi qty keluar/i)
  })

  it("stok reguler tidak berubah saat tutup sesi", async () => {
    const sh = await buatSesi(2)
    const before = await freshRokok()

    await closeSampleHarian(sh.id, [{ rokok_id: testRokok.id, qty_kembali: 1 }])

    const after = await freshRokok()
    // stok reguler (jual) tidak berubah akibat sample harian
    expect(after.stok).toBe(before.stok)
  })
})

// ─── deleteSampleHarian ───────────────────────────────────────────────────────

describe("deleteSampleHarian", () => {
  it("mengembalikan stok_sample_biasa net saat dihapus (belum tutup)", async () => {
    const qtyKeluar = 3
    const before = await freshRokok()

    const sh = await buatSesi(qtyKeluar)
    const afterKeluar = await freshRokok()
    expect(afterKeluar.stok_sample_biasa).toBe(before.stok_sample_biasa - qtyKeluar)

    await deleteSampleHarian(sh.id, "test cleanup")
    createdId = null

    const afterDelete = await freshRokok()
    expect(afterDelete.stok_sample_biasa).toBe(before.stok_sample_biasa)
  })

  it("mengembalikan stok net (keluar - kembali) saat dihapus setelah tutup", async () => {
    const qtyKeluar  = 4
    const qtyKembali = 2
    const netTerpakai = qtyKeluar - qtyKembali
    const before = await freshRokok()

    const sh = await buatSesi(qtyKeluar)
    await closeSampleHarian(sh.id, [{ rokok_id: testRokok.id, qty_kembali: qtyKembali }])

    const afterClose = await freshRokok()
    // Stok saat ini: before - qtyKeluar + qtyKembali = before - netTerpakai
    expect(afterClose.stok_sample_biasa).toBe(before.stok_sample_biasa - netTerpakai)

    await deleteSampleHarian(sh.id, "test cleanup setelah tutup")
    createdId = null

    const afterDelete = await freshRokok()
    // Revert hanya net yang belum kembali: before - netTerpakai + netTerpakai = before
    // Tapi deleteSampleHarian hanya revert net (keluar - kembali), bukan mengembalikan yang sudah kembali
    // Jadi stok setelah delete = afterClose + netTerpakai = before
    expect(afterDelete.stok_sample_biasa).toBe(before.stok_sample_biasa)
  })

  it("record SampleHarian terhapus dari DB", async () => {
    const sh = await buatSesi(1)

    await deleteSampleHarian(sh.id, "test hapus")
    createdId = null

    const deleted = await prisma.sampleHarian.findUnique({ where: { id: sh.id } })
    expect(deleted).toBeNull()
  })
})

// ─── getSampleHarianList ──────────────────────────────────────────────────────

describe("getSampleHarianList", () => {
  it("mengembalikan list yang menyertakan items dan nama rokok", async () => {
    await buatSesi(1)

    const list = await getSampleHarianList()
    const found = list.find((sh) => sh.id === createdId)

    expect(found).toBeDefined()
    expect(found.items).toHaveLength(1)
    expect(found.items[0].rokok).toBeDefined()
    expect(typeof found.items[0].rokok).toBe("string")
    expect(found.status).toBe("buka")
  })
})

// ─── updateSampleHarian ───────────────────────────────────────────────────────

describe("updateSampleHarian", () => {
  it("mengubah tanggal dan catatan", async () => {
    const sh = await buatSesi(2)
    const NEW_DATE = "2025-01-01"
    
    await updateSampleHarian(sh.id, NEW_DATE, [{ rokok_id: testRokok.id, type: "biasa", qty_keluar: 3 }], "Catatan baru")
    
    const updated = await prisma.sampleHarian.findUnique({
      where: { id: sh.id },
      include: { items: true }
    })
    
    expect(updated.tanggal.toISOString().split("T")[0]).toBe(NEW_DATE)
    expect(updated.catatan).toBe("Catatan baru")
    expect(updated.items[0].qty_keluar).toBe(3)
  })

  it("gagal jika tanggal update adalah besok", async () => {
    const sh = await buatSesi(2)
    const today = getJakartaToday()
    const parts = today.split("-")
    const d = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])))
    d.setUTCDate(d.getUTCDate() + 1)
    const tomorrowStr = d.toISOString().split("T")[0]

    await expect(
      updateSampleHarian(sh.id, tomorrowStr, [{ rokok_id: testRokok.id, type: "biasa", qty_keluar: 2 }], null)
    ).rejects.toThrow(/tidak dapat mengubah tanggal sesi/i)
  })

  it("gagal jika tanggal update sudah memiliki sesi lain", async () => {
    let otherDateStr = null
    let tempDate = new Date()
    tempDate.setDate(tempDate.getDate() - 10)
    while (!otherDateStr) {
      const yyyy = tempDate.getFullYear()
      const mm = String(tempDate.getMonth() + 1).padStart(2, '0')
      const dd = String(tempDate.getDate()).padStart(2, '0')
      const candidate = `${yyyy}-${mm}-${dd}`
      if (candidate !== TEST_DATE) {
        const existing = await prisma.sampleHarian.findFirst({
          where: { tanggal: new Date(candidate) }
        })
        if (!existing) {
          otherDateStr = candidate
        }
      }
      tempDate.setDate(tempDate.getDate() - 1)
    }
    
    const otherSesi = await prisma.sampleHarian.create({
      data: {
        tanggal: new Date(otherDateStr),
        status: "buka",
        catatan: "Sesi lain",
        items: {
          create: [{ rokok_id: testRokok.id, type: "biasa", qty_keluar: 1, qty_kembali: 0 }]
        }
      }
    })
    
    const mainSesi = await buatSesi(1)
    
    try {
      await expect(
        updateSampleHarian(mainSesi.id, otherDateStr, [{ rokok_id: testRokok.id, type: "biasa", qty_keluar: 1 }], null)
      ).rejects.toThrow(/sudah ada/i)
    } finally {
      await prisma.sampleHarian.delete({ where: { id: otherSesi.id } })
    }
  })

  it("gagal jika stok baru tidak mencukupi", async () => {
    const sh = await buatSesi(2)
    const current = await freshRokok()
    const tooMany = current.stok_sample_biasa + 9999

    await expect(
      updateSampleHarian(sh.id, TEST_DATE, [{ rokok_id: testRokok.id, type: "biasa", qty_keluar: tooMany }], null)
    ).rejects.toThrow(/tidak cukup/i)
  })

  it("berhasil update stok biasa ketika sesi berstatus selesai", async () => {
    const sh = await buatSesi(4) // keluar 4
    await closeSampleHarian(sh.id, [{ rokok_id: testRokok.id, type: "biasa", qty_kembali: 2 }]) // kembali 2, terpakai 2.
    
    const beforeUpdate = await freshRokok()
    
    // Update qty_keluar ke 5 (stok yang dialokasikan harusnya disesuaikan)
    await updateSampleHarian(sh.id, TEST_DATE, [{ rokok_id: testRokok.id, type: "biasa", qty_keluar: 5 }], null)
    
    const afterUpdate = await freshRokok()
    
    // Sebelum update, terpakai = 2. Setelah update, keluar = 5, kembali = 2, terpakai = 3.
    // Jadi stok harusnya berkurang 1 lagi dibanding beforeUpdate.
    expect(afterUpdate.stok_sample_biasa).toBe(beforeUpdate.stok_sample_biasa - 1)
    
    const updated = await prisma.sampleHarian.findUnique({
      where: { id: sh.id },
      include: { items: true }
    })
    expect(updated.items[0].qty_keluar).toBe(5)
    expect(updated.items[0].qty_kembali).toBe(2)
  })
})

// ─── updateSampleHarianReport ──────────────────────────────────────────────────

describe("updateSampleHarianReport", () => {
  it("berhasil mengubah qty_kembali dan menyesuaikan stok", async () => {
    const sh = await buatSesi(4) // keluar 4
    await closeSampleHarian(sh.id, [{ rokok_id: testRokok.id, qty_kembali: 1 }]) // kembali 1, terpakai 3.
    
    const beforeUpdate = await freshRokok()
    
    // Ubah qty kembali dari 1 menjadi 3
    await updateSampleHarianReport(sh.id, [{ rokok_id: testRokok.id, qty_kembali: 3 }])
    
    const afterUpdate = await freshRokok()
    // Karena qty_kembali bertambah dari 1 menjadi 3, maka stok sample biasa harus bertambah 2
    expect(afterUpdate.stok_sample_biasa).toBe(beforeUpdate.stok_sample_biasa + 2)
    
    const item = await prisma.sampleHarianItem.findFirst({ where: { sample_harian_id: sh.id } })
    expect(item.qty_kembali).toBe(3)
  })

  it("gagal jika qty_kembali melebihi qty_keluar", async () => {
    const sh = await buatSesi(2)
    await closeSampleHarian(sh.id, [{ rokok_id: testRokok.id, qty_kembali: 1 }])
    
    await expect(
      updateSampleHarianReport(sh.id, [{ rokok_id: testRokok.id, qty_kembali: 5 }])
    ).rejects.toThrow(/qty kembali tidak boleh melebihi/i)
  })

  it("gagal jika sesi belum selesai", async () => {
    const sh = await buatSesi(2)
    
    await expect(
      updateSampleHarianReport(sh.id, [{ rokok_id: testRokok.id, qty_kembali: 1 }])
    ).rejects.toThrow(/belum selesai/i)
  })
})


