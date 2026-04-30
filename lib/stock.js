import { prisma } from "@/lib/db";

// ─── KONSTANTA SOURCE (Standar) ────────────────────────────────────────────────
// Gunakan salah satu source berikut saat memanggil mutateStock()
export const MUTATION_SOURCE = {
  // Stok masuk dari supplier / pengadaan
  STOK_AWAL:   "stok_awal",
  SUPPLIER:    "supplier",
  // Koreksi manual oleh admin
  KOREKSI:     "koreksi",
  ADJUSTMENT:  "adjustment",
  // Distribusi harian
  DISTRIBUSI:  "distribusi_sales",
  RETUR_SALES: "retur_sales",
  // Titip Jual / Konsinyasi
  KONSINYASI_KELUAR:  "konsinyasi_keluar",
  KONSINYASI_KEMBALI: "konsinyasi_kembali",
  // Penjualan Langsung
  PENJUALAN:          "penjualan",
  PENJUALAN_SAMPLE:   "penjualan_sample",
  // Retur dari toko
  RETUR: "retur",
  // Pembatalan / Revert
  REVERT: "revert",
};

/**
 * Hitung stok aktual untuk rokok tertentu dari ledger.
 * @param {string} rokok_id
 * @param {Date|null} tanggal - Jika diisi, hitung stok hingga tanggal tersebut
 * @param {object} tx - Prisma transaction client (opsional)
 */
export async function getStock(rokok_id, tanggal = null, tx = prisma) {
  const where = { rokok_id };
  if (tanggal) {
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
    if (m.jenis === 'in')  totalIn  += m._sum.qty || 0;
    if (m.jenis === 'out') totalOut += m._sum.qty || 0;
  });

  return totalIn - totalOut;
}

/**
 * Rebuild cache Rokok.stok dari ledger untuk satu rokok.
 */
export async function updateStockCache(rokok_id, tx = prisma) {
  const currentStock = await getStock(rokok_id, null, tx);
  await tx.rokok.update({
    where: { id: rokok_id },
    data: { stok: currentStock }
  });
  return currentStock;
}

/**
 * Mutasi stok: satu-satunya fungsi resmi untuk mengubah stok.
 *
 * @param {object} opts
 * @param {object}  opts.tx           - Prisma transaction client (wajib jika sudah dalam transaction)
 * @param {string}  opts.rokok_id     - ID rokok
 * @param {Date|string} opts.tanggal  - Tanggal mutasi
 * @param {'in'|'out'} opts.jenis     - Jenis mutasi
 * @param {number}  opts.qty          - Jumlah
 * @param {string}  opts.source       - Gunakan konstanta dari MUTATION_SOURCE
 * @param {string}  [opts.reference_id] - ID transaksi sumber (opsional)
 * @param {string}  [opts.keterangan]   - Catatan bebas (opsional)
 * @param {string}  [opts.user_id]      - ID user yang memicu mutasi (opsional)
 * @param {boolean} [opts.allowNegative=false] - Izinkan stok minus (hanya untuk koreksi)
 */
export async function mutateStock({
  tx,
  rokok_id,
  tanggal,
  jenis,
  qty,
  source,
  reference_id    = null,
  keterangan      = null,
  user_id         = null,
  allowNegative   = false,
}) {
  const doWork = async (db) => {
    // 1. Row-level locking: Kunci baris Rokok agar tidak terjadi race condition
    await db.$executeRaw`SELECT 1 FROM "Rokok" WHERE id = ${rokok_id} FOR UPDATE`;

    // 2. Validasi stok tidak minus (untuk mutasi keluar)
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
        tanggal:      new Date(tanggal),
        jenis,
        qty,
        source,
        reference_id,
        keterangan,
        user_id,
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
 * Koreksi stok manual oleh admin.
 * Menambahkan mutasi baru dengan source 'koreksi'.
 * Data lama TIDAK diubah — histori tetap utuh.
 *
 * @param {object} opts
 * @param {string} opts.rokok_id
 * @param {'in'|'out'} opts.jenis
 * @param {number} opts.qty
 * @param {string} opts.keterangan  - Wajib diisi untuk koreksi
 * @param {string} opts.user_id     - Wajib: siapa yang melakukan koreksi
 */
export async function koreksiStok({ rokok_id, jenis, qty, keterangan, user_id }) {
  if (!keterangan) throw new Error("Keterangan wajib diisi untuk koreksi stok.");
  if (!user_id)    throw new Error("User harus teridentifikasi untuk melakukan koreksi stok.");

  await mutateStock({
    rokok_id,
    tanggal:    new Date(),
    jenis,
    qty,
    source:     MUTATION_SOURCE.KOREKSI,
    keterangan,
    user_id,
    allowNegative: jenis === 'out', // Koreksi keluar boleh minus (untuk penyesuaian)
  });
}

/**
 * Utility untuk rebuild ulang seluruh field Rokok.stok dari StockMutation.
 * Jalankan jika ada indikasi mismatch antara cache dan ledger.
 */
export async function rebuildAllStockCache() {
  await prisma.$transaction(async (tx) => {
    const allRokok = await tx.rokok.findMany({ select: { id: true } });
    for (const r of allRokok) {
      await tx.$executeRaw`SELECT 1 FROM "Rokok" WHERE id = ${r.id} FOR UPDATE`;
      await updateStockCache(r.id, tx);
    }
  });
}

/**
 * Validasi: apakah mutasi ini boleh dimodifikasi/dihapus?
 * Aturan: data dengan tanggal di hari SEBELUM hari ini tidak boleh dihapus/edit.
 * Untuk koreksi, tambahkan mutasi baru dengan source 'koreksi'.
 */
export function assertMutasiEditable(tanggal) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tgl = new Date(tanggal);
  tgl.setHours(0, 0, 0, 0);
  if (tgl < today) {
    throw new Error(
      "Data mutasi stok dari hari sebelumnya tidak dapat diubah. " +
      "Gunakan fitur koreksi untuk menyesuaikan stok."
    );
  }
}
