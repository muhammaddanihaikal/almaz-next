const fs = require("fs");
for (const file of [".env.local", ".env"]) {
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^"|"$/g, "");
        if (key && !process.env[key]) process.env[key] = value;
      }
    }
  }
}

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});


const TARGET_DATE = new Date("2026-04-20");
const DATE_FROM = new Date("2026-04-20T00:00:00.000Z");
const DATE_TO   = new Date("2026-04-21T00:00:00.000Z");

async function main() {
  console.log("=".repeat(60));
  console.log("  CEK DATA DISTRIBUSI - 20 APRIL 2026 (PRODUCTION)");
  console.log("=".repeat(60));

  // ── 1. SesiHarian tanggal 20 April 2026 ──────────────────────────────
  console.log("\n[1] SESI HARIAN tanggal 20 April 2026:");
  const sesiList = await prisma.sesiHarian.findMany({
    where: { tanggal: TARGET_DATE },
    include: {
      sales: { select: { nama: true } },
      barangKeluar: { include: { rokok: { select: { nama: true } } } },
      barangKembali: { include: { rokok: { select: { nama: true } } } },
      penjualan:    { include: { rokok: { select: { nama: true } } } },
      setoran:      true,
      sample:       { include: { rokok: { select: { nama: true } } } },
      titipJual:    {
        include: {
          toko: { select: { nama: true } },
          items: { include: { rokok: { select: { nama: true } } } },
        }
      },
    },
    orderBy: { createdAt: "asc" },
  });

  if (sesiList.length === 0) {
    console.log("  ⚠️  TIDAK ADA sesi harian ditemukan untuk tanggal 20 Mei 2026!");
  } else {
    console.log(`  ✅ Ditemukan ${sesiList.length} sesi:`);
    for (const sesi of sesiList) {
      console.log(`\n  --- Sesi ID: ${sesi.id}`);
      console.log(`      Sales   : ${sesi.sales.nama}`);
      console.log(`      Status  : ${sesi.status}`);
      console.log(`      Historical: ${sesi.is_historical}`);
      console.log(`      Barang Keluar (${sesi.barangKeluar.length}):`);
      for (const bk of sesi.barangKeluar) {
        console.log(`        - ${bk.rokok.nama}: ${bk.qty}`);
      }
      console.log(`      Barang Kembali (${sesi.barangKembali.length}):`);
      for (const bk of sesi.barangKembali) {
        console.log(`        - ${bk.rokok.nama}: ${bk.qty}`);
      }
      console.log(`      Penjualan (${sesi.penjualan.length}):`);
      for (const pj of sesi.penjualan) {
        console.log(`        - ${pj.rokok.nama} [${pj.kategori}]: ${pj.qty} x ${pj.harga}`);
      }
      const totalSetoran = sesi.setoran.reduce((s, x) => s + x.jumlah, 0);
      console.log(`      Setoran  : Rp ${totalSetoran.toLocaleString("id-ID")} (${sesi.setoran.length} transaksi)`);
      console.log(`      TitipJual (${sesi.titipJual.length}):`);
      for (const tj of sesi.titipJual) {
        console.log(`        - ${tj.toko.nama} [${tj.status}]`);
      }
    }
  }

  // ── 2. TitipJual yang dibuat di sesi 20 Mei ──────────────────────────
  console.log("\n[2] TITIP JUAL yang sesinya tanggal 20 Mei:");
  const sesiIds = sesiList.map(s => s.id);
  if (sesiIds.length > 0) {
    const titipJualList = await prisma.titipJual.findMany({
      where: { sesi_id: { in: sesiIds } },
      include: {
        sales: { select: { nama: true } },
        toko:  { select: { nama: true } },
        items: { include: { rokok: { select: { nama: true } } } },
        setoran: true,
      }
    });
    console.log(`  Total TitipJual: ${titipJualList.length}`);
    for (const tj of titipJualList) {
      const totalSetoran = tj.setoran.reduce((s, x) => s + x.jumlah, 0);
      console.log(`\n  TJ ID: ${tj.id}`);
      console.log(`    Sales  : ${tj.sales.nama}`);
      console.log(`    Toko   : ${tj.toko.nama} [${tj.kategori}]`);
      console.log(`    Status : ${tj.status}`);
      console.log(`    JT     : ${tj.tanggal_jatuh_tempo.toISOString().split("T")[0]}`);
      console.log(`    Selesai: ${tj.tanggal_selesai ? tj.tanggal_selesai.toISOString().split("T")[0] : "-"}`);
      console.log(`    Setoran: Rp ${totalSetoran.toLocaleString("id-ID")}`);
      console.log(`    Items  :`);
      for (const it of tj.items) {
        console.log(`      - ${it.rokok.nama}: keluar=${it.qty_keluar}, terjual=${it.qty_terjual}, kembali=${it.qty_kembali}, harga=${it.harga}`);
      }
    }
  } else {
    console.log("  (Tidak ada sesi di tanggal ini, skip cek TitipJual by sesi)");
  }

  // ── 3. Stock Mutations tanggal 20 Mei ────────────────────────────────
  console.log("\n[3] STOCK MUTATIONS tanggal 20 Mei 2026:");
  const mutations = await prisma.stockMutation.findMany({
    where: { tanggal: TARGET_DATE },
    include: { rokok: { select: { nama: true } } },
    orderBy: [{ source: "asc" }, { createdAt: "asc" }],
  });
  console.log(`  Total mutasi: ${mutations.length}`);

  // Group by source
  const bySource = {};
  for (const m of mutations) {
    if (!bySource[m.source]) bySource[m.source] = [];
    bySource[m.source].push(m);
  }
  for (const [src, muts] of Object.entries(bySource)) {
    console.log(`\n  Source: ${src} (${muts.length} mutasi)`);
    for (const m of muts) {
      console.log(`    [${m.jenis.toUpperCase()}] ${m.rokok.nama}: ${m.qty}  ref=${m.reference_id || "-"}  ket=${m.keterangan || "-"}`);
    }
  }

  if (mutations.length === 0) {
    console.log("  ⚠️  TIDAK ADA stock mutation untuk tanggal 20 Mei 2026!");
  }

  // ── 4. AuditLog createdAt 20 Mei ─────────────────────────────────────
  console.log("\n[4] AUDIT LOG (createdAt 20 Mei 2026):");
  const auditLogs = await prisma.auditLog.findMany({
    where: {
      createdAt: { gte: DATE_FROM, lt: DATE_TO },
    },
    orderBy: { createdAt: "asc" },
  });
  console.log(`  Total audit logs: ${auditLogs.length}`);
  for (const log of auditLogs) {
    console.log(`  [${log.createdAt.toISOString()}] ${log.action} ${log.entity_type} ${log.entity_id} by ${log.user_name || "?"}  (${log.change_type || "-"})`);
  }

  // ── 5. Rangkuman ─────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log("  RANGKUMAN");
  console.log("=".repeat(60));
  console.log("\n  Target tanggal          : 20 April 2026");
  console.log(`  SesiHarian ditemukan    : ${sesiList.length}`);
  console.log(`  Stock Mutations         : ${mutations.length}`);
  console.log(`  Audit Logs (tanggal ini): ${auditLogs.length}`);

  if (sesiList.length === 0) {
    console.log("\n  🔴 KESIMPULAN: Data distribusi 20 Mei 2026 TIDAK ADA di database.");
    console.log("     Kemungkinan penyebab:");
    console.log("     1. Sesi tidak pernah dibuat (belum di-input)");
    console.log("     2. Data terhapus (cek audit log DELETE di atas)");
    console.log("     3. Salah tanggal saat input (cek sesi di sekitar tanggal ini)");
  } else if (sesiList.every(s => s.status === "aktif")) {
    console.log("\n  🟡 KESIMPULAN: Data ada tapi semua sesi masih status AKTIF (belum di-close).");
  } else {
    console.log("\n  🟢 KESIMPULAN: Data distribusi 20 Mei 2026 DITEMUKAN dan sudah selesai.");
  }
}

main()
  .catch((err) => {
    console.error("\n❌ ERROR:", err.message);
    console.error(err);
  })
  .finally(() => prisma.$disconnect());
