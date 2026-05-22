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
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});


async function main() {
  console.log("=== CHECKING PRODUCTION DATABASE ===");

  const list = await prisma.titipJual.findMany({
    include: {
      sales: true,
      toko: true,
      items: {
        include: {
          rokok: true,
        }
      },
      setoran: true,
    }
  });

  console.log(`Found ${list.length} completed/active TitipJual:`);
  for (const tj of list) {
    if (tj.sales.nama.includes("TROY") || tj.toko.nama.includes("DARSONO") || tj.status === "selesai") {
      console.log(`- ID: ${tj.id}`);
      console.log(`  Sales: ${tj.sales.nama}, Toko: ${tj.toko.nama}, Status: ${tj.status}`);
      console.log(`  Tanggal Distribusi (from Sesi ID ${tj.sesi_id}): ?`);
      console.log(`  Tanggal Jatuh Tempo: ${tj.tanggal_jatuh_tempo.toISOString().split("T")[0]}`);
      console.log(`  Tanggal Selesai: ${tj.tanggal_selesai ? tj.tanggal_selesai.toISOString() : null}`);
      console.log(`  Tanggal Selesai (Raw): ${tj.tanggal_selesai}`);
      console.log(`  Items:`, tj.items.map(it => ({ rokok: it.rokok.nama, qty_keluar: it.qty_keluar, qty_terjual: it.qty_terjual, qty_kembali: it.qty_kembali, harga: it.harga })));
      console.log(`  Setoran:`, tj.setoran);
    }
  }

  console.log("\n=== CHECKING ALL TUKAR BARANG ===");
  const tukarList = await prisma.tukarBarang.findMany({
    include: {
      itemsMasuk: {
        include: {
          rokok: true,
        }
      },
      itemsKeluar: {
        include: {
          rokok: true,
        }
      }
    }
  });

  console.log(`Found ${tukarList.length} TukarBarang:`);
  for (const tb of tukarList) {
    console.log(`- ID: ${tb.id}, Status: ${tb.status}`);
    console.log(`  Tanggal Selesai: ${tb.tanggal_selesai ? tb.tanggal_selesai.toISOString() : null}`);
    console.log(`  ItemsMasuk:`, tb.itemsMasuk.map(it => ({ rokok: it.rokok.nama, qty: it.qty, harga: it.harga_satuan })));
    console.log(`  ItemsKeluar:`, tb.itemsKeluar.map(it => ({ rokok: it.rokok.nama, qty: it.qty, harga: it.harga_satuan })));
  }
}

main()
  .catch(err => console.error(err))
  .finally(() => prisma.$disconnect());
