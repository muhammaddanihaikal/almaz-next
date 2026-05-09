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

function add(map, rokokId, qty) {
  map.set(rokokId, (map.get(rokokId) || 0) + qty)
}

function mapToObject(map, rokokNames) {
  return Object.fromEntries(
    [...map.entries()]
      .filter(([, qty]) => qty !== 0)
      .map(([rokokId, qty]) => [rokokNames.get(rokokId) || rokokId, qty])
  )
}

async function main() {
  const rokok = await prisma.rokok.findMany({ select: { id: true, nama: true } })
  const rokokNames = new Map(rokok.map((r) => [r.id, r.nama]))
  const sessions = await prisma.sesiHarian.findMany({
    where: { is_historical: false },
    include: {
      sales: { select: { nama: true } },
      barangKeluar: true,
      barangKembali: true,
    },
    orderBy: [{ tanggal: "asc" }, { createdAt: "asc" }],
  })

  const mismatches = []
  for (const sesi of sessions) {
    const expected = new Map()
    for (const item of sesi.barangKeluar) add(expected, item.rokok_id, -item.qty)
    for (const item of sesi.barangKembali) add(expected, item.rokok_id, item.qty)

    const mutations = await prisma.stockMutation.findMany({
      where: { reference_id: sesi.id },
      select: { rokok_id: true, jenis: true, qty: true, source: true, keterangan: true },
    })
    const actual = new Map()
    for (const mutation of mutations) {
      add(actual, mutation.rokok_id, mutation.jenis === "in" ? mutation.qty : -mutation.qty)
    }

    const allIds = new Set([...expected.keys(), ...actual.keys()])
    const diff = new Map()
    for (const rokokId of allIds) {
      const value = (actual.get(rokokId) || 0) - (expected.get(rokokId) || 0)
      if (value !== 0) add(diff, rokokId, value)
    }

    if (diff.size > 0) {
      mismatches.push({
        sesi_id: sesi.id,
        tanggal: sesi.tanggal.toISOString().split("T")[0],
        sales: sesi.sales.nama,
        expected: mapToObject(expected, rokokNames),
        actual: mapToObject(actual, rokokNames),
        diff_actual_minus_expected: mapToObject(diff, rokokNames),
        sources: mutations.map((m) => ({
          rokok: rokokNames.get(m.rokok_id) || m.rokok_id,
          jenis: m.jenis,
          qty: m.qty,
          source: m.source,
          keterangan: m.keterangan,
        })),
      })
    }
  }

  const tukarRows = await prisma.tukarBarang.findMany({
    include: {
      sesi: { select: { is_historical: true } },
      itemsMasuk: true,
      itemsKeluar: true,
    },
    orderBy: [{ tanggal: "asc" }],
  })
  const tukarMismatches = []
  for (const tukar of tukarRows) {
    const expected = new Map()
    if (!tukar.sesi?.is_historical) {
      for (const item of tukar.itemsMasuk) add(expected, item.rokok_id, item.qty)
      if (tukar.status === "selesai" && !tukar.sesi_selesai_id) {
        for (const item of tukar.itemsKeluar) add(expected, item.rokok_id, -item.qty)
      }
    }

    const mutations = await prisma.stockMutation.findMany({
      where: { reference_id: tukar.id },
      select: { rokok_id: true, jenis: true, qty: true, source: true, keterangan: true },
    })
    const actual = new Map()
    for (const mutation of mutations) {
      add(actual, mutation.rokok_id, mutation.jenis === "in" ? mutation.qty : -mutation.qty)
    }
    const allIds = new Set([...expected.keys(), ...actual.keys()])
    const diff = new Map()
    for (const rokokId of allIds) {
      const value = (actual.get(rokokId) || 0) - (expected.get(rokokId) || 0)
      if (value !== 0) add(diff, rokokId, value)
    }
    if (diff.size > 0) {
      tukarMismatches.push({
        tukar_id: tukar.id,
        status: tukar.status,
        tanggal: tukar.tanggal.toISOString().split("T")[0],
        expected: mapToObject(expected, rokokNames),
        actual: mapToObject(actual, rokokNames),
        diff_actual_minus_expected: mapToObject(diff, rokokNames),
        sources: mutations.map((m) => ({
          rokok: rokokNames.get(m.rokok_id) || m.rokok_id,
          jenis: m.jenis,
          qty: m.qty,
          source: m.source,
          keterangan: m.keterangan,
        })),
      })
    }
  }

  console.log(JSON.stringify({
    checked_sessions: sessions.length,
    mismatches,
    checked_tukar: tukarRows.length,
    tukarMismatches,
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
