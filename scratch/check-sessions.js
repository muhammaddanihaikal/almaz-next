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
  console.log("=== CHECKING SESSIONS ON 2026-05-18 ===");
  const sessions = await prisma.sesiHarian.findMany({
    where: {
      tanggal: new Date("2026-05-18"),
    },
    include: {
      sales: true,
    },
  });
  console.log(sessions.map(s => ({
    id: s.id,
    sales: s.sales.nama,
    tanggal: s.tanggal.toISOString().split("T")[0],
    status: s.status,
  })));

  console.log("\n=== CHECKING ALL TITIPJUAL SETORAN ===");
  const setorans = await prisma.titipJualSetoran.findMany({
    include: {
      titipJual: {
        include: {
          sales: true,
          toko: true,
        }
      }
    }
  });
  console.log(setorans.map(st => ({
    id: st.id,
    sales: st.titipJual.sales.nama,
    toko: st.titipJual.toko.nama,
    metode: st.metode,
    jumlah: st.jumlah,
    tanggal: st.tanggal.toISOString().split("T")[0],
    sesi_penyelesaian_id: st.sesi_penyelesaian_id,
  })));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
