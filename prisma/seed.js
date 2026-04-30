const { PrismaClient } = require("@prisma/client")
const bcrypt = require("bcryptjs")

const prisma = new PrismaClient()

async function mutateStock(tx, { rokok_id, tanggal, jenis, qty, source, reference_id = null }) {
  await tx.stockMutation.create({
    data: {
      rokok_id,
      tanggal: new Date(tanggal),
      jenis,
      qty,
      source,
      reference_id
    }
  })
}

async function updateStockCache(tx, rokok_id) {
  const mutations = await tx.stockMutation.groupBy({
    by: ['jenis'],
    where: { rokok_id },
    _sum: { qty: true }
  })
  
  let totalIn = 0;
  let totalOut = 0;
  mutations.forEach(m => {
    if (m.jenis === 'in') totalIn += m._sum.qty || 0;
    if (m.jenis === 'out') totalOut += m._sum.qty || 0;
  });

  await tx.rokok.update({
    where: { id: rokok_id },
    data: { stok: totalIn - totalOut }
  })
}

async function main() {
  await prisma.$transaction(async (tx) => {
    // ─── Clear Data (Optional, but good for fresh seed) ─────────────
    await tx.stockMutation.deleteMany({})

    // ─── User ─────────────────────────────────────────────────────────────────
    const superadminPass = await bcrypt.hash("jagungmanis9192", 10)
    const adminPass      = await bcrypt.hash("WedangJahe15!", 10)
    const staffPass      = await bcrypt.hash("staff123", 10)
    
    await tx.user.upsert({
      where:  { username: "mdanihaikal" },
      update: { role: "superadmin" },
      create: { username: "mdanihaikal", password: superadminPass, name: "M. Dani Haikal", role: "superadmin" },
    })
    await tx.user.upsert({
      where:  { username: "alwin" },
      update: { role: "admin" },
      create: { username: "alwin", password: adminPass, name: "Alwin", role: "admin" },
    })
    await tx.user.upsert({
      where:  { username: "staff" },
      update: { role: "staff" },
      create: { username: "staff", password: staffPass, name: "Staff", role: "staff" },
    })

    // ─── Rokok ────────────────────────────────────────────────────────────────
    const rokokData = [
      { nama: "Gudang Garam Surya 12", harga_beli: 20000, harga_grosir: 22000, harga_toko: 23000, harga_perorangan: 25000, stok_awal: 500, urutan: 1 },
      { nama: "Sampoerna A Mild 16",   harga_beli: 22000, harga_grosir: 24000, harga_toko: 25000, harga_perorangan: 27000, stok_awal: 400, urutan: 2 },
      { nama: "Dji Sam Soe 234",       harga_beli: 25000, harga_grosir: 27000, harga_toko: 28000, harga_perorangan: 30000, stok_awal: 350, urutan: 3 },
      { nama: "Marlboro Merah",        harga_beli: 28000, harga_grosir: 30000, harga_toko: 32000, harga_perorangan: 35000, stok_awal: 300, urutan: 4 },
      { nama: "LA Bold",               harga_beli: 19000, harga_grosir: 21000, harga_toko: 22000, harga_perorangan: 24000, stok_awal: 450, urutan: 5 },
      { nama: "Gudang Garam Merah",    harga_beli: 18000, harga_grosir: 20000, harga_toko: 21000, harga_perorangan: 23000, stok_awal: 600, urutan: 6 },
      { nama: "Sampoerna Kretek",      harga_beli: 15000, harga_grosir: 17000, harga_toko: 18000, harga_perorangan: 20000, stok_awal: 700, urutan: 7 },
    ]

    const rokok = []
    for (const r of rokokData) {
      let item = await tx.rokok.findUnique({ where: { nama: r.nama } })
      if (!item) {
        item = await tx.rokok.create({
          data: {
            nama: r.nama,
            harga_beli: r.harga_beli,
            harga_grosir: r.harga_grosir,
            harga_toko: r.harga_toko,
            harga_perorangan: r.harga_perorangan,
            urutan: r.urutan,
            stok: r.stok_awal // temporary
          }
        })
        
        // Add initial stock mutation
        const sm = await tx.stokMasuk.create({
          data: {
            rokok_id: item.id,
            qty: r.stok_awal,
            tanggal: new Date("2026-01-01"),
            keterangan: "Stok Awal Seed"
          }
        })
        await mutateStock(tx, {
          rokok_id: item.id,
          tanggal: new Date("2026-01-01"),
          jenis: 'in',
          qty: r.stok_awal,
          source: 'supplier',
          reference_id: sm.id
        })
        await updateStockCache(tx, item.id)
      }
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
      const item = await tx.sales.upsert({ where: { nama: s.nama }, update: {}, create: s })
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
      const item = await tx.toko.upsert({ where: { nama: t.nama }, update: {}, create: t })
      toko.push(item)
    }

    // ─── Pengeluaran ──────────────────────────────────────────────────────────
    // (Skip recreating if already exists, just create roughly)
    const pengeluaranCount = await tx.pengeluaran.count()
    if (pengeluaranCount === 0) {
      const pengeluaranData = [
        { tanggal: new Date("2026-03-02"), jumlah: 150000, keterangan: "Bensin motor sales" },
        { tanggal: new Date("2026-03-07"), jumlah: 300000, keterangan: "Biaya pengiriman" },
        { tanggal: new Date("2026-03-12"), jumlah:  50000, keterangan: "Alat tulis kantor" },
        { tanggal: new Date("2026-03-20"), jumlah: 200000, keterangan: "Makan siang tim" },
      ]
      for (const p of pengeluaranData) {
        await tx.pengeluaran.create({ data: p })
      }
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
      }
    ]

    for (const s of sesiLama) {
      // Check if exists
      const exist = await tx.sesiHarian.findFirst({ where: { tanggal: s.tanggal, sales_id: s.sales_id } })
      if (!exist) {
        const sesi = await tx.sesiHarian.create({
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
          include: { barangKeluar: true, barangKembali: true }
        })

        // Mutations for barang keluar
        for (const bk of sesi.barangKeluar) {
          await mutateStock(tx, { rokok_id: bk.rokok_id, tanggal: s.tanggal, jenis: 'out', qty: bk.qty, source: 'distribusi_sales', reference_id: sesi.id })
          await updateStockCache(tx, bk.rokok_id)
        }
        
        // Mutations for barang kembali
        for (const bk of sesi.barangKembali) {
          await mutateStock(tx, { rokok_id: bk.rokok_id, tanggal: s.tanggal, jenis: 'in', qty: bk.qty, source: 'retur_sales', reference_id: sesi.id })
          await updateStockCache(tx, bk.rokok_id)
        }
      }
    }

    // ─── Titip Jual (Selesai & Aktif) ──────────────────────────────────────────
    const tjExist = await tx.titipJual.count()
    if (tjExist === 0) {
      const sesiLama0 = await tx.sesiHarian.findFirst({ where: { sales_id: sales[0].id, tanggal: new Date("2026-03-10") } })
      
      const tj1 = await tx.titipJual.create({
        data: {
          sesi_id:             sesiLama0.id,
          sales_id:            sales[0].id,
          toko_id:             toko[0].id,
          kategori:            "toko",
          tanggal_jatuh_tempo: new Date("2026-03-20"),
          status:              "selesai",
          items: {
            create: [
              { rokok_id: rokok[0].id, qty_keluar: 10, qty_terjual: 8, qty_kembali: 2, harga: rokok[0].harga_toko },
            ],
          },
          setoran: {
            create: [{ metode: "cash", jumlah: 8 * rokok[0].harga_toko, tanggal: new Date("2026-03-20") }],
          },
        },
        include: { items: true }
      })

      // Add mutation
      for (const item of tj1.items) {
        await mutateStock(tx, { rokok_id: item.rokok_id, tanggal: tj1.createdAt, jenis: 'out', qty: item.qty_keluar, source: 'distribusi_sales', reference_id: tj1.id })
        await mutateStock(tx, { rokok_id: item.rokok_id, tanggal: tj1.createdAt, jenis: 'in', qty: item.qty_kembali, source: 'konsinyasi_kembali', reference_id: tj1.id })
        await updateStockCache(tx, item.rokok_id)
      }
    }
  })

  console.log("Seed (dengan ledger mutations) selesai!")
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
