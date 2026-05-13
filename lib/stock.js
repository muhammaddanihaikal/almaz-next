import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

function sanitizeUserId(user_id) {
  if (!user_id || user_id === "null" || user_id === "undefined") return null;
  return user_id;
}

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
  // Tukar Barang
  TUKAR_MASUK:  "tukar_masuk",
  TUKAR_KELUAR: "tukar_keluar",
  // Sample Cukai (diambil dari stok reguler)
  SAMPLE_CUKAI_KONVERSI: "sample_cukai_konversi", // stok reguler → sample cukai
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
    const qtyNumber = Number(qty) || 0;
    if (!rokok_id) throw new Error("Rokok tidak valid.");
    if (qtyNumber <= 0) throw new Error("Qty mutasi harus lebih dari 0.");

    // 1. Row-level locking: ambil cache stok saat ini tanpa scan ledger.
    const lockedRows = await db.$queryRaw`
      SELECT "stok" FROM "Rokok" WHERE id = ${rokok_id} FOR UPDATE
    `;
    const lockedRokok = lockedRows?.[0];
    if (!lockedRokok) throw new Error("Rokok tidak ditemukan.");
    const currentStock = Number(lockedRokok.stok) || 0;

    // 2. Validasi stok tidak minus (untuk mutasi keluar)
    if (jenis === 'out' && !allowNegative) {
      if (currentStock - qtyNumber < 0) {
        throw new Error(`Stok tidak mencukupi. Sisa stok: ${currentStock}, Mutasi keluar: ${qtyNumber}`);
      }
    }

    // 3. Catat ke Ledger
    const finalUserId = sanitizeUserId(user_id);

    await db.stockMutation.create({
      data: {
        rokok_id,
        tanggal:      new Date(tanggal),
        jenis,
        qty:          qtyNumber,
        source,
        reference_id,
        keterangan,
        user_id: finalUserId,
      }
    });

    // 4. Update cache stok secara incremental. Ini jauh lebih murah daripada
    //    menghitung ulang seluruh ledger untuk setiap item laporan.
    await db.rokok.update({
      where: { id: rokok_id },
      data: {
        stok: jenis === 'in'
          ? { increment: qtyNumber }
          : { decrement: qtyNumber },
      }
    });
  };

  if (tx) {
    await doWork(tx);
  } else {
    await prisma.$transaction(doWork);
  }
}

/**
 * Batch banyak mutasi stok dalam satu transaction.
 * Mengurangi round-trip DB drastis dibandingkan mutateStock() per item.
 *
 * Setiap entry: { rokok_id, tanggal, jenis, qty, source, reference_id?, keterangan?, user_id?, allowNegative? }
 *
 * Implementasi:
 *  1. SELECT ... FOR UPDATE semua rokok terkait sekaligus
 *  2. Validasi net delta per rokok (allowNegative=false untuk minimal salah satu mutasi out → strict)
 *  3. createMany stockMutation
 *  4. Single raw UPDATE dengan CASE WHEN untuk update Rokok.stok per id
 *
 * @param {object} opts
 * @param {object} opts.tx          - Prisma transaction client (wajib)
 * @param {Array}  opts.mutations   - Daftar mutasi
 */
export async function mutateStockBatch({ tx, mutations }) {
  if (!tx) throw new Error("mutateStockBatch wajib di dalam transaction (tx).");
  if (!Array.isArray(mutations) || mutations.length === 0) return;

  // 1. Normalisasi & agregasi per rokok
  const aggregate = new Map(); // rokok_id -> { netDelta, hasStrict, strictRequired }
  const rows = [];
  for (const m of mutations) {
    const qtyNumber = Number(m.qty) || 0;
    if (!m.rokok_id) throw new Error("Rokok tidak valid.");
    if (qtyNumber <= 0) throw new Error("Qty mutasi harus lebih dari 0.");
    if (m.jenis !== 'in' && m.jenis !== 'out') throw new Error("Jenis mutasi harus 'in' atau 'out'.");

    const delta = m.jenis === 'in' ? qtyNumber : -qtyNumber;
    const cur = aggregate.get(m.rokok_id) || { netDelta: 0, strictRequired: false };
    cur.netDelta += delta;
    if (m.jenis === 'out' && !m.allowNegative) cur.strictRequired = true;
    aggregate.set(m.rokok_id, cur);

    rows.push({
      rokok_id:     m.rokok_id,
      tanggal:      new Date(m.tanggal),
      jenis:        m.jenis,
      qty:          qtyNumber,
      source:       m.source,
      reference_id: m.reference_id ?? null,
      keterangan:   m.keterangan ?? null,
      user_id:      sanitizeUserId(m.user_id),
    });
  }

  const rokokIds = [...aggregate.keys()];

  // 2. Lock semua rokok terkait dalam satu query
  const lockedRows = await tx.$queryRaw`
    SELECT id, stok FROM "Rokok" WHERE id IN (${Prisma.join(rokokIds)}) FOR UPDATE
  `;
  const stockMap = new Map(lockedRows.map((r) => [r.id, Number(r.stok) || 0]));

  // 3. Validasi: pastikan semua rokok ada & stok cukup bila ada mutasi out strict
  for (const id of rokokIds) {
    if (!stockMap.has(id)) throw new Error("Rokok tidak ditemukan.");
    const { netDelta, strictRequired } = aggregate.get(id);
    if (strictRequired && stockMap.get(id) + netDelta < 0) {
      throw new Error(`Stok tidak mencukupi. Sisa: ${stockMap.get(id)}, mutasi netto: ${netDelta}`);
    }
  }

  // 4. Insert semua mutasi sekaligus
  await tx.stockMutation.createMany({ data: rows });

  // 5. Update Rokok.stok dalam 1 query (CASE WHEN)
  const cases = [...aggregate.entries()]
    .filter(([, v]) => v.netDelta !== 0)
    .map(([id, v]) => Prisma.sql`WHEN ${id} THEN ${v.netDelta}`);
  if (cases.length > 0) {
    const updateIds = [...aggregate.entries()].filter(([, v]) => v.netDelta !== 0).map(([id]) => id);
    await tx.$executeRaw`
      UPDATE "Rokok" SET stok = stok + CASE id ${Prisma.join(cases, ' ')} END
      WHERE id IN (${Prisma.join(updateIds)})
    `;
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
