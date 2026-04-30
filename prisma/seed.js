const { PrismaClient } = require("@prisma/client")
const bcrypt = require("bcryptjs")

const prisma = new PrismaClient()

async function mutateStock(tx, { rokok_id, tanggal, jenis, qty, source, reference_id = null, keterangan = null, user_id = null }) {
  await tx.stockMutation.create({
    data: {
      rokok_id,
      tanggal: new Date(tanggal),
      jenis,
      qty,
      source,
      reference_id,
      keterangan,
      user_id
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
    // ─── Clear Data ───────────────────────────────────────────────────────────
    // Order matters for relational cleanup
    await tx.stockMutation.deleteMany({})
    await tx.titipJualSetoran.deleteMany({})
    await tx.titipJualItem.deleteMany({})
    await tx.titipJual.deleteMany({})
    await tx.sesiSetoran.deleteMany({})
    await tx.sesiPenjualan.deleteMany({})
    await tx.sesiBarangKembali.deleteMany({})
    await tx.sesiBarangKeluar.deleteMany({})
    await tx.sesiHarian.deleteMany({})
    await tx.returItem.deleteMany({})
    await tx.retur.deleteMany({})
    await tx.stokMasuk.deleteMany({})
    await tx.pengeluaran.deleteMany({})
    await tx.toko.deleteMany({})
    await tx.sales.deleteMany({})
    await tx.rokok.deleteMany({})
    // We don't delete users to avoid breaking the current session if running in dev
    
    // ─── Users ────────────────────────────────────────────────────────────────
    const pass = await bcrypt.hash("admin123", 10)
    const superadmin = await tx.user.upsert({
      where: { username: "mdanihaikal" },
      update: { role: "superadmin" },
      create: { username: "mdanihaikal", password: pass, name: "M. Dani Haikal", role: "superadmin" },
    })

    // ─── Rokok ────────────────────────────────────────────────────────────────
    const rokokData = [
      { nama: "Gudang Garam Surya 12", harga_beli: 20000, harga_grosir: 22000, harga_toko: 23000, harga_perorangan: 25000, urutan: 1, stok_awal: 1000 },
      { nama: "Sampoerna A Mild 16",   harga_beli: 22000, harga_grosir: 24500, harga_toko: 25500, harga_perorangan: 27500, urutan: 2, stok_awal: 800 },
      { nama: "Dji Sam Soe 234",       harga_beli: 25000, harga_grosir: 27500, harga_toko: 28500, harga_perorangan: 30000, urutan: 3, stok_awal: 500 },
      { nama: "Marlboro Merah",        harga_beli: 29000, harga_grosir: 31000, harga_toko: 32500, harga_perorangan: 35000, urutan: 4, stok_awal: 400 },
      { nama: "LA Bold",               harga_beli: 19500, harga_grosir: 21500, harga_toko: 22500, harga_perorangan: 24500, urutan: 5, stok_awal: 600 },
      { nama: "Gudang Garam Merah",    harga_beli: 17500, harga_grosir: 19500, harga_toko: 20500, harga_perorangan: 22500, urutan: 6, stok_awal: 1200 },
    ]

    const rokok = {}
    for (const r of rokokData) {
      const item = await tx.rokok.create({
        data: {
          nama: r.nama,
          harga_beli: r.harga_beli,
          harga_grosir: r.harga_grosir,
          harga_toko: r.harga_toko,
          harga_perorangan: r.harga_perorangan,
          urutan: r.urutan,
          stok: r.stok_awal
        }
      })
      rokok[r.nama] = item
      
      const sm = await tx.stokMasuk.create({
        data: { rokok_id: item.id, qty: r.stok_awal, tanggal: new Date("2026-04-01"), keterangan: "Saldo Awal Seed" }
      })
      await mutateStock(tx, {
        rokok_id: item.id,
        tanggal: "2026-04-01",
        jenis: "in",
        qty: r.stok_awal,
        source: "stok_awal",
        reference_id: sm.id,
        keterangan: "Inisialisasi stok awal sistem",
        user_id: superadmin.id
      })
    }

    // ─── Sales & Toko ──────────────────────────────────────────────────────────
    const salesNames = ["Budi Santoso", "Agus Prasetyo", "Siti Rahayu"]
    const sales = {}
    for (const name of salesNames) {
      sales[name] = await tx.sales.create({ data: { nama: name, no_hp: "08123456789" } })
    }

    const tokoData = [
      { nama: "Toko Berkah", alamat: "Jl. Merdeka 10", kategori: "toko" },
      { nama: "Grosir Jaya", alamat: "Pasar Baru Blok A", kategori: "grosir" },
      { nama: "Warung Bu Siti", alamat: "Jl. Mawar 5", kategori: "toko" },
      { nama: "Minimarket Almaz", alamat: "Jl. Almaz 1", kategori: "toko" },
    ]
    const toko = {}
    for (const t of tokoData) {
      toko[t.nama] = await tx.toko.create({ data: t })
    }

    // ─── Pengeluaran ──────────────────────────────────────────────────────────
    const pengeluaranData = [
      { tanggal: new Date("2026-04-25"), jumlah: 50000, keterangan: "Bensin Motor Budi" },
      { tanggal: new Date("2026-04-26"), jumlah: 250000, keterangan: "Makan Siang Kantor" },
      { tanggal: new Date("2026-04-28"), jumlah: 15000, keterangan: "Parkir & Tol" },
    ]
    for (const p of pengeluaranData) await tx.pengeluaran.create({ data: p })

    // ─── Sesi Distribusi & Ledger ─────────────────────────────────────────────
    // Sesi 1: Selesai
    const tgl1 = "2026-04-28"
    const sesi1 = await tx.sesiHarian.create({
      data: {
        tanggal: new Date(tgl1),
        sales_id: sales["Budi Santoso"].id,
        status: "selesai",
        barangKeluar: { create: [{ rokok_id: rokok["Gudang Garam Surya 12"].id, qty: 50 }] },
        penjualan: { create: [{ rokok_id: rokok["Gudang Garam Surya 12"].id, kategori: "toko", qty: 45, harga: 23000 }] },
        barangKembali: { create: [{ rokok_id: rokok["Gudang Garam Surya 12"].id, qty: 5 }] },
        setoran: { create: [{ metode: "cash", jumlah: 45 * 23000 }] }
      }
    })
    await mutateStock(tx, { rokok_id: rokok["Gudang Garam Surya 12"].id, tanggal: tgl1, jenis: "out", qty: 50, source: "distribusi_sales", reference_id: sesi1.id, user_id: superadmin.id })
    await mutateStock(tx, { rokok_id: rokok["Gudang Garam Surya 12"].id, tanggal: tgl1, jenis: "in", qty: 5, source: "retur_sales", reference_id: sesi1.id, user_id: superadmin.id })

    // Sesi 2: Aktif (Sedang jalan)
    const tgl2 = "2026-04-30"
    const sesi2 = await tx.sesiHarian.create({
      data: {
        tanggal: new Date(tgl2),
        sales_id: sales["Agus Prasetyo"].id,
        status: "aktif",
        barangKeluar: {
          create: [
            { rokok_id: rokok["Sampoerna A Mild 16"].id, qty: 30 },
            { rokok_id: rokok["LA Bold"].id, qty: 20 },
          ]
        }
      }
    })
    await mutateStock(tx, { rokok_id: rokok["Sampoerna A Mild 16"].id, tanggal: tgl2, jenis: "out", qty: 30, source: "distribusi_sales", reference_id: sesi2.id, user_id: superadmin.id })
    await mutateStock(tx, { rokok_id: rokok["LA Bold"].id, tanggal: tgl2, jenis: "out", qty: 20, source: "distribusi_sales", reference_id: sesi2.id, user_id: superadmin.id })

    // ─── Titip Jual (Konsinyasi) ──────────────────────────────────────────────
    // 1. Konsinyasi Selesai
    const tj1 = await tx.titipJual.create({
      data: {
        sesi_id: sesi1.id,
        sales_id: sales["Budi Santoso"].id,
        toko_id: toko["Toko Berkah"].id,
        kategori: "toko",
        tanggal_jatuh_tempo: new Date("2026-05-05"),
        status: "selesai",
        tanggal_selesai: new Date("2026-04-29"),
        items: {
          create: [{ rokok_id: rokok["Dji Sam Soe 234"].id, qty_keluar: 10, qty_terjual: 9, qty_kembali: 1, harga: 28500 }]
        },
        setoran: { create: [{ metode: "transfer", jumlah: 9 * 28500, tanggal: new Date("2026-04-29") }] }
      }
    })
    await mutateStock(tx, { rokok_id: rokok["Dji Sam Soe 234"].id, tanggal: tgl1, jenis: "out", qty: 10, source: "distribusi_sales", reference_id: tj1.id, user_id: superadmin.id })
    await mutateStock(tx, { rokok_id: rokok["Dji Sam Soe 234"].id, tanggal: "2026-04-29", jenis: "in", qty: 1, source: "konsinyasi_kembali", reference_id: tj1.id, user_id: superadmin.id })

    // 2. Konsinyasi Aktif (Jatuh tempo dekat)
    await tx.titipJual.create({
      data: {
        sesi_id: sesi2.id,
        sales_id: sales["Agus Prasetyo"].id,
        toko_id: toko["Grosir Jaya"].id,
        kategori: "grosir",
        tanggal_jatuh_tempo: new Date("2026-05-01"), // Besok!
        status: "aktif",
        items: {
          create: [{ rokok_id: rokok["Marlboro Merah"].id, qty_keluar: 15, harga: 31000 }]
        }
      }
    })
    await mutateStock(tx, { rokok_id: rokok["Marlboro Merah"].id, tanggal: tgl2, jenis: "out", qty: 15, source: "distribusi_sales", reference_id: "tj_aktif", user_id: superadmin.id })

    // ─── Re-Sync Cache Stok ───────────────────────────────────────────────────
    const allRokok = await tx.rokok.findMany()
    for (const r of allRokok) {
      const muts = await tx.stockMutation.groupBy({
        by: ["jenis"],
        where: { rokok_id: r.id },
        _sum: { qty: true }
      })
      const totalIn = muts.find(m => m.jenis === "in")?._sum.qty || 0
      const totalOut = muts.find(m => m.jenis === "out")?._sum.qty || 0
      await tx.rokok.update({ where: { id: r.id }, data: { stok: totalIn - totalOut } })
    }
  })

  console.log("Seed Lengkap (Distribusi, Konsinyasi, Pengeluaran) Berhasil!")
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
