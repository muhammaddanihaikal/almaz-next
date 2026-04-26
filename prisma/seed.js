const { PrismaClient } = require("@prisma/client")
const bcrypt = require("bcryptjs")

const prisma = new PrismaClient()

async function main() {
  // User admin
  const password = await bcrypt.hash("admin123", 10)
  await prisma.user.upsert({
    where:  { username: "admin" },
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

  // 5 Toko
  const tokoData = [
    { nama: "Toko Maju Jaya",      tipe: "Toko",   alamat: "Jl. Pasar Baru No. 12" },
    { nama: "Toko Berkah Mandiri", tipe: "Toko",   alamat: "Jl. Veteran No. 45"    },
    { nama: "Grosir Makmur",       tipe: "Grosir", alamat: "Jl. Industri No. 8"    },
    { nama: "Toko Sumber Rezeki",  tipe: "Toko",   alamat: "Jl. Raya Timur No. 22" },
    { nama: "Grosir Agung",        tipe: "Grosir", alamat: "Jl. Perdagangan No. 3" },
  ]

  const toko = []
  for (const t of tokoData) {
    const item = await prisma.toko.upsert({ where: { nama: t.nama }, update: {}, create: t })
    toko.push(item)
  }

  const h = (r, tipe) => tipe === "Toko" ? r.harga_toko : r.harga_grosir

  // 9 Penjualan (6 Lengkap + 3 Belum Masuk hari ini)
  const penjualanData = [
    // ── LENGKAP ──────────────────────────────────────────────────────────────
    {
      tanggal: new Date("2026-03-01"), toko: toko[0], sales: sales[0],
      keluar: [
        { r: rokok[0], qty: 15, qty_sample: 0 },
        { r: rokok[1], qty: 10, qty_sample: 0 },
        { r: rokok[7], qty:  5, qty_sample: 2 },
      ],
      masuk: [
        { r: rokok[0], qty: 12, qty_sample: 0, pembayaran: "Cash"   },
        { r: rokok[1], qty:  8, qty_sample: 0, pembayaran: "Hutang" },
        { r: rokok[7], qty:  4, qty_sample: 2, pembayaran: "Cash"   },
      ],
      setoran_tipe:  "Cash",
      // 12*23000 + 8*25000 + 4*21000 = 276000 + 200000 + 84000 = 560000 — cocok
      get setoran_total() { return 12 * h(rokok[0], "Toko") + 8 * h(rokok[1], "Toko") + 4 * h(rokok[7], "Toko") },
    },
    {
      tanggal: new Date("2026-03-05"), toko: toko[2], sales: sales[1],
      keluar: [
        { r: rokok[2], qty: 20, qty_sample: 0 },
        { r: rokok[3], qty: 15, qty_sample: 0 },
        { r: rokok[4], qty:  8, qty_sample: 2 },
      ],
      masuk: [
        { r: rokok[2], qty: 18, qty_sample: 0, pembayaran: "Cash"     },
        { r: rokok[3], qty: 12, qty_sample: 0, pembayaran: "Cash"     },
        { r: rokok[4], qty:  6, qty_sample: 2, pembayaran: "Transfer" },
      ],
      setoran_tipe:  "Transfer",
      // 18*27000 + 12*30000 + 6*26000 = 486000 + 360000 + 156000 = 1002000 — cocok
      get setoran_total() { return 18 * h(rokok[2], "Grosir") + 12 * h(rokok[3], "Grosir") + 6 * h(rokok[4], "Grosir") },
    },
    {
      tanggal: new Date("2026-03-10"), toko: null, sales: sales[2],
      keluar: [
        { r: rokok[5], qty:  8, qty_sample: 0 },
        { r: rokok[4], qty:  5, qty_sample: 1 },
      ],
      masuk: [
        { r: rokok[5], qty: 7, qty_sample: 0, pembayaran: "Cash" },
        { r: rokok[4], qty: 4, qty_sample: 1, pembayaran: "Cash" },
      ],
      setoran_tipe:  "Cash",
      setoran_total: 280000, // ekspektasi lebih tinggi — tidak cocok (merah)
    },
    {
      tanggal: new Date("2026-03-18"), toko: toko[1], sales: sales[3],
      keluar: [
        { r: rokok[7], qty: 30, qty_sample: 0 },
        { r: rokok[8], qty: 20, qty_sample: 0 },
        { r: rokok[9], qty:  5, qty_sample: 3 },
      ],
      masuk: [
        { r: rokok[7], qty: 28, qty_sample: 0, pembayaran: "Cash"   },
        { r: rokok[8], qty: 18, qty_sample: 0, pembayaran: "Hutang" },
        { r: rokok[9], qty:  4, qty_sample: 3, pembayaran: "Cash"   },
      ],
      setoran_tipe:  "Cash",
      // 28*21000 + 18*18000 + 4*24000 = 588000 + 324000 + 96000 = 1008000 — cocok
      get setoran_total() { return 28 * h(rokok[7], "Toko") + 18 * h(rokok[8], "Toko") + 4 * h(rokok[9], "Toko") },
    },
    {
      tanggal: new Date("2026-04-03"), toko: toko[4], sales: sales[4],
      keluar: [
        { r: rokok[0], qty: 25, qty_sample: 0 },
        { r: rokok[6], qty: 20, qty_sample: 0 },
        { r: rokok[2], qty:  5, qty_sample: 2 },
      ],
      masuk: [
        { r: rokok[0], qty: 22, qty_sample: 0, pembayaran: "Cash"     },
        { r: rokok[6], qty: 15, qty_sample: 0, pembayaran: "Cash"     },
        { r: rokok[2], qty:  4, qty_sample: 2, pembayaran: "Transfer" },
      ],
      setoran_tipe:  "Transfer",
      // 22*22000 + 15*28000 + 4*27000 = 484000 + 420000 + 108000 = 1012000 — cocok
      get setoran_total() { return 22 * h(rokok[0], "Grosir") + 15 * h(rokok[6], "Grosir") + 4 * h(rokok[2], "Grosir") },
    },
    {
      tanggal: new Date("2026-04-10"), toko: toko[0], sales: sales[0],
      keluar: [
        { r: rokok[1], qty: 20, qty_sample: 0 },
        { r: rokok[3], qty: 15, qty_sample: 2 },
      ],
      masuk: [
        { r: rokok[1], qty: 18, qty_sample: 0, pembayaran: "Hutang" },
        { r: rokok[3], qty: 12, qty_sample: 2, pembayaran: "Cash"   },
      ],
      setoran_tipe:  "Cash",
      setoran_total: 830000, // ekspektasi lebih — tidak cocok (merah)
    },

    // ── BELUM MASUK (hari ini) ────────────────────────────────────────────────
    {
      tanggal: new Date("2026-04-26"), toko: toko[1], sales: sales[1],
      keluar: [
        { r: rokok[0], qty: 20, qty_sample: 0 },
        { r: rokok[7], qty: 15, qty_sample: 3 },
      ],
      masuk: [], setoran_tipe: null, setoran_total: null,
    },
    {
      tanggal: new Date("2026-04-26"), toko: toko[2], sales: sales[2],
      keluar: [
        { r: rokok[2], qty: 30, qty_sample: 0 },
        { r: rokok[3], qty: 20, qty_sample: 2 },
      ],
      masuk: [], setoran_tipe: null, setoran_total: null,
    },
    {
      tanggal: new Date("2026-04-26"), toko: null, sales: sales[3],
      keluar: [
        { r: rokok[9], qty: 10, qty_sample: 0 },
        { r: rokok[5], qty:  8, qty_sample: 1 },
      ],
      masuk: [], setoran_tipe: null, setoran_total: null,
    },
  ]

  for (const d of penjualanData) {
    const tipe = d.toko?.tipe || null
    await prisma.penjualan.create({
      data: {
        tanggal:       d.tanggal,
        sales_id:      d.sales.id,
        toko_id:       d.toko?.id || null,
        setoran_tipe:  d.setoran_tipe,
        setoran_total: d.setoran_total,
        keluarItems: {
          create: d.keluar.map((it) => ({
            rokok_id:   it.r.id,
            qty:        it.qty,
            qty_sample: it.qty_sample || 0,
          })),
        },
        masukItems: {
          create: d.masuk.map((it) => ({
            rokok_id:   it.r.id,
            qty:        it.qty,
            qty_sample: it.qty_sample || 0,
            harga:      tipe ? h(it.r, tipe) : 0,
            pembayaran: it.pembayaran,
          })),
        },
      },
    })
  }

  // 15 Retur
  const returData = [
    { tanggal: new Date("2026-03-03"), tipe: "Toko",       sales: sales[0], alasan: "Produk rusak",   items: [{ rokok: rokok[0], qty: 2 }] },
    { tanggal: new Date("2026-03-04"), tipe: "Grosir",     sales: sales[1], alasan: "Kadaluarsa",     items: [{ rokok: rokok[2], qty: 5 }] },
    { tanggal: new Date("2026-03-06"), tipe: "Perorangan", sales: sales[2], alasan: "Salah kirim",    items: [{ rokok: rokok[4], qty: 1 }] },
    { tanggal: new Date("2026-03-08"), tipe: "Toko",       sales: sales[0], alasan: "Produk rusak",   items: [{ rokok: rokok[5], qty: 3 }] },
    { tanggal: new Date("2026-03-11"), tipe: "Grosir",     sales: sales[3], alasan: "Kelebihan stok", items: [{ rokok: rokok[7], qty: 10 }] },
    { tanggal: new Date("2026-03-13"), tipe: "Toko",       sales: sales[4], alasan: "Produk rusak",   items: [{ rokok: rokok[8], qty: 2 }, { rokok: rokok[9], qty: 1 }] },
    { tanggal: new Date("2026-03-16"), tipe: "Perorangan", sales: sales[1], alasan: "Salah kirim",    items: [{ rokok: rokok[0], qty: 1 }] },
    { tanggal: new Date("2026-03-19"), tipe: "Toko",       sales: sales[2], alasan: "Kadaluarsa",     items: [{ rokok: rokok[2], qty: 4 }] },
    { tanggal: new Date("2026-03-21"), tipe: "Grosir",     sales: sales[0], alasan: "Produk rusak",   items: [{ rokok: rokok[3], qty: 8 }] },
    { tanggal: new Date("2026-03-23"), tipe: "Toko",       sales: sales[3], alasan: "Kelebihan stok", items: [{ rokok: rokok[5], qty: 3 }] },
    { tanggal: new Date("2026-04-02"), tipe: "Toko",       sales: sales[4], alasan: "Produk rusak",   items: [{ rokok: rokok[6], qty: 2 }] },
    { tanggal: new Date("2026-04-04"), tipe: "Grosir",     sales: sales[1], alasan: "Kadaluarsa",     items: [{ rokok: rokok[8], qty: 6 }] },
    { tanggal: new Date("2026-04-06"), tipe: "Perorangan", sales: sales[2], alasan: "Salah kirim",    items: [{ rokok: rokok[9], qty: 2 }] },
    { tanggal: new Date("2026-04-09"), tipe: "Toko",       sales: sales[3], alasan: "Produk rusak",   items: [{ rokok: rokok[0], qty: 5 }, { rokok: rokok[2], qty: 3 }] },
    { tanggal: new Date("2026-04-11"), tipe: "Grosir",     sales: sales[4], alasan: "Kelebihan stok", items: [{ rokok: rokok[1], qty: 10 }] },
  ]

  for (const r of returData) {
    await prisma.retur.create({
      data: {
        tanggal:        r.tanggal,
        tipe_penjualan: r.tipe,
        sales_id:       r.sales.id,
        alasan:         r.alasan,
        items: { create: r.items.map((i) => ({ rokok_id: i.rokok.id, qty: i.qty })) },
      },
    })
  }

  // 10 Pengeluaran
  const pengeluaranData = [
    { tanggal: new Date("2026-03-02"), jumlah: 150000, keterangan: "Bensin motor sales" },
    { tanggal: new Date("2026-03-07"), jumlah: 300000, keterangan: "Biaya pengiriman" },
    { tanggal: new Date("2026-03-12"), jumlah: 50000,  keterangan: "Alat tulis kantor" },
    { tanggal: new Date("2026-03-20"), jumlah: 200000, keterangan: "Makan siang tim" },
    { tanggal: new Date("2026-03-25"), jumlah: 500000, keterangan: "Servis kendaraan" },
    { tanggal: new Date("2026-04-01"), jumlah: 150000, keterangan: "Bensin motor sales" },
    { tanggal: new Date("2026-04-05"), jumlah: 250000, keterangan: "Biaya pengiriman" },
    { tanggal: new Date("2026-04-08"), jumlah: 75000,  keterangan: "Fotokopi dokumen" },
    { tanggal: new Date("2026-04-12"), jumlah: 400000, keterangan: "Perbaikan gudang" },
    { tanggal: new Date("2026-04-15"), jumlah: 180000, keterangan: "Bensin motor sales" },
  ]

  for (const p of pengeluaranData) {
    await prisma.pengeluaran.create({ data: p })
  }

  console.log("Seed done!")
  console.log(`- 1 user admin`)
  console.log(`- ${rokok.length} rokok`)
  console.log(`- ${sales.length} sales`)
  console.log(`- ${toko.length} toko`)
  console.log(`- ${penjualanData.length} penjualan`)
  console.log(`- ${returData.length} retur`)
  console.log(`- ${pengeluaranData.length} pengeluaran`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
