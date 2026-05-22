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
  console.log("=== ROKOK STOCK POOLS ===");
  const products = await prisma.rokok.findMany({
    orderBy: { urutan: "asc" }
  });
  console.log(products.map(p => ({
    id: p.id,
    nama: p.nama,
    stok: p.stok,
    stok_sample_cukai: p.stok_sample_cukai,
    stok_sample_biasa: p.stok_sample_biasa,
  })));
}

main().finally(() => prisma.$disconnect());
