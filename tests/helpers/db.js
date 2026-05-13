import { prisma } from "@/lib/db"

const TEST_SALES_NAMA = "__TEST_SALES__"
const TEST_TOKO_NAMA  = "__TEST_TOKO__"

/**
 * Ambil atau buat fixtures test: sales, toko, rokok.
 * Rokok tidak dibuat — pakai yang sudah ada di DB dev.
 */
export async function seedTestData() {
  const sales = await prisma.sales.upsert({
    where: { nama: TEST_SALES_NAMA },
    update: {},
    create: { nama: TEST_SALES_NAMA, kategori: "grosir", aktif: true },
  })

  const toko = await prisma.toko.upsert({
    where: { nama: TEST_TOKO_NAMA },
    update: {},
    create: { nama: TEST_TOKO_NAMA, kategori: "toko", aktif: true },
  })

  const rokok = await prisma.rokok.findFirst({
    where: { aktif: true, stok: { gt: 10 } },
    orderBy: { urutan: "asc" },
  })

  if (!rokok) throw new Error("Tidak ada rokok dengan stok > 10 di DB. Tambahkan stok dulu sebelum test.")

  return { sales, toko, rokok }
}

/**
 * Cleanup lengkap satu sesi beserta semua efek stok-nya.
 * Menangani: barang keluar/kembali, retur, tukar barang — semuanya di-revert ke stok awal.
 * Gunakan ini sebagai pengganti manual revertStockMutationsByRef + cleanupSesiById.
 */
export async function cleanupSesiWithAllStock(sesiId) {
  if (!sesiId) return

  // 1. Revert stock mutations dengan reference_id = sesiId (barang keluar, barang kembali)
  await revertStockMutationsByRef(sesiId)

  // 2. Revert stock mutations titip jual (KONSINYASI_KELUAR/KEMBALI pakai reference_id = tj.id)
  const titipJualList = await prisma.titipJual.findMany({ where: { sesi_id: sesiId } })
  for (const tj of titipJualList) {
    await revertStockMutationsByRef(tj.id)
  }

  // 3. Temukan semua tukar barang di sesi ini dan revert stock-nya (reference_id = tukar.id)
  const tukarList = await prisma.tukarBarang.findMany({
    where: { OR: [{ sesi_id: sesiId }, { sesi_selesai_id: sesiId }] },
  })
  for (const tukar of tukarList) {
    await revertStockMutationsByRef(tukar.id)
  }

  // 4. Revert stock mutations retur yang dibuat dari sesi ini
  const returList = await prisma.retur.findMany({ where: { sesi_id: sesiId } })
  for (const r of returList) {
    await revertStockMutationsByRef(r.id)
  }

  // 4. Hapus semua record DB
  await cleanupSesiById(sesiId)
}

/**
 * Hapus satu sesi beserta semua relasinya (tanpa revert stok).
 * Dipakai oleh cleanupSesiWithAllStock — biasanya tidak perlu dipanggil langsung.
 */
export async function cleanupSesiById(sesiId) {
  await prisma.$transaction(async (tx) => {
    await tx.auditLog.deleteMany({ where: { entity_id: sesiId } })
    await tx.sesiPenjualan.deleteMany({ where: { sesi_id: sesiId } })
    await tx.sesiSetoran.deleteMany({ where: { sesi_id: sesiId } })
    await tx.sesiBarangKembali.deleteMany({ where: { sesi_id: sesiId } })
    await tx.sesiBarangKeluar.deleteMany({ where: { sesi_id: sesiId } })
    await tx.sesiSample.deleteMany({ where: { sesi_id: sesiId } })

    // Titip jual
    const titipJualList = await tx.titipJual.findMany({ where: { sesi_id: sesiId } })
    for (const tj of titipJualList) {
      await tx.titipJualSetoran.deleteMany({ where: { titip_jual_id: tj.id } })
      await tx.titipJualItem.deleteMany({ where: { titip_jual_id: tj.id } })
    }
    await tx.titipJual.deleteMany({ where: { sesi_id: sesiId } })

    // Retur
    const returList = await tx.retur.findMany({ where: { sesi_id: sesiId } })
    for (const r of returList) {
      await tx.returItem.deleteMany({ where: { retur_id: r.id } })
    }
    await tx.retur.deleteMany({ where: { sesi_id: sesiId } })

    // Tukar barang (items tidak ada onDelete Cascade, hapus manual)
    const tukarList = await tx.tukarBarang.findMany({
      where: { OR: [{ sesi_id: sesiId }, { sesi_selesai_id: sesiId }] },
    })
    for (const t of tukarList) {
      await tx.auditLog.deleteMany({ where: { entity_id: t.id } })
      await tx.tukarBarangItemMasuk.deleteMany({ where: { tukar_id: t.id } })
      await tx.tukarBarangItemKeluar.deleteMany({ where: { tukar_id: t.id } })
    }
    await tx.tukarBarang.deleteMany({
      where: { OR: [{ sesi_id: sesiId }, { sesi_selesai_id: sesiId }] },
    })

    await tx.sesiHarian.deleteMany({ where: { id: sesiId } })
  })
}

/**
 * Revert efek stok satu reference_id dan hapus mutation record-nya.
 */
export async function revertStockMutationsByRef(referenceId) {
  const mutations = await prisma.stockMutation.findMany({
    where: { reference_id: referenceId },
  })
  for (const m of mutations) {
    await prisma.rokok.update({
      where: { id: m.rokok_id },
      data: { stok: m.jenis === "out" ? { increment: m.qty } : { decrement: m.qty } },
    })
  }
  await prisma.stockMutation.deleteMany({ where: { reference_id: referenceId } })
}

export async function cleanupTestSales(salesId) {
  if (!salesId) return
  // Hapus sisa sesi sebelum hapus sales (hindari FK violation)
  const sesiList = await prisma.sesiHarian.findMany({ where: { sales_id: salesId } })
  for (const sesi of sesiList) {
    await cleanupSesiWithAllStock(sesi.id)
  }
  await prisma.sales.deleteMany({ where: { id: salesId } })
}

export async function cleanupTestToko(tokoId) {
  if (!tokoId) return
  // Hapus sisa titip jual yang mungkin tertinggal (FK constraint)
  const titipJualList = await prisma.titipJual.findMany({ where: { toko_id: tokoId } })
  for (const tj of titipJualList) {
    await revertStockMutationsByRef(tj.id)
    await prisma.titipJualSetoran.deleteMany({ where: { titip_jual_id: tj.id } })
    await prisma.titipJualItem.deleteMany({ where: { titip_jual_id: tj.id } })
  }
  await prisma.titipJual.deleteMany({ where: { toko_id: tokoId } })
  await prisma.toko.deleteMany({ where: { id: tokoId } })
}
