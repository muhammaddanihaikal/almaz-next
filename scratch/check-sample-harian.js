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
const prisma = new PrismaClient();


async function main() {
  console.log("=== STOCK MUTATIONS DETAIL ===");
  const mutations = await prisma.stockMutation.findMany({
    where: {
      stock_type: { in: ["sample_cukai", "sample_biasa"] }
    },
    include: {
      rokok: { select: { nama: true } }
    },
    orderBy: { createdAt: "desc" },
    take: 30
  });
  console.log(mutations.map(m => ({
    id: m.id,
    rokok: m.rokok.nama,
    tanggal: m.tanggal.toISOString().split("T")[0],
    jenis: m.jenis,
    qty: m.qty,
    source: m.source,
    stock_type: m.stock_type,
    keterangan: m.keterangan,
    createdAt: m.createdAt,
  })));
}

main().finally(() => prisma.$disconnect());
