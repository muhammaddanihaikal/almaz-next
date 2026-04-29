const { PrismaClient } = require("@prisma/client")
const bcrypt = require("bcryptjs")

const prisma = new PrismaClient()

async function main() {
  // ─── User ─────────────────────────────────────────────────────────────────
  const superadminPass = await bcrypt.hash("jagungmanis9192", 10)
  const adminPass      = await bcrypt.hash("WedangJahe15!", 10)
  const staffPass      = await bcrypt.hash("staff123", 10)
  await prisma.user.upsert({
    where:  { username: "mdanihaikal" },
    update: { role: "superadmin" },
    create: { username: "mdanihaikal", password: superadminPass, name: "M. Dani Haikal", role: "superadmin" },
  })
  await prisma.user.upsert({
    where:  { username: "alwin" },
    update: { role: "admin" },
    create: { username: "alwin", password: adminPass, name: "Alwin", role: "admin" },
  })
  await prisma.user.upsert({
    where:  { username: "staff" },
    update: { role: "staff" },
    create: { username: "staff", password: staffPass, name: "Staff", role: "staff" },
  })

  // ─── Rokok ────────────────────────────────────────────────────────────────
  const rokokData = [
    { nama: "Gudang Garam Surya 12", harga_beli: 20000, harga_grosir: 22000, harga_toko: 23000, harga_perorangan: 25000, stok: 500 },
    { nama: "Sampoerna A Mild 16",   harga_beli: 22000, harga_grosir: 24000, harga_toko: 25000, harga_perorangan: 27000, stok: 400 },
    { nama: "Dji Sam Soe 234",       harga_beli: 25000, harga_grosir: 27000, harga_toko: 28000, harga_perorangan: 30000, stok: 350 },
    { nama: "Marlboro Merah",        harga_beli: 28000, harga_grosir: 30000, harga_toko: 32000, harga_perorangan: 35000, stok: 300 },
    { nama: "LA Bold",               harga_beli: 19000, harga_grosir: 21000, harga_toko: 22000, harga_perorangan: 24000, stok: 450 },
    { nama: "Gudang Garam Merah",    harga_beli: 18000, harga_grosir: 20000, harga_toko: 21000, harga_perorangan: 23000, stok: 600 },
    { nama: "Sampoerna Kretek",      harga_beli: 15000, harga_grosir: 17000, harga_toko: 18000, harga_perorangan: 20000, stok: 700 },
  ]

  const rokok = []
  for (const r of rokokData) {
    const item = await prisma.rokok.upsert({ where: { nama: r.nama }, update: {}, create: r })
    rokok.push(item)
  }

  // ─── Sales ────────────────────────────────────────────────────────────────
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

  // ─── Toko ─────────────────────────────────────────────────────────────────
  const tokoData = [
    { nama: "Toko Maju Jaya",      alamat: "Jl. Maju No. 1",      kategori: "toko"   },
    { nama: "Grosir Makmur",       alamat: "Pasar Besar No. 5",    kategori: "grosir" },
    { nama: "Toko Berkah Mandiri", alamat: "Jl. Berkah No. 3",     kategori: "toko"   },
    { nama: "Toko Sumber Rezeki",  alamat: "Jl. Sumber No. 7",     kategori: "toko"   },
    { nama: "Toko Agung Sejahtera",alamat: "Jl. Agung No. 9",      kategori: "grosir" },
  ]

  const toko = []
  for (const t of tokoData) {
    const item = await prisma.toko.upsert({ where: { nama: t.nama }, update: {}, create: t })
    toko.push(item)
  }

  // ─── Pengeluaran ──────────────────────────────────────────────────────────
  const pengeluaranData = [
    { tanggal: new Date("2026-03-02"), jumlah: 150000, keterangan: "Bensin motor sales" },
    { tanggal: new Date("2026-03-07"), jumlah: 300000, keterangan: "Biaya pengiriman" },
    { tanggal: new Date("2026-03-12"), jumlah:  50000, keterangan: "Alat tulis kantor" },
    { tanggal: new Date("2026-03-20"), jumlah: 200000, keterangan: "Makan siang tim" },
    { tanggal: new Date("2026-03-25"), jumlah: 500000, keterangan: "Servis kendaraan" },
    { tanggal: new Date("2026-04-01"), jumlah: 150000, keterangan: "Bensin motor sales" },
    { tanggal: new Date("2026-04-05"), jumlah: 250000, keterangan: "Biaya pengiriman" },
    { tanggal: new Date("2026-04-08"), jumlah:  75000, keterangan: "Fotokopi dokumen" },
    { tanggal: new Date("2026-04-12"), jumlah: 400000, keterangan: "Perbaikan gudang" },
    { tanggal: new Date("2026-04-15"), jumlah: 180000, keterangan: "Bensin motor sales" },
  ]
  for (const p of pengeluaranData) {
    await prisma.pengeluaran.create({ data: p })
  }

  // ─── Sesi Harian (selesai — data lama) ────────────────────────────────────
  const sesiLama = [
    {
      tanggal: new Date("2026-03-10"), sales_id: sales[0].id, status: "selesai",
      keluar:  [{ r: rokok[0], qty: 20 }, { r: rokok[5], qty: 15 }],
      penjualan: [
        { r: rokok[0], kategori: "grosir", qty: 10 },
        { r: rokok[0], kategori: "toko",   qty:  8 },
        { r: rokok[5], kategori: "toko",   qty: 12 },
      ],
      setoran:  [{ metode: "cash", jumlah: 10 * 22000 + 8 * 21000 + 12 * 21000 }],
      kembali:  [{ r: rokok[0], qty: 2 }, { r: rokok[5], qty: 3 }],
    },
    {
      tanggal: new Date("2026-03-18"), sales_id: sales[1].id, status: "selesai",
      keluar:  [{ r: rokok[1], qty: 25 }, { r: rokok[2], qty: 10 }],
      penjualan: [
        { r: rokok[1], kategori: "grosir", qty: 20 },
        { r: rokok[2], kategori: "grosir", qty:  8 },
      ],
      setoran:  [{ metode: "transfer", jumlah: 20 * 24000 + 8 * 27000 }],
      kembali:  [{ r: rokok[1], qty: 5 }, { r: rokok[2], qty: 2 }],
    },
    {
      tanggal: new Date("2026-04-05"), sales_id: sales[2].id, status: "selesai",
      keluar:  [{ r: rokok[3], qty: 15 }, { r: rokok[4], qty: 20 }],
      penjualan: [
        { r: rokok[3], kategori: "toko",   qty: 10 },
        { r: rokok[4], kategori: "toko",   qty: 15 },
        { r: rokok[4], kategori: "grosir", qty:  3 },
      ],
      setoran:  [
        { metode: "cash",     jumlah: 10 * 32000 + 15 * 22000 },
        { metode: "transfer", jumlah:  3 * 21000 },
      ],
      kembali:  [{ r: rokok[3], qty: 5 }, { r: rokok[4], qty: 2 }],
    },
    {
      tanggal: new Date("2026-04-12"), sales_id: sales[3].id, status: "selesai",
      keluar:  [{ r: rokok[0], qty: 30 }, { r: rokok[6], qty: 25 }],
      penjualan: [
        { r: rokok[0], kategori: "grosir", qty: 25 },
        { r: rokok[6], kategori: "toko",   qty: 20 },
      ],
      setoran:  [{ metode: "cash", jumlah: 25 * 22000 + 20 * 18000 }],
      kembali:  [{ r: rokok[0], qty: 5 }, { r: rokok[6], qty: 5 }],
    },
    {
      tanggal: new Date("2026-04-20"), sales_id: sales[4].id, status: "selesai",
      keluar:  [{ r: rokok[1], qty: 20 }, { r: rokok[5], qty: 20 }],
      penjualan: [
        { r: rokok[1], kategori: "toko",   qty: 15 },
        { r: rokok[5], kategori: "grosir", qty: 18 },
      ],
      setoran:  [{ metode: "cash", jumlah: 300000 }],
      kembali:  [{ r: rokok[1], qty: 5 }, { r: rokok[5], qty: 2 }],
    },
  ]

  for (const s of sesiLama) {
    await prisma.sesiHarian.create({
      data: {
        tanggal:  s.tanggal,
        sales_id: s.sales_id,
        status:   s.status,
        barangKeluar: {
          create: s.keluar.map((it) => ({ rokok_id: it.r.id, qty: it.qty })),
        },
        penjualan: {
          create: s.penjualan.map((it) => ({
            rokok_id: it.r.id,
            kategori: it.kategori,
            qty:      it.qty,
            harga:    it.kategori === "grosir" ? it.r.harga_grosir : it.kategori === "toko" ? it.r.harga_toko : it.r.harga_perorangan,
          })),
        },
        setoran: {
          create: s.setoran,
        },
        barangKembali: {
          create: s.kembali.map((it) => ({ rokok_id: it.r.id, qty: it.qty })),
        },
      },
    })
  }

  // ─── Sesi Harian hari ini (aktif — belum laporan sore) ────────────────────
  const today = new Date("2026-04-26")
  const sesiAktif = [
    {
      sales_id: sales[0].id,
      keluar: [{ r: rokok[0], qty: 20 }, { r: rokok[1], qty: 15 }],
    },
    {
      sales_id: sales[1].id,
      keluar: [{ r: rokok[2], qty: 25 }, { r: rokok[5], qty: 20 }],
    },
    {
      sales_id: sales[2].id,
      keluar: [{ r: rokok[3], qty: 15 }, { r: rokok[4], qty: 10 }, { r: rokok[6], qty: 12 }],
    },
  ]

  const sesiAktifCreated = []
  for (const s of sesiAktif) {
    const created = await prisma.sesiHarian.create({
      data: {
        tanggal:  today,
        sales_id: s.sales_id,
        status:   "aktif",
        barangKeluar: {
          create: s.keluar.map((it) => ({ rokok_id: it.r.id, qty: it.qty })),
        },
      },
    })
    sesiAktifCreated.push(created)
  }

  // ─── Konsinyasi ───────────────────────────────────────────────────────────
  const sesiLama0 = await prisma.sesiHarian.findFirst({ where: { sales_id: sales[0].id, tanggal: new Date("2026-03-10") } })
  const sesiLama1 = await prisma.sesiHarian.findFirst({ where: { sales_id: sales[1].id, tanggal: new Date("2026-03-18") } })

  // Selesai
  await prisma.titipJual.create({
    data: {
      sesi_id:             sesiLama0?.id ?? sesiAktifCreated[0].id,
      sales_id:            sales[0].id,
      toko_id:             toko[0].id,
      kategori:            "toko",
      tanggal_jatuh_tempo: new Date("2026-03-20"),
      status:              "selesai",
      items: {
        create: [
          { rokok_id: rokok[0].id, qty_keluar: 10, qty_terjual: 8, qty_kembali: 2, harga: rokok[0].harga_toko },
          { rokok_id: rokok[5].id, qty_keluar:  5, qty_terjual: 5, qty_kembali: 0, harga: rokok[5].harga_toko },
        ],
      },
      setoran: {
        create: [{ metode: "cash", jumlah: 8 * rokok[0].harga_toko + 5 * rokok[5].harga_toko, tanggal: new Date("2026-03-20") }],
      },
    },
  })

  await prisma.titipJual.create({
    data: {
      sesi_id:             sesiLama1?.id ?? sesiAktifCreated[1].id,
      sales_id:            sales[1].id,
      toko_id:             toko[1].id,
      kategori:            "grosir",
      tanggal_jatuh_tempo: new Date("2026-04-10"),
      status:              "selesai",
      items: {
        create: [
          { rokok_id: rokok[1].id, qty_keluar: 15, qty_terjual: 12, qty_kembali: 3, harga: rokok[1].harga_grosir },
        ],
      },
      setoran: {
        create: [{ metode: "transfer", jumlah: 12 * rokok[1].harga_grosir, tanggal: new Date("2026-04-10") }],
      },
    },
  })

  // Aktif — sudah jatuh tempo (merah di dashboard)
  await prisma.titipJual.create({
    data: {
      sesi_id:             sesiAktifCreated[0].id,
      sales_id:            sales[0].id,
      toko_id:             toko[2].id,
      kategori:            "toko",
      tanggal_jatuh_tempo: new Date("2026-04-24"),
      status:              "aktif",
      items: {
        create: [
          { rokok_id: rokok[0].id, qty_keluar: 12, qty_terjual: 0, qty_kembali: 0, harga: rokok[0].harga_toko },
          { rokok_id: rokok[1].id, qty_keluar:  8, qty_terjual: 0, qty_kembali: 0, harga: rokok[1].harga_toko },
        ],
      },
    },
  })

  // Aktif — jatuh tempo 2 hari lagi (kuning di dashboard)
  await prisma.titipJual.create({
    data: {
      sesi_id:             sesiAktifCreated[1].id,
      sales_id:            sales[1].id,
      toko_id:             toko[3].id,
      kategori:            "toko",
      tanggal_jatuh_tempo: new Date("2026-04-28"),
      status:              "aktif",
      items: {
        create: [
          { rokok_id: rokok[2].id, qty_keluar: 10, qty_terjual: 0, qty_kembali: 0, harga: rokok[2].harga_toko },
        ],
      },
    },
  })

  // Aktif — jatuh tempo 7 hari lagi (normal)
  await prisma.titipJual.create({
    data: {
      sesi_id:             sesiAktifCreated[2].id,
      sales_id:            sales[2].id,
      toko_id:             toko[4].id,
      kategori:            "grosir",
      tanggal_jatuh_tempo: new Date("2026-05-03"),
      status:              "aktif",
      items: {
        create: [
          { rokok_id: rokok[3].id, qty_keluar: 8, qty_terjual: 0, qty_kembali: 0, harga: rokok[3].harga_grosir },
          { rokok_id: rokok[4].id, qty_keluar: 6, qty_terjual: 0, qty_kembali: 0, harga: rokok[4].harga_grosir },
        ],
      },
    },
  })

  console.log("Seed selesai!")
  console.log(`- 3 user: mdanihaikal (superadmin), alwin/WedangJahe15!, staff/staff123`)
  console.log(`- ${rokok.length} rokok`)
  console.log(`- ${sales.length} sales`)
  console.log(`- ${toko.length} toko`)
  console.log(`- ${sesiLama.length} sesi selesai + ${sesiAktif.length} sesi aktif hari ini`)
  console.log(`- 5 titip jual (2 selesai, 3 aktif)`)
  console.log(`- ${pengeluaranData.length} pengeluaran`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
