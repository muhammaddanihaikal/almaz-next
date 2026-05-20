import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { nowJakarta } from "@/lib/utils";

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
  // Sample Harian (admin, independent dari sesi sales)
  SAMPLE_HARIAN_KELUAR:  "sample_harian_keluar",
  SAMPLE_HARIAN_KEMBALI: "sample_harian_kembali",
};

/**
 * Hitung stok aktual untuk rokok tertentu dari ledger.
 * @param {string} rokok_id
 * @param {Date|null} tanggal - Jika diisi, hitung stok hingga tanggal tersebut
 * @param {object} tx - Prisma transaction client (opsional)
 */
export async function getStock(rokok_id, tanggal = null, tx = prisma) {
  const where = { rokok_id, stock_type: "jual" };
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
 * @param {string}  [opts.stock_type="jual"] - "jual" | "sample_cukai" | "sample_biasa"
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
  source          = "adjustment",
  stock_type      = "jual", 
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
      SELECT "stok", "stok_sample_cukai", "stok_sample_biasa" FROM "Rokok" WHERE id = ${rokok_id} FOR UPDATE
    `;
    const lockedRokok = lockedRows?.[0];
    if (!lockedRokok) throw new Error("Rokok tidak ditemukan.");

    // Tentukan field yang akan divalidasi dan diupdate
    const field = stock_type === "sample_cukai" ? "stok_sample_cukai" :
                  stock_type === "sample_biasa" ? "stok_sample_biasa" : "stok";
    
    const currentStock = Number(lockedRokok[field]) || 0;

    // 2. Validasi stok tidak minus (untuk mutasi keluar)
    if (jenis === 'out' && !allowNegative) {
      if (currentStock - qtyNumber < 0) {
        throw new Error(`Stok ${stock_type} tidak mencukupi. Sisa: ${currentStock}, Keluar: ${qtyNumber}`);
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
        stock_type,
        reference_id,
        keterangan,
        user_id: finalUserId,
      }
    });

    // 4. Update cache stok secara incremental.
    await db.rokok.update({
      where: { id: rokok_id },
      data: {
        [field]: jenis === 'in'
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
 */
export async function mutateStockBatch({ tx, mutations }) {
  if (!tx) throw new Error("mutateStockBatch wajib di dalam transaction (tx).");
  if (!Array.isArray(mutations) || mutations.length === 0) return;

  // 1. Normalisasi & agregasi per rokok + stock_type
  const aggregate = new Map(); // "rokok_id:stock_type" -> { rokok_id, stock_type, netDelta, strictRequired }
  const rows = [];
  for (const m of mutations) {
    const qtyNumber = Number(m.qty) || 0;
    const sType = m.stock_type || "jual";
    if (!m.rokok_id) throw new Error("Rokok tidak valid.");
    if (qtyNumber <= 0) throw new Error("Qty mutasi harus lebih dari 0.");
    if (m.jenis !== 'in' && m.jenis !== 'out') throw new Error("Jenis mutasi harus 'in' atau 'out'.");

    const key = `${m.rokok_id}:${sType}`;
    const delta = m.jenis === 'in' ? qtyNumber : -qtyNumber;
    
    const cur = aggregate.get(key) || { rokok_id: m.rokok_id, stock_type: sType, netDelta: 0, strictRequired: false };
    cur.netDelta += delta;
    if (m.jenis === 'out' && !m.allowNegative) cur.strictRequired = true;
    aggregate.set(key, cur);

    rows.push({
      rokok_id:     m.rokok_id,
      tanggal:      new Date(m.tanggal),
      jenis:        m.jenis,
      qty:          qtyNumber,
      source:       m.source,
      stock_type:   sType,
      reference_id: m.reference_id ?? null,
      keterangan:   m.keterangan ?? null,
      user_id:      sanitizeUserId(m.user_id),
    });
  }

  const rokokIds = [...new Set(mutations.map(m => m.rokok_id))];

  // 2. Lock semua rokok terkait
  const lockedRows = await tx.$queryRaw`
    SELECT id, stok, stok_sample_cukai, stok_sample_biasa FROM "Rokok" WHERE id IN (${Prisma.join(rokokIds)}) FOR UPDATE
  `;
  const rokokMap = new Map(lockedRows.map((r) => [r.id, r]));

  // 3. Validasi stok
  for (const [key, agg] of aggregate.entries()) {
    const r = rokokMap.get(agg.rokok_id);
    if (!r) throw new Error("Rokok tidak ditemukan.");
    
    const field = agg.stock_type === "sample_cukai" ? "stok_sample_cukai" :
                  agg.stock_type === "sample_biasa" ? "stok_sample_biasa" : "stok";
    
    const currentVal = Number(r[field]) || 0;
    if (agg.strictRequired && currentVal + agg.netDelta < 0) {
      throw new Error(`Stok ${agg.stock_type} tidak mencukupi untuk ${r.nama}. Sisa: ${currentVal}, mutasi netto: ${agg.netDelta}`);
    }
  }

  // 4. Insert semua mutasi
  await tx.stockMutation.createMany({ data: rows });

  // 5. Update Rokok secara incremental per field
  const groupedUpdate = new Map(); // rokok_id -> { stok: 0, stok_sample_cukai: 0, stok_sample_biasa: 0 }
  for (const agg of aggregate.values()) {
    const cur = groupedUpdate.get(agg.rokok_id) || { stok: 0, stok_sample_cukai: 0, stok_sample_biasa: 0 };
    const field = agg.stock_type === "sample_cukai" ? "stok_sample_cukai" :
                  agg.stock_type === "sample_biasa" ? "stok_sample_biasa" : "stok";
    cur[field] += agg.netDelta;
    groupedUpdate.set(agg.rokok_id, cur);
  }

  for (const [id, deltas] of groupedUpdate.entries()) {
    const updateData = {};
    if (deltas.stok !== 0)              updateData.stok = { increment: deltas.stok };
    if (deltas.stok_sample_cukai !== 0) updateData.stok_sample_cukai = { increment: deltas.stok_sample_cukai };
    if (deltas.stok_sample_biasa !== 0) updateData.stok_sample_biasa = { increment: deltas.stok_sample_biasa };
    
    if (Object.keys(updateData).length > 0) {
      await tx.rokok.update({
        where: { id },
        data: updateData
      });
    }
  }
}

/**
 * Koreksi stok manual oleh admin.
 */
export async function koreksiStok({ rokok_id, jenis, qty, keterangan, user_id }) {
  if (!keterangan) throw new Error("Keterangan wajib diisi untuk koreksi stok.");
  if (!user_id)    throw new Error("User harus teridentifikasi untuk melakukan koreksi stok.");

  await mutateStock({
    rokok_id,
    tanggal:    nowJakarta(),
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
 */
export function assertMutasiEditable(tanggal) {
  const today = nowJakarta();
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
