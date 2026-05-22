const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const start = new Date("2026-04-27T00:00:00Z");
  const end = new Date("2026-05-01T23:59:59Z");

  console.log("=== TITIP JUAL AKTIF (status: aktif) ===");
  const aktif = await prisma.titipJual.findMany({
    where: {
      status: "aktif"
    },
    include: {
      sales: true,
      toko: true,
      sesi: true
    }
  });
  console.log(`Total aktif: ${aktif.length}`);
  aktif.forEach(tj => {
    console.log(`ID: ${tj.id}, Sales: ${tj.sales.nama}, Toko: ${tj.toko.nama}, Tanggal Jatuh Tempo: ${tj.tanggal_jatuh_tempo.toISOString().split("T")[0]}, Tanggal Distribusi (Sesi): ${tj.sesi.tanggal.toISOString().split("T")[0]}`);
  });

  console.log("\n=== TITIP JUAL SELESAI (status: selesai) ===");
  const selesai = await prisma.titipJual.findMany({
    where: {
      status: "selesai"
    },
    include: {
      sales: true,
      toko: true,
      sesi: true
    }
  });
  console.log(`Total selesai: ${selesai.length}`);
  selesai.forEach(tj => {
    console.log(`ID: ${tj.id}, Sales: ${tj.sales.nama}, Toko: ${tj.toko.nama}, Tanggal Jatuh Tempo: ${tj.tanggal_jatuh_tempo.toISOString().split("T")[0]}, Tanggal Distribusi (Sesi): ${tj.sesi.tanggal.toISOString().split("T")[0]}, Tanggal Selesai: ${tj.tanggal_selesai?.toISOString().split("T")[0]}`);
  });
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
