const { PrismaClient } = require("@prisma/client")
const bcrypt = require("bcryptjs")

const prisma = new PrismaClient()

async function main() {
  // User admin
  const password = await bcrypt.hash("admin123", 10)
  await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: { username: "admin", password, name: "Administrator" },
  })

  // 10 Rokok
  const rokokData = [
    { nama: "Gudang Garam Surya 12", harga_beli: 20000, harga_grosir: 22000, harga_toko: 23000, harga_perorangan: 25000, stok: 200 },
    { nama: "Sampoerna A Mild 16",   harga_beli: 22000, harga_grosir: 24000, harga_toko: 25000, harga_perorangan: 27000, stok: 150 },
    { nama: "Dji Sam Soe 234",       harga_beli: 25000, harga_grosir: 27000, harga_toko: 28000, harga_perorangan: 30000, stok: 100 },
    { nama: "Marlboro Merah",        harga_beli: 28000, harga_grosir: 30000, harga_toko: 32000, harga_perorangan: 35000, stok: 80  },
    { nama: "Camel Filter",          harga_beli: 24000, harga_grosir: 26000, harga_toko: 27000, harga_perorangan: 29000, stok: 120 },
    { nama: "LA Bold",               harga_beli: 19000, harga_grosir: 21000, harga_toko: 22000, harga_perorangan: 24000, stok: 180 },
    { nama: "Dunhill Fine Cut",      harga_beli: 26000, harga_grosir: 28000, harga_toko: 30000, harga_perorangan: 32000, stok: 90  },
    { nama: "Gudang Garam Merah",    harga_beli: 18000, harga_grosir: 20000, harga_toko: 21000, harga_perorangan: 23000, stok: 250 },
    { nama: "Sampoerna Kretek",      harga_beli: 15000, harga_grosir: 17000, harga_toko: 18000, harga_perorangan: 20000, stok: 300 },
    { nama: "Wismilak Diplomat",     harga_beli: 21000, harga_grosir: 23000, harga_toko: 24000, harga_perorangan: 26000, stok: 130 },
  ]

  const rokok = []
  for (const r of rokokData) {
    const item = await prisma.rokok.upsert({ where: { nama: r.nama }, update: {}, create: r })
    rokok.push(item)
  }

  // 5 Sales
  const salesData = [
    { nama: "Budi Santoso",   no_hp: "08211000001" },
    { nama: "Agus Prasetyo",  no_hp: "08211000002" },
    { nama: "Siti Rahayu",    no_hp: "08211000003" },
    { nama: "Deni Kurniawan", no_hp: "08211000004" },
    { nama: "Rini Wulandari", no_hp: "08211000005" },
  ]

  const sales = []
  for (const s of salesData) {
    const item = await prisma.sales.upsert({ where: { nama: s.nama }, update: {}, create: s })
    sales.push(item)
  }

  // 15 Penjualan (Distribusi)
  const distribusiData = [
    { tanggal: new Date("2026-03-01"), tipe: "Toko",       sales: sales[0], items: [{ rokok: rokok[0], qty: 10, harga: rokok[0].harga_toko }, { rokok: rokok[1], qty: 5, harga: rokok[1].harga_toko }] },
    { tanggal: new Date("2026-03-02"), tipe: "Grosir",     sales: sales[1], items: [{ rokok: rokok[2], qty: 20, harga: rokok[2].harga_grosir }, { rokok: rokok[3], qty: 15, harga: rokok[3].harga_grosir }] },
    { tanggal: new Date("2026-03-05"), tipe: "Perorangan", sales: sales[2], items: [{ rokok: rokok[4], qty: 3,  harga: rokok[4].harga_perorangan }] },
    { tanggal: new Date("2026-03-07"), tipe: "Toko",       sales: sales[0], items: [{ rokok: rokok[5], qty: 8,  harga: rokok[5].harga_toko }, { rokok: rokok[6], qty: 6, harga: rokok[6].harga_toko }] },
    { tanggal: new Date("2026-03-10"), tipe: "Grosir",     sales: sales[3], items: [{ rokok: rokok[7], qty: 30, harga: rokok[7].harga_grosir }] },
    { tanggal: new Date("2026-03-12"), tipe: "Toko",       sales: sales[4], items: [{ rokok: rokok[8], qty: 12, harga: rokok[8].harga_toko }, { rokok: rokok[9], qty: 8, harga: rokok[9].harga_toko }] },
    { tanggal: new Date("2026-03-15"), tipe: "Perorangan", sales: sales[1], items: [{ rokok: rokok[0], qty: 2,  harga: rokok[0].harga_perorangan }, { rokok: rokok[1], qty: 2, harga: rokok[1].harga_perorangan }] },
    { tanggal: new Date("2026-03-18"), tipe: "Toko",       sales: sales[2], items: [{ rokok: rokok[2], qty: 15, harga: rokok[2].harga_toko }] },
    { tanggal: new Date("2026-03-20"), tipe: "Grosir",     sales: sales[0], items: [{ rokok: rokok[3], qty: 25, harga: rokok[3].harga_grosir }, { rokok: rokok[4], qty: 20, harga: rokok[4].harga_grosir }] },
    { tanggal: new Date("2026-03-22"), tipe: "Toko",       sales: sales[3], items: [{ rokok: rokok[5], qty: 10, harga: rokok[5].harga_toko }] },
    { tanggal: new Date("2026-04-01"), tipe: "Toko",       sales: sales[4], items: [{ rokok: rokok[6], qty: 7,  harga: rokok[6].harga_toko }, { rokok: rokok[7], qty: 5, harga: rokok[7].harga_toko }] },
    { tanggal: new Date("2026-04-03"), tipe: "Grosir",     sales: sales[1], items: [{ rokok: rokok[8], qty: 40, harga: rokok[8].harga_grosir }] },
    { tanggal: new Date("2026-04-05"), tipe: "Perorangan", sales: sales[2], items: [{ rokok: rokok[9], qty: 4,  harga: rokok[9].harga_perorangan }] },
    { tanggal: new Date("2026-04-08"), tipe: "Toko",       sales: sales[3], items: [{ rokok: rokok[0], qty: 20, harga: rokok[0].harga_toko }, { rokok: rokok[2], qty: 10, harga: rokok[2].harga_toko }] },
    { tanggal: new Date("2026-04-10"), tipe: "Grosir",     sales: sales[4], items: [{ rokok: rokok[1], qty: 35, harga: rokok[1].harga_grosir }, { rokok: rokok[3], qty: 20, harga: rokok[3].harga_grosir }] },
  ]

  for (const d of distribusiData) {
    await prisma.distribusi.create({
      data: {
        tanggal: d.tanggal,
        tipe_penjualan: d.tipe,
        sales_id: d.sales.id,
        tanggal_bayar: d.tipe === "Toko" ? new Date(d.tanggal.getTime() + 7 * 24 * 60 * 60 * 1000) : d.tanggal,
        items: {
          create: d.items.map((i) => ({
            rokok_id: i.rokok.id,
            qty: i.qty,
            harga: i.harga,
            pembayaran: d.tipe === "Toko" ? "Hutang" : "Cash",
          })),
        },
      },
    })
  }

  // 15 Retur
  const returData = [
    { tanggal: new Date("2026-03-03"), tipe: "Toko",       sales: sales[0], alasan: "Produk rusak",    items: [{ rokok: rokok[0], qty: 2 }] },
    { tanggal: new Date("2026-03-04"), tipe: "Grosir",     sales: sales[1], alasan: "Kadaluarsa",      items: [{ rokok: rokok[2], qty: 5 }] },
    { tanggal: new Date("2026-03-06"), tipe: "Perorangan", sales: sales[2], alasan: "Salah kirim",     items: [{ rokok: rokok[4], qty: 1 }] },
    { tanggal: new Date("2026-03-08"), tipe: "Toko",       sales: sales[0], alasan: "Produk rusak",    items: [{ rokok: rokok[5], qty: 3 }] },
    { tanggal: new Date("2026-03-11"), tipe: "Grosir",     sales: sales[3], alasan: "Kelebihan stok",  items: [{ rokok: rokok[7], qty: 10 }] },
    { tanggal: new Date("2026-03-13"), tipe: "Toko",       sales: sales[4], alasan: "Produk rusak",    items: [{ rokok: rokok[8], qty: 2 }, { rokok: rokok[9], qty: 1 }] },
    { tanggal: new Date("2026-03-16"), tipe: "Perorangan", sales: sales[1], alasan: "Salah kirim",     items: [{ rokok: rokok[0], qty: 1 }] },
    { tanggal: new Date("2026-03-19"), tipe: "Toko",       sales: sales[2], alasan: "Kadaluarsa",      items: [{ rokok: rokok[2], qty: 4 }] },
    { tanggal: new Date("2026-03-21"), tipe: "Grosir",     sales: sales[0], alasan: "Produk rusak",    items: [{ rokok: rokok[3], qty: 8 }] },
    { tanggal: new Date("2026-03-23"), tipe: "Toko",       sales: sales[3], alasan: "Kelebihan stok",  items: [{ rokok: rokok[5], qty: 3 }] },
    { tanggal: new Date("2026-04-02"), tipe: "Toko",       sales: sales[4], alasan: "Produk rusak",    items: [{ rokok: rokok[6], qty: 2 }] },
    { tanggal: new Date("2026-04-04"), tipe: "Grosir",     sales: sales[1], alasan: "Kadaluarsa",      items: [{ rokok: rokok[8], qty: 6 }] },
    { tanggal: new Date("2026-04-06"), tipe: "Perorangan", sales: sales[2], alasan: "Salah kirim",     items: [{ rokok: rokok[9], qty: 2 }] },
    { tanggal: new Date("2026-04-09"), tipe: "Toko",       sales: sales[3], alasan: "Produk rusak",    items: [{ rokok: rokok[0], qty: 5 }, { rokok: rokok[2], qty: 3 }] },
    { tanggal: new Date("2026-04-11"), tipe: "Grosir",     sales: sales[4], alasan: "Kelebihan stok",  items: [{ rokok: rokok[1], qty: 10 }] },
  ]

  for (const r of returData) {
    await prisma.retur.create({
      data: {
        tanggal: r.tanggal,
        tipe_penjualan: r.tipe,
        sales_id: r.sales.id,
        alasan: r.alasan,
        items: {
          create: r.items.map((i) => ({ rokok_id: i.rokok.id, qty: i.qty })),
        },
      },
    })
  }

  console.log("Seed done!")
  console.log(`- 1 user admin`)
  console.log(`- ${rokok.length} rokok`)
  console.log(`- ${sales.length} sales`)
  console.log(`- ${distribusiData.length} penjualan`)
  console.log(`- ${returData.length} retur`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
