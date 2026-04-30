import { prisma } from "@/lib/db";

export async function getStock(rokok_id, tanggal = null, tx = prisma) {
  const where = { rokok_id };
  if (tanggal) {
    // If a date is provided, only calculate stock up to that date
    where.tanggal = { lte: tanggal };
  }

  const mutations = await tx.stockMutation.groupBy({
    by: ['jenis'],
    where,
    _sum: { qty: true }
  });

  let totalIn = 0;
  let totalOut = 0;
  
  mutations.forEach(m => {
    if (m.jenis === 'in') totalIn += m._sum.qty || 0;
    if (m.jenis === 'out') totalOut += m._sum.qty || 0;
  });

  return totalIn - totalOut;
}

export async function updateStockCache(rokok_id, tx = prisma) {
  const currentStock = await getStock(rokok_id, null, tx);
  await tx.rokok.update({
    where: { id: rokok_id },
    data: { stok: currentStock }
  });
  return currentStock;
}

export async function mutateStock({ tx, rokok_id, tanggal, jenis, qty, source, reference_id = null, allowNegative = false }) {
  const doWork = async (db) => {
    // 1. Row-level locking: Lock baris Rokok ini di database selama transaksi berjalan.
    // Ini mencegah race condition (transaksi bersamaan) yang bisa membuat stok minus.
    await db.$executeRaw`SELECT 1 FROM "Rokok" WHERE id = ${rokok_id} FOR UPDATE`;

    // 2. Cek stok (sudah aman dari concurrent update karena ada lock di atas)
    if (jenis === 'out' && !allowNegative) {
      const currentStock = await getStock(rokok_id, null, db);
      if (currentStock - qty < 0) {
        throw new Error(`Stok tidak mencukupi. Sisa stok: ${currentStock}, Mutasi keluar: ${qty}`);
      }
    }

    // 3. Catat ke Ledger
    await db.stockMutation.create({
      data: {
        rokok_id,
        tanggal: new Date(tanggal),
        jenis,
        qty,
        source,
        reference_id
      }
    });

    // 4. Update cache stok di tabel Rokok
    await updateStockCache(rokok_id, db);
  };

  if (tx) {
    await doWork(tx);
  } else {
    await prisma.$transaction(doWork);
  }
}

/**
 * Utility untuk rebuild ulang seluruh field Rokok.stok berdasarkan StockMutation.
 * Bisa dijalankan berkala atau saat ada indikasi mismatch.
 */
export async function rebuildAllStockCache() {
  await prisma.$transaction(async (tx) => {
    const allRokok = await tx.rokok.findMany({ select: { id: true } });
    for (const r of allRokok) {
      // Lock each row sequentially and rebuild
      await tx.$executeRaw`SELECT 1 FROM "Rokok" WHERE id = ${r.id} FOR UPDATE`;
      await updateStockCache(r.id, tx);
    }
  });
}
