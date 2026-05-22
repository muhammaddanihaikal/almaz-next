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


function dateOnly(value) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

async function main() {
  console.log("=== SIMULATING NEW getSesiList QUERY FOR 2026-05-18 ===\n");

  // Fetch sessions for 2026-05-18
  const rows = await prisma.sesiHarian.findMany({
    where: {
      tanggal: new Date("2026-05-18"),
    },
    include: {
      sales: true,
      titipJual: { include: { items: { include: { rokok: true } }, setoran: true, toko: true } },
    },
    orderBy: [{ tanggal: "desc" }, { createdAt: "desc" }],
  });

  console.log(`Found ${rows.length} sessions on 2026-05-18:`);
  for (const row of rows) {
    console.log(`  - ${row.sales.nama} (ID: ${row.id}), TitipJual in session: ${row.titipJual.length}`);
  }

  // Build sesiByKey exactly as in new getSesiList
  const sesiByKey = {};
  for (const row of rows) {
    const key = `${dateOnly(row.tanggal)}|${row.sales_id}`;
    if (!sesiByKey[key]) sesiByKey[key] = [];
    sesiByKey[key].push(row);
  }

  const tanggalList = [...new Set(rows.map(r => dateOnly(r.tanggal)))];
  const settledTitipJual = await prisma.titipJual.findMany({
    where: {
      status: "selesai",
      tanggal_selesai: {
        in: tanggalList.map(d => new Date(d)),
      },
    },
    include: {
      items: { include: { rokok: true } },
      setoran: true,
      toko: true,
      sales: true,
    },
  });

  console.log(`\nFound ${settledTitipJual.length} settled TitipJual on ${tanggalList.join(", ")}:`);
  for (const tj of settledTitipJual) {
    console.log(`  - ${tj.sales.nama} -> ${tj.toko.nama} (selesai: ${dateOnly(tj.tanggal_selesai)}, sesi_id=${tj.sesi_id})`);
  }

  // Map TJ ke sesi (logic baru)
  const settledTjBySesiId = {};
  for (const tj of settledTitipJual) {
    const tjTanggal = dateOnly(tj.tanggal_selesai);
    const key = `${tjTanggal}|${tj.sales_id}`;
    const matchingSesi = sesiByKey[key] || [];
    for (const sesi of matchingSesi) {
      if (tj.sesi_id === sesi.id) continue; // skip TJ yang milik sesi ini
      if (!settledTjBySesiId[sesi.id]) settledTjBySesiId[sesi.id] = {};
      settledTjBySesiId[sesi.id][tj.id] = tj;
    }
  }

  console.log("\n=== RESULT: konsinyasiSelesaiDiSesi per session ===");
  for (const row of rows) {
    const konsinyasiSelesai = Object.values(settledTjBySesiId[row.id] || {});
    console.log(`\n  Session: ${row.sales.nama} (${dateOnly(row.tanggal)})`);
    console.log(`  TitipJual milik sesi ini (konsinyasi): ${row.titipJual.length}`);
    console.log(`  TitipJual selesai di sesi ini (konsinyasiSelesaiDiSesi): ${konsinyasiSelesai.length}`);
    for (const k of konsinyasiSelesai) {
      const nilaiTerjual = k.items.reduce((s, it) => s + it.qty_terjual * it.harga, 0);
      console.log(`    -> ${k.toko.nama} | ${k.items.map(it => `${it.rokok.nama} x${it.qty_terjual}`).join(", ")} | Rp ${nilaiTerjual.toLocaleString("id-ID")}`);
    }
  }

  console.log("\n=== PAK TROY Specific Check ===");
  const troySession = rows.find(r => r.sales.nama === "PAK TROY");
  if (troySession) {
    const tjSelesai = Object.values(settledTjBySesiId[troySession.id] || {});
    console.log(`PAK TROY session ID: ${troySession.id}`);
    console.log(`konsinyasiSelesaiDiSesi for PAK TROY: ${tjSelesai.length}`);
    for (const tj of tjSelesai) {
      const totalSetoran = tj.setoran.reduce((s, st) => s + st.jumlah, 0);
      console.log(`  -> TK DARSONO: ${tj.items.map(it => `${it.rokok.nama} qty_terjual=${it.qty_terjual} harga=${it.harga}`).join(", ")}`);
      console.log(`     Total setoran: Rp ${totalSetoran.toLocaleString("id-ID")}`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
