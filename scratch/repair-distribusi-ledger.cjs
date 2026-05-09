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

const APPLY = process.argv.includes("--apply")
const prisma = new PrismaClient()

function dateOnly(value) {
  return new Date(value).toISOString().split("T")[0]
}

function add(map, rokokId, qty) {
  map.set(rokokId, (map.get(rokokId) || 0) + qty)
}

function correctionFromDiff({ diff, rokokId, tanggal, referenceId, keterangan }) {
  if (diff === 0) return null
  return {
    rokok_id: rokokId,
    tanggal: new Date(tanggal),
    jenis: diff > 0 ? "out" : "in",
    qty: Math.abs(diff),
    source: "revert",
    reference_id: referenceId,
    keterangan,
    user_id: null,
  }
}

async function sessionCorrections(tx) {
  const sessions = await tx.sesiHarian.findMany({
    where: { is_historical: false },
    include: {
      sales: { select: { nama: true } },
      barangKeluar: true,
      barangKembali: true,
    },
  })

  const corrections = []
  for (const sesi of sessions) {
    const expected = new Map()
    for (const item of sesi.barangKeluar) add(expected, item.rokok_id, -item.qty)
    for (const item of sesi.barangKembali) add(expected, item.rokok_id, item.qty)

    const mutations = await tx.stockMutation.findMany({
      where: { reference_id: sesi.id },
      select: { rokok_id: true, jenis: true, qty: true },
    })
    const actual = new Map()
    for (const mutation of mutations) {
      add(actual, mutation.rokok_id, mutation.jenis === "in" ? mutation.qty : -mutation.qty)
    }

    for (const rokokId of new Set([...expected.keys(), ...actual.keys()])) {
      const diff = (actual.get(rokokId) || 0) - (expected.get(rokokId) || 0)
      const correction = correctionFromDiff({
        diff,
        rokokId,
        tanggal: sesi.tanggal,
        referenceId: sesi.id,
        keterangan: `Sinkronisasi mutasi distribusi (${dateOnly(sesi.tanggal)} - ${sesi.sales.nama})`,
      })
      if (correction) corrections.push(correction)
    }
  }
  return corrections
}

async function tukarCorrections(tx) {
  const tukarRows = await tx.tukarBarang.findMany({
    include: {
      sesi: { select: { is_historical: true } },
      itemsMasuk: true,
      itemsKeluar: true,
    },
  })

  const corrections = []
  for (const tukar of tukarRows) {
    const expected = new Map()
    if (!tukar.sesi?.is_historical) {
      for (const item of tukar.itemsMasuk) add(expected, item.rokok_id, item.qty)
      if (tukar.status === "selesai" && !tukar.sesi_selesai_id) {
        for (const item of tukar.itemsKeluar) add(expected, item.rokok_id, -item.qty)
      }
    }

    const mutations = await tx.stockMutation.findMany({
      where: { reference_id: tukar.id },
      select: { rokok_id: true, jenis: true, qty: true },
    })
    const actual = new Map()
    for (const mutation of mutations) {
      add(actual, mutation.rokok_id, mutation.jenis === "in" ? mutation.qty : -mutation.qty)
    }

    for (const rokokId of new Set([...expected.keys(), ...actual.keys()])) {
      const diff = (actual.get(rokokId) || 0) - (expected.get(rokokId) || 0)
      const correction = correctionFromDiff({
        diff,
        rokokId,
        tanggal: tukar.tanggal_selesai || tukar.tanggal,
        referenceId: tukar.id,
        keterangan: `Sinkronisasi mutasi tukar barang (${dateOnly(tukar.tanggal)})`,
      })
      if (correction) corrections.push(correction)
    }
  }
  return corrections
}

async function rebuildCache(tx, rokokIds) {
  for (const rokokId of rokokIds) {
    const grouped = await tx.stockMutation.groupBy({
      by: ["jenis"],
      where: { rokok_id: rokokId },
      _sum: { qty: true },
    })
    const masuk = grouped.find((row) => row.jenis === "in")?._sum.qty || 0
    const keluar = grouped.find((row) => row.jenis === "out")?._sum.qty || 0
    await tx.rokok.update({
      where: { id: rokokId },
      data: { stok: masuk - keluar },
    })
  }
}

async function main() {
  const corrections = await prisma.$transaction(async (tx) => {
    const rows = [
      ...(await sessionCorrections(tx)),
      ...(await tukarCorrections(tx)),
    ]

    if (APPLY && rows.length > 0) {
      await tx.stockMutation.createMany({ data: rows })
      await rebuildCache(tx, [...new Set(rows.map((row) => row.rokok_id))])
    }

    return rows
  }, { maxWait: 10000, timeout: 30000 })

  console.log(JSON.stringify({
    mode: APPLY ? "applied" : "dry-run",
    corrections: corrections.map((row) => ({
      ...row,
      tanggal: row.tanggal.toISOString().split("T")[0],
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
