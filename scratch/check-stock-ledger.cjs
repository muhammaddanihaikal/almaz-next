const fs = require("fs")
const { PrismaClient } = require("@prisma/client")

for (const file of [".env.local", ".env"]) {
  if (!fs.existsSync(file)) continue
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/)
    if (!match) continue
    const key = match[1].trim()
    const value = match[2].trim().replace(/^"|"$/g, "")
    if (key && !process.env[key]) process.env[key] = value
  }
}

const prisma = new PrismaClient()

async function main() {
  const rows = await prisma.rokok.findMany({
    select: { id: true, nama: true, stok: true },
    orderBy: { urutan: "asc" },
  })
  const mutations = await prisma.stockMutation.groupBy({
    by: ["rokok_id", "jenis"],
    _sum: { qty: true },
  })

  const byRokok = new Map()
  for (const mutation of mutations) {
    const current = byRokok.get(mutation.rokok_id) || { in: 0, out: 0 }
    current[mutation.jenis] += mutation._sum.qty || 0
    byRokok.set(mutation.rokok_id, current)
  }

  const mismatches = rows
    .map((rokok) => {
      const aggregate = byRokok.get(rokok.id) || { in: 0, out: 0 }
      const ledger = aggregate.in - aggregate.out
      return {
        nama: rokok.nama,
        stok_cache: rokok.stok,
        stok_ledger: ledger,
        selisih: rokok.stok - ledger,
      }
    })
    .filter((row) => row.selisih !== 0)

  const sources = await prisma.stockMutation.groupBy({
    by: ["source", "jenis"],
    _sum: { qty: true },
    _count: { _all: true },
    orderBy: [{ source: "asc" }, { jenis: "asc" }],
  })

  const legacyDistributionMutations = await prisma.stockMutation.findMany({
    where: {
      OR: [
        { source: { in: ["penjualan", "tukar_keluar", "konsinyasi_keluar"] } },
        { source: "revert" },
      ],
    },
    select: {
      id: true,
      tanggal: true,
      jenis: true,
      qty: true,
      source: true,
      reference_id: true,
      rokok: { select: { nama: true } },
    },
    orderBy: [{ source: "asc" }, { tanggal: "asc" }],
  })

  console.log(JSON.stringify({
    total_rokok: rows.length,
    mismatches,
    sources,
    legacyDistributionMutations: legacyDistributionMutations.map((row) => ({
      ...row,
      tanggal: row.tanggal.toISOString().split("T")[0],
      rokok: row.rokok.nama,
    })),
  }, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
