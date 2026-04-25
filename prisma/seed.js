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

  // Helper harga per tipe
  const harga = (r, tipe) => tipe === "Toko" ? r.harga_toko : tipe === "Grosir" ? r.harga_grosir : r.harga_perorangan

  // 9 Penjualan (6 Lengkap + 3 Belum Masuk hari ini)
  // Setoran: 4 cocok (hijau), 2 tidak cocok (merah), 3 belum masuk (kuning)
  const penjualanData = [
    // ── LENGKAP ──────────────────────────────────────────────────────────────
    {
      tanggal: new Date("2026-03-01"), tipe: "Toko", sales: sales[0],
      keluar: [
        { r: rokok[0], qty: 15, is_sample: false },
        { r: rokok[1], qty: 10, is_sample: false },
        { r: rokok[7], qty:  3, is_sample: true  }, // GG Merah sample
      ],
      masuk: [
        { r: rokok[0], qty: 12, pembayaran: "Cash",   is_sample: false },
        { r: rokok[1], qty:  8, pembayaran: "Hutang", is_sample: false },
        { r: rokok[7], qty:  3, pembayaran: "Cash",   is_sample: true  },
      ],
      setoran_tipe:  "Cash",
      setoran_total: 12 * 23000 + 8 * 25000, // 476.000 — cocok
    },
    {
      tanggal: new Date("2026-03-05"), tipe: "Grosir", sales: sales[1],
      keluar: [
        { r: rokok[2], qty: 20, is_sample: false },
        { r: rokok[3], qty: 15, is_sample: false },
        { r: rokok[4], qty:  2, is_sample: true  }, // Camel sample
      ],
      masuk: [
        { r: rokok[2], qty: 18, pembayaran: "Cash", is_sample: false },
        { r: rokok[3], qty: 12, pembayaran: "Cash", is_sample: false },
        { r: rokok[4], qty:  2, pembayaran: "Cash", is_sample: true  },
      ],
      setoran_tipe:  "Transfer",
      setoran_total: 18 * 27000 + 12 * 30000, // 846.000 — cocok
    },
    {
      tanggal: new Date("2026-03-10"), tipe: "Perorangan", sales: sales[2],
      keluar: [
        { r: rokok[5], qty:  8, is_sample: false },
        { r: rokok[4], qty:  5, is_sample: false },
        { r: rokok[6], qty:  1, is_sample: true  }, // Dunhill sample
      ],
      masuk: [
        { r: rokok[5], qty: 7, pembayaran: "Cash", is_sample: false },
        { r: rokok[4], qty: 4, pembayaran: "Cash", is_sample: false },
        { r: rokok[6], qty: 1, pembayaran: "Cash", is_sample: true  },
      ],
      setoran_tipe:  "Cash",
      setoran_total: 280000, // ekspektasi 284.000 — kurang 4.000 (merah)
    },
    {
      tanggal: new Date("2026-03-18"), tipe: "Toko", sales: sales[3],
      keluar: [
        { r: rokok[7], qty: 30, is_sample: false },
        { r: rokok[8], qty: 20, is_sample: false },
        { r: rokok[9], qty:  3, is_sample: true  }, // Wismilak sample
      ],
      masuk: [
        { r: rokok[7], qty: 28, pembayaran: "Cash",   is_sample: false },
        { r: rokok[8], qty: 18, pembayaran: "Hutang", is_sample: false },
        { r: rokok[9], qty:  3, pembayaran: "Cash",   is_sample: true  },
      ],
      setoran_tipe:  "Cash",
      setoran_total: 28 * 21000 + 18 * 18000, // 912.000 — cocok
    },
    {
      tanggal: new Date("2026-04-03"), tipe: "Grosir", sales: sales[4],
      keluar: [
        { r: rokok[0], qty: 25, is_sample: false },
        { r: rokok[6], qty: 20, is_sample: false },
        { r: rokok[2], qty:  2, is_sample: true  }, // DSS sample
      ],
      masuk: [
        { r: rokok[0], qty: 22, pembayaran: "Cash", is_sample: false },
        { r: rokok[6], qty: 15, pembayaran: "Cash", is_sample: false },
        { r: rokok[2], qty:  2, pembayaran: "Cash", is_sample: true  },
      ],
      setoran_tipe:  "Transfer",
      setoran_total: 22 * 22000 + 15 * 28000, // 904.000 — cocok
    },
    {
      tanggal: new Date("2026-04-10"), tipe: "Toko", sales: sales[0],
      keluar: [
        { r: rokok[1], qty: 20, is_sample: false },
        { r: rokok[3], qty: 15, is_sample: false },
        { r: rokok[5], qty:  2, is_sample: true  }, // LA Bold sample
      ],
      masuk: [
        { r: rokok[1], qty: 18, pembayaran: "Hutang", is_sample: false },
        { r: rokok[3], qty: 12, pembayaran: "Cash",   is_sample: false },
        { r: rokok[5], qty:  2, pembayaran: "Cash",   is_sample: true  },
      ],
      setoran_tipe:  "Cash",
      setoran_total: 830000, // ekspektasi 834.000 — kurang 4.000 (merah)
    },

    // ── BELUM MASUK (hari ini) ────────────────────────────────────────────────
    {
      tanggal: new Date("2026-04-26"), tipe: "Toko", sales: sales[1],
      keluar: [
        { r: rokok[0], qty: 20, is_sample: false },
        { r: rokok[7], qty: 15, is_sample: false },
        { r: rokok[8], qty:  3, is_sample: true  }, // Sampoerna Kretek sample
      ],
      masuk: [], setoran_tipe: null, setoran_total: null,
    },
    {
      tanggal: new Date("2026-04-26"), tipe: "Grosir", sales: sales[2],
      keluar: [
        { r: rokok[2], qty: 30, is_sample: false },
        { r: rokok[3], qty: 20, is_sample: false },
        { r: rokok[4], qty:  2, is_sample: true  }, // Camel sample
      ],
      masuk: [], setoran_tipe: null, setoran_total: null,
    },
    {
      tanggal: new Date("2026-04-26"), tipe: "Perorangan", sales: sales[3],
      keluar: [
        { r: rokok[9], qty: 10, is_sample: false },
        { r: rokok[5], qty:  8, is_sample: false },
        { r: rokok[6], qty:  1, is_sample: true  }, // Dunhill sample
      ],
      masuk: [], setoran_tipe: null, setoran_total: null,
    },
  ]

  for (const d of penjualanData) {
    await prisma.penjualan.create({
      data: {
        tanggal:        d.tanggal,
        tipe_penjualan: d.tipe,
        sales_id:       d.sales.id,
        setoran_tipe:   d.setoran_tipe,
        setoran_total:  d.setoran_total,
        keluarItems: {
          create: d.keluar.map((it) => ({
            rokok_id:  it.r.id,
            qty:       it.qty,
            is_sample: it.is_sample,
          })),
        },
        masukItems: {
          create: d.masuk.map((it) => ({
            rokok_id:   it.r.id,
            qty:        it.qty,
            harga:      it.is_sample ? 0 : harga(it.r, d.tipe),
            pembayaran: it.pembayaran,
            is_sample:  it.is_sample,
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

  console.log("Seed done!")
  console.log(`- 1 user admin`)
  console.log(`- ${rokok.length} rokok`)
  console.log(`- ${sales.length} sales`)
  console.log(`- ${penjualanData.length} penjualan (${penjualanData.filter(d => d.masuk.length > 0).length} lengkap, ${penjualanData.filter(d => d.masuk.length === 0).length} belum masuk)`)
  console.log(`- ${returData.length} retur`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
