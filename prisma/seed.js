const { PrismaClient } = require("@prisma/client")
const bcrypt = require("bcryptjs")

const prisma = new PrismaClient()

async function main() {
  await prisma.$transaction(async (tx) => {
    // ─── Clear Data ───────────────────────────────────────────────────────────
    await tx.auditLog.deleteMany({})
    await tx.closingHarian.deleteMany({})
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
    await tx.absensi.deleteMany({})
    await tx.stokMasuk.deleteMany({})
    await tx.pengeluaran.deleteMany({})
    await tx.toko.deleteMany({})
    await tx.sales.deleteMany({})
    await tx.rokok.deleteMany({})

    // ─── Users ────────────────────────────────────────────────────────────────
    const pass = await bcrypt.hash("admin123", 10)
    const superadmin = await tx.user.upsert({
      where:  { username: "mdanihaikal" },
      update: { role: "superadmin", name: "M. Dani Haikal" },
      create: { username: "mdanihaikal", password: pass, name: "M. Dani Haikal", role: "superadmin" },
    })
    const admin = await tx.user.upsert({
      where:  { username: "bossalmaz" },
      update: { role: "admin", name: "Boss Almaz" },
      create: { username: "bossalmaz", password: pass, name: "Boss Almaz", role: "admin" },
    })
    await tx.user.upsert({
      where:  { username: "kasir01" },
      update: { role: "staff", name: "Kasir Satu" },
      create: { username: "kasir01", password: pass, name: "Kasir Satu", role: "staff" },
    })
    await tx.user.upsert({
      where:  { username: "manager01" },
      update: { role: "admin", name: "Manager Gudang" },
      create: { username: "manager01", password: pass, name: "Manager Gudang", role: "admin" },
    })
    await tx.user.upsert({
      where:  { username: "staff02" },
      update: { role: "staff", name: "Staff Dua" },
      create: { username: "staff02", password: pass, name: "Staff Dua", role: "staff" },
    })

    // ─── Rokok ────────────────────────────────────────────────────────────────
    const rokokData = [
      { nama: "Gudang Garam Surya 12", harga_beli: 20000, harga_grosir: 22000, harga_toko: 23000, harga_perorangan: 25000, urutan: 1, stok_awal: 1000 },
      { nama: "Sampoerna A Mild 16",   harga_beli: 22000, harga_grosir: 24500, harga_toko: 25500, harga_perorangan: 27500, urutan: 2, stok_awal: 800  },
      { nama: "Dji Sam Soe 234",       harga_beli: 25000, harga_grosir: 27500, harga_toko: 28500, harga_perorangan: 30000, urutan: 3, stok_awal: 500  },
      { nama: "Marlboro Merah",        harga_beli: 29000, harga_grosir: 31000, harga_toko: 32500, harga_perorangan: 35000, urutan: 4, stok_awal: 400  },
      { nama: "LA Bold",               harga_beli: 19500, harga_grosir: 21500, harga_toko: 22500, harga_perorangan: 24500, urutan: 5, stok_awal: 600  },
      { nama: "Gudang Garam Merah",    harga_beli: 17500, harga_grosir: 19500, harga_toko: 20500, harga_perorangan: 22500, urutan: 6, stok_awal: 1200 },
      { nama: "Camel Filter",          harga_beli: 24000, harga_grosir: 26000, harga_toko: 27000, harga_perorangan: 29000, urutan: 7, stok_awal: 300  },
      { nama: "Dunhill Filter",        harga_beli: 26000, harga_grosir: 28000, harga_toko: 29500, harga_perorangan: 32000, urutan: 8, stok_awal: 350  },
    ]

    const rokok = {}
    for (const r of rokokData) {
      const item = await tx.rokok.create({
        data: {
          nama: r.nama, harga_beli: r.harga_beli, harga_grosir: r.harga_grosir,
          harga_toko: r.harga_toko, harga_perorangan: r.harga_perorangan,
          urutan: r.urutan, stok: 0,
        },
      })
      rokok[r.nama] = item

      const sm = await tx.stokMasuk.create({
        data: { rokok_id: item.id, qty: r.stok_awal, tanggal: new Date("2026-04-01"), keterangan: "Saldo Awal" },
      })
      await tx.stockMutation.create({
        data: { rokok_id: item.id, tanggal: new Date("2026-04-01"), jenis: "in", qty: r.stok_awal, source: "stok_awal", reference_id: sm.id, keterangan: "Saldo awal sistem", user_id: superadmin.id },
      })
    }

    // ─── Stok Masuk Supplier ──────────────────────────────────────────────────
    // Batch Apr 10
    for (const [nama, qty] of [
      ["Gudang Garam Surya 12", 500],
      ["Sampoerna A Mild 16",   400],
      ["LA Bold",               200],
      ["Gudang Garam Merah",    600],
    ]) {
      const sm = await tx.stokMasuk.create({
        data: { rokok_id: rokok[nama].id, qty, tanggal: new Date("2026-04-10"), keterangan: "Pembelian Supplier - Batch April I" },
      })
      await tx.stockMutation.create({
        data: { rokok_id: rokok[nama].id, tanggal: new Date("2026-04-10"), jenis: "in", qty, source: "stok_awal", reference_id: sm.id, keterangan: "Batch April I", user_id: superadmin.id },
      })
    }

    // Batch Apr 20
    for (const [nama, qty] of [
      ["Dji Sam Soe 234", 200],
      ["Marlboro Merah",  150],
      ["Camel Filter",    200],
      ["Dunhill Filter",  200],
    ]) {
      const sm = await tx.stokMasuk.create({
        data: { rokok_id: rokok[nama].id, qty, tanggal: new Date("2026-04-20"), keterangan: "Pembelian Supplier - Batch April II" },
      })
      await tx.stockMutation.create({
        data: { rokok_id: rokok[nama].id, tanggal: new Date("2026-04-20"), jenis: "in", qty, source: "stok_awal", reference_id: sm.id, keterangan: "Batch April II", user_id: superadmin.id },
      })
    }

    // ─── Sales ────────────────────────────────────────────────────────────────
    const salesMap = {}
    for (const [nama, no_hp] of [
      ["Budi Santoso",  "081234567890"],
      ["Agus Prasetyo", "081234567891"],
      ["Siti Rahayu",   "081234567892"],
      ["Hendra Kusuma", "081234567893"],
      ["Dian Safitri",  "081234567894"],
    ]) {
      salesMap[nama] = await tx.sales.create({ data: { nama, no_hp } })
    }

    // ─── Toko ─────────────────────────────────────────────────────────────────
    const tokoMap = {}
    for (const t of [
      { nama: "Toko Berkah",       alamat: "Jl. Merdeka No. 10",     kategori: "toko"   },
      { nama: "Grosir Jaya",       alamat: "Pasar Baru Blok A-12",   kategori: "grosir" },
      { nama: "Warung Bu Siti",    alamat: "Jl. Mawar No. 5",        kategori: "toko"   },
      { nama: "Minimarket Almaz",  alamat: "Jl. Almaz Raya No. 1",   kategori: "toko"   },
      { nama: "Toko Murah Meriah", alamat: "Jl. Pahlawan No. 22",    kategori: "toko"   },
      { nama: "Grosir Sentral",    alamat: "Pasar Induk Blok D-3",   kategori: "grosir" },
    ]) {
      tokoMap[t.nama] = await tx.toko.create({ data: t })
    }

    // ─── Absensi (Apr 18 – May 1, 5 sales) ───────────────────────────────────
    const exceptions = {
      "Budi Santoso":   { "2026-04-20": "izin",  "2026-04-23": "izin",  "2026-04-27": "sakit" },
      "Agus Prasetyo":  { "2026-04-20": "sakit", "2026-04-22": "izin",  "2026-04-25": "sakit" },
      "Siti Rahayu":    { "2026-04-22": "izin",  "2026-04-23": "alpha", "2026-04-29": "izin"  },
      "Hendra Kusuma":  { "2026-04-19": "sakit", "2026-04-25": "izin",  "2026-04-27": "izin", "2026-04-29": "alpha" },
      "Dian Safitri":   { "2026-04-21": "izin",  "2026-04-26": "sakit" },
    }
    for (const salesNama of Object.keys(salesMap)) {
      const exc = exceptions[salesNama] || {}
      for (let d = new Date("2026-04-18"); d <= new Date("2026-05-01"); d.setDate(d.getDate() + 1)) {
        const key = d.toISOString().split("T")[0]
        await tx.absensi.create({
          data: { tanggal: new Date(key), sales_id: salesMap[salesNama].id, status: exc[key] || "hadir" },
        })
      }
    }

    // ─── Pengeluaran ──────────────────────────────────────────────────────────
    for (const [tgl, jumlah, keterangan] of [
      ["2026-04-18",   50000, "Bensin Motor Budi Santoso"],
      ["2026-04-19",  150000, "Makan Siang Tim Sales"],
      ["2026-04-20",   25000, "Parkir & Tol Distribusi"],
      ["2026-04-21",  500000, "Biaya Maintenance Gudang"],
      ["2026-04-22",   75000, "Bensin Motor Agus Prasetyo"],
      ["2026-04-24",  200000, "Pembelian Alat Tulis Kantor"],
      ["2026-04-26",   35000, "Bensin Motor Siti Rahayu"],
      ["2026-04-28", 1200000, "Gaji Harian Staff Gudang (4 orang)"],
      ["2026-04-29",   45000, "Parkir & Tol Distribusi"],
      ["2026-04-30",   85000, "Bensin Motor Hendra Kusuma"],
    ]) {
      await tx.pengeluaran.create({ data: { tanggal: new Date(tgl), jumlah, keterangan } })
    }

    // ─── Retur ────────────────────────────────────────────────────────────────
    // Retur 1: Apr 20, Budi – GG Surya 10
    const retur1 = await tx.retur.create({
      data: {
        tanggal:  new Date("2026-04-20"),
        sales_id: salesMap["Budi Santoso"].id,
        alasan:   "Bungkus rusak / penyok",
        items:    { create: [{ rokok_id: rokok["Gudang Garam Surya 12"].id, qty: 10 }] },
      },
    })
    await tx.stockMutation.create({
      data: { rokok_id: rokok["Gudang Garam Surya 12"].id, tanggal: new Date("2026-04-20"), jenis: "in", qty: 10, source: "retur", reference_id: retur1.id, keterangan: "Retur dari toko - bungkus rusak", user_id: superadmin.id },
    })

    // Retur 2: Apr 25, Agus – SA Mild 5
    const retur2 = await tx.retur.create({
      data: {
        tanggal:  new Date("2026-04-25"),
        sales_id: salesMap["Agus Prasetyo"].id,
        alasan:   "Produk hampir kadaluarsa",
        items:    { create: [{ rokok_id: rokok["Sampoerna A Mild 16"].id, qty: 5 }] },
      },
    })
    await tx.stockMutation.create({
      data: { rokok_id: rokok["Sampoerna A Mild 16"].id, tanggal: new Date("2026-04-25"), jenis: "in", qty: 5, source: "retur", reference_id: retur2.id, keterangan: "Retur dari toko - hampir kadaluarsa", user_id: superadmin.id },
    })

    // Retur 3: Apr 27, Siti – LA Bold 3
    const retur3 = await tx.retur.create({
      data: {
        tanggal:  new Date("2026-04-27"),
        sales_id: salesMap["Siti Rahayu"].id,
        alasan:   "Kena air hujan",
        items:    { create: [{ rokok_id: rokok["LA Bold"].id, qty: 3 }] },
      },
    })
    await tx.stockMutation.create({
      data: { rokok_id: rokok["LA Bold"].id, tanggal: new Date("2026-04-27"), jenis: "in", qty: 3, source: "retur", reference_id: retur3.id, keterangan: "Retur dari toko - kena air hujan", user_id: superadmin.id },
    })

    // Retur 4: Apr 29, Hendra – DSS 234 2
    const retur4 = await tx.retur.create({
      data: {
        tanggal:  new Date("2026-04-29"),
        sales_id: salesMap["Hendra Kusuma"].id,
        alasan:   "Salah pengiriman",
        items:    { create: [{ rokok_id: rokok["Dji Sam Soe 234"].id, qty: 2 }] },
      },
    })
    await tx.stockMutation.create({
      data: { rokok_id: rokok["Dji Sam Soe 234"].id, tanggal: new Date("2026-04-29"), jenis: "in", qty: 2, source: "retur", reference_id: retur4.id, keterangan: "Retur dari toko - salah pengiriman", user_id: superadmin.id },
    })

    // Retur 5: Apr 30, Dian – Camel Filter 4
    const retur5 = await tx.retur.create({
      data: {
        tanggal:  new Date("2026-04-30"),
        sales_id: salesMap["Dian Safitri"].id,
        alasan:   "Bungkus penyok",
        items:    { create: [{ rokok_id: rokok["Camel Filter"].id, qty: 4 }] },
      },
    })
    await tx.stockMutation.create({
      data: { rokok_id: rokok["Camel Filter"].id, tanggal: new Date("2026-04-30"), jenis: "in", qty: 4, source: "retur", reference_id: retur5.id, keterangan: "Retur dari toko - bungkus penyok", user_id: superadmin.id },
    })

    // ─── Helper: buat sesi selesai ────────────────────────────────────────────
    async function buatSesiSelesai({ tgl, salesNama, keluar, penjualan, kembali, setoran }) {
      const sesi = await tx.sesiHarian.create({
        data: {
          tanggal:      new Date(tgl),
          sales_id:     salesMap[salesNama].id,
          status:       "selesai",
          barangKeluar:  { create: keluar.map(k    => ({ rokok_id: rokok[k.nama].id, qty: k.qty })) },
          penjualan:     { create: penjualan.map(p => ({ rokok_id: rokok[p.nama].id, kategori: p.kategori, qty: p.qty, harga: p.harga })) },
          barangKembali: { create: kembali.map(k   => ({ rokok_id: rokok[k.nama].id, qty: k.qty })) },
          setoran:       { create: setoran.map(s   => ({ metode: s.metode, jumlah: s.jumlah })) },
        },
      })
      for (const k of keluar) {
        await tx.stockMutation.create({ data: { rokok_id: rokok[k.nama].id, tanggal: new Date(tgl), jenis: "out", qty: k.qty, source: "distribusi_sales", reference_id: sesi.id, user_id: superadmin.id } })
      }
      for (const k of kembali) {
        await tx.stockMutation.create({ data: { rokok_id: rokok[k.nama].id, tanggal: new Date(tgl), jenis: "in",  qty: k.qty, source: "retur_sales",      reference_id: sesi.id, user_id: superadmin.id } })
      }
      return sesi
    }

    // ─── Distribusi: 7 Selesai ────────────────────────────────────────────────

    // S1 Apr 18 – Budi
    const s1 = await buatSesiSelesai({
      tgl: "2026-04-18", salesNama: "Budi Santoso",
      keluar:    [{ nama: "Gudang Garam Surya 12", qty: 80  }, { nama: "Gudang Garam Merah", qty: 100 }],
      penjualan: [{ nama: "Gudang Garam Surya 12", kategori: "toko",   qty: 75, harga: 23000 },
                  { nama: "Gudang Garam Merah",    kategori: "grosir", qty: 95, harga: 19500 }],
      kembali:   [{ nama: "Gudang Garam Surya 12", qty: 5 }, { nama: "Gudang Garam Merah", qty: 5 }],
      setoran:   [{ metode: "cash", jumlah: 75 * 23000 + 95 * 19500 }],
    })

    // S2 Apr 19 – Agus
    const s2 = await buatSesiSelesai({
      tgl: "2026-04-19", salesNama: "Agus Prasetyo",
      keluar:    [{ nama: "Sampoerna A Mild 16", qty: 60 }, { nama: "LA Bold", qty: 50 }],
      penjualan: [{ nama: "Sampoerna A Mild 16", kategori: "toko", qty: 55, harga: 25500 },
                  { nama: "LA Bold",             kategori: "toko", qty: 45, harga: 22500 }],
      kembali:   [{ nama: "Sampoerna A Mild 16", qty: 5 }, { nama: "LA Bold", qty: 5 }],
      setoran:   [{ metode: "transfer", jumlah: 55 * 25500 + 45 * 22500 }],
    })

    // S3 Apr 21 – Siti
    const s3 = await buatSesiSelesai({
      tgl: "2026-04-21", salesNama: "Siti Rahayu",
      keluar:    [{ nama: "Dji Sam Soe 234", qty: 40 }, { nama: "Marlboro Merah", qty: 30 }],
      penjualan: [{ nama: "Dji Sam Soe 234", kategori: "perorangan", qty: 38, harga: 30000 },
                  { nama: "Marlboro Merah",  kategori: "perorangan", qty: 28, harga: 35000 }],
      kembali:   [{ nama: "Dji Sam Soe 234", qty: 2 }, { nama: "Marlboro Merah", qty: 2 }],
      setoran:   [{ metode: "cash", jumlah: 38 * 30000 + 28 * 35000 }],
    })

    // S4 Apr 22 – Hendra
    const s4 = await buatSesiSelesai({
      tgl: "2026-04-22", salesNama: "Hendra Kusuma",
      keluar:    [{ nama: "Gudang Garam Surya 12", qty: 100 }, { nama: "Camel Filter", qty: 30 }],
      penjualan: [{ nama: "Gudang Garam Surya 12", kategori: "grosir", qty: 92, harga: 22000 },
                  { nama: "Camel Filter",          kategori: "toko",   qty: 25, harga: 27000 }],
      kembali:   [{ nama: "Gudang Garam Surya 12", qty: 8 }, { nama: "Camel Filter", qty: 5 }],
      setoran:   [{ metode: "cash", jumlah: 1619400 }, { metode: "transfer", jumlah: 1079600 }],
    })

    // S5 Apr 24 – Budi
    const s5 = await buatSesiSelesai({
      tgl: "2026-04-24", salesNama: "Budi Santoso",
      keluar:    [{ nama: "Gudang Garam Merah", qty: 120 }, { nama: "Sampoerna A Mild 16", qty: 50 }],
      penjualan: [{ nama: "Gudang Garam Merah", kategori: "grosir", qty: 110, harga: 19500 },
                  { nama: "Sampoerna A Mild 16", kategori: "toko",   qty: 48,  harga: 25500 }],
      kembali:   [{ nama: "Gudang Garam Merah", qty: 10 }, { nama: "Sampoerna A Mild 16", qty: 2 }],
      setoran:   [{ metode: "transfer", jumlah: 110 * 19500 + 48 * 25500 }],
    })

    // S6 Apr 26 – Agus
    const s6 = await buatSesiSelesai({
      tgl: "2026-04-26", salesNama: "Agus Prasetyo",
      keluar:    [{ nama: "Dunhill Filter", qty: 40 }, { nama: "Marlboro Merah", qty: 30 }],
      penjualan: [{ nama: "Dunhill Filter", kategori: "perorangan", qty: 36, harga: 32000 },
                  { nama: "Marlboro Merah", kategori: "toko",       qty: 27, harga: 32500 }],
      kembali:   [{ nama: "Dunhill Filter", qty: 4 }, { nama: "Marlboro Merah", qty: 3 }],
      setoran:   [{ metode: "cash", jumlah: 36 * 32000 + 27 * 32500 }],
    })

    // S7 Apr 28 – Siti
    const s7 = await buatSesiSelesai({
      tgl: "2026-04-28", salesNama: "Siti Rahayu",
      keluar:    [{ nama: "LA Bold", qty: 60 }, { nama: "Gudang Garam Surya 12", qty: 70 }],
      penjualan: [{ nama: "LA Bold",             kategori: "toko", qty: 55, harga: 22500 },
                  { nama: "Gudang Garam Surya 12", kategori: "toko", qty: 65, harga: 23000 }],
      kembali:   [{ nama: "LA Bold", qty: 5 }, { nama: "Gudang Garam Surya 12", qty: 5 }],
      setoran:   [{ metode: "cash", jumlah: 55 * 22500 + 65 * 23000 }],
    })

    // ─── Distribusi: 2 Aktif ──────────────────────────────────────────────────

    // S8 Apr 30 – Hendra
    const s8 = await tx.sesiHarian.create({
      data: {
        tanggal:  new Date("2026-04-30"),
        sales_id: salesMap["Hendra Kusuma"].id,
        status:   "aktif",
        barangKeluar: { create: [
          { rokok_id: rokok["Gudang Garam Merah"].id, qty: 80 },
          { rokok_id: rokok["Camel Filter"].id,       qty: 20 },
        ]},
      },
    })
    await tx.stockMutation.create({ data: { rokok_id: rokok["Gudang Garam Merah"].id, tanggal: new Date("2026-04-30"), jenis: "out", qty: 80, source: "distribusi_sales", reference_id: s8.id, user_id: superadmin.id } })
    await tx.stockMutation.create({ data: { rokok_id: rokok["Camel Filter"].id,       tanggal: new Date("2026-04-30"), jenis: "out", qty: 20, source: "distribusi_sales", reference_id: s8.id, user_id: superadmin.id } })

    // S9 May 1 – Budi
    const s9 = await tx.sesiHarian.create({
      data: {
        tanggal:  new Date("2026-05-01"),
        sales_id: salesMap["Budi Santoso"].id,
        status:   "aktif",
        barangKeluar: { create: [
          { rokok_id: rokok["Sampoerna A Mild 16"].id, qty: 40 },
          { rokok_id: rokok["Dunhill Filter"].id,      qty: 30 },
        ]},
      },
    })
    await tx.stockMutation.create({ data: { rokok_id: rokok["Sampoerna A Mild 16"].id, tanggal: new Date("2026-05-01"), jenis: "out", qty: 40, source: "distribusi_sales", reference_id: s9.id, user_id: superadmin.id } })
    await tx.stockMutation.create({ data: { rokok_id: rokok["Dunhill Filter"].id,      tanggal: new Date("2026-05-01"), jenis: "out", qty: 30, source: "distribusi_sales", reference_id: s9.id, user_id: superadmin.id } })

    // ─── Titip Jual ────────────────────────────────────────────────────────────

    // TJ1 – S1 Apr 18, Budi → Toko Berkah
    const tj1 = await tx.titipJual.create({
      data: {
        sesi_id: s1.id, sales_id: salesMap["Budi Santoso"].id,
        toko_id: tokoMap["Toko Berkah"].id, kategori: "toko",
        tanggal_jatuh_tempo: new Date("2026-04-25"),
        tanggal_selesai:     new Date("2026-04-22"),
        status: "selesai",
        items:   { create: [{ rokok_id: rokok["Dji Sam Soe 234"].id, qty_keluar: 20, qty_terjual: 18, qty_kembali: 2, harga: 28500 }] },
        setoran: { create: [{ metode: "transfer", jumlah: 18 * 28500, tanggal: new Date("2026-04-22") }] },
      },
    })
    await tx.stockMutation.create({ data: { rokok_id: rokok["Dji Sam Soe 234"].id, tanggal: new Date("2026-04-18"), jenis: "out", qty: 20, source: "distribusi_sales",    reference_id: tj1.id, user_id: superadmin.id } })
    await tx.stockMutation.create({ data: { rokok_id: rokok["Dji Sam Soe 234"].id, tanggal: new Date("2026-04-22"), jenis: "in",  qty: 2,  source: "konsinyasi_kembali", reference_id: tj1.id, user_id: superadmin.id } })

    // TJ2 – S3 Apr 21, Siti → Grosir Jaya
    const tj2 = await tx.titipJual.create({
      data: {
        sesi_id: s3.id, sales_id: salesMap["Siti Rahayu"].id,
        toko_id: tokoMap["Grosir Jaya"].id, kategori: "grosir",
        tanggal_jatuh_tempo: new Date("2026-04-30"),
        tanggal_selesai:     new Date("2026-04-28"),
        status: "selesai",
        items: { create: [
          { rokok_id: rokok["Gudang Garam Merah"].id,  qty_keluar: 50, qty_terjual: 47, qty_kembali: 3, harga: 19500 },
          { rokok_id: rokok["Sampoerna A Mild 16"].id, qty_keluar: 30, qty_terjual: 28, qty_kembali: 2, harga: 24500 },
        ]},
        setoran: { create: [{ metode: "transfer", jumlah: 47 * 19500 + 28 * 24500, tanggal: new Date("2026-04-28") }] },
      },
    })
    await tx.stockMutation.create({ data: { rokok_id: rokok["Gudang Garam Merah"].id,  tanggal: new Date("2026-04-21"), jenis: "out", qty: 50, source: "distribusi_sales",    reference_id: tj2.id, user_id: superadmin.id } })
    await tx.stockMutation.create({ data: { rokok_id: rokok["Sampoerna A Mild 16"].id, tanggal: new Date("2026-04-21"), jenis: "out", qty: 30, source: "distribusi_sales",    reference_id: tj2.id, user_id: superadmin.id } })
    await tx.stockMutation.create({ data: { rokok_id: rokok["Gudang Garam Merah"].id,  tanggal: new Date("2026-04-28"), jenis: "in",  qty: 3,  source: "konsinyasi_kembali", reference_id: tj2.id, user_id: superadmin.id } })
    await tx.stockMutation.create({ data: { rokok_id: rokok["Sampoerna A Mild 16"].id, tanggal: new Date("2026-04-28"), jenis: "in",  qty: 2,  source: "konsinyasi_kembali", reference_id: tj2.id, user_id: superadmin.id } })

    // TJ3 – S6 Apr 26, Agus → Grosir Sentral
    const tj3 = await tx.titipJual.create({
      data: {
        sesi_id: s6.id, sales_id: salesMap["Agus Prasetyo"].id,
        toko_id: tokoMap["Grosir Sentral"].id, kategori: "grosir",
        tanggal_jatuh_tempo: new Date("2026-05-05"),
        status: "aktif",
        items: { create: [{ rokok_id: rokok["Marlboro Merah"].id, qty_keluar: 20, harga: 31000 }] },
      },
    })
    await tx.stockMutation.create({ data: { rokok_id: rokok["Marlboro Merah"].id, tanggal: new Date("2026-04-26"), jenis: "out", qty: 20, source: "distribusi_sales", reference_id: tj3.id, user_id: superadmin.id } })

    // TJ4 – S7 Apr 28, Siti → Minimarket Almaz
    const tj4 = await tx.titipJual.create({
      data: {
        sesi_id: s7.id, sales_id: salesMap["Siti Rahayu"].id,
        toko_id: tokoMap["Minimarket Almaz"].id, kategori: "toko",
        tanggal_jatuh_tempo: new Date("2026-05-01"),
        status: "aktif",
        items: { create: [{ rokok_id: rokok["LA Bold"].id, qty_keluar: 15, harga: 22500 }] },
      },
    })
    await tx.stockMutation.create({ data: { rokok_id: rokok["LA Bold"].id, tanggal: new Date("2026-04-28"), jenis: "out", qty: 15, source: "distribusi_sales", reference_id: tj4.id, user_id: superadmin.id } })

    // TJ5 – S5 Apr 24, Budi → Warung Bu Siti (OVERDUE)
    const tj5 = await tx.titipJual.create({
      data: {
        sesi_id: s5.id, sales_id: salesMap["Budi Santoso"].id,
        toko_id: tokoMap["Warung Bu Siti"].id, kategori: "toko",
        tanggal_jatuh_tempo: new Date("2026-04-28"),
        status: "aktif",
        catatan: "Pemilik toko minta perpanjangan, belum ada kabar",
        items: { create: [{ rokok_id: rokok["Camel Filter"].id, qty_keluar: 25, harga: 27000 }] },
      },
    })
    await tx.stockMutation.create({ data: { rokok_id: rokok["Camel Filter"].id, tanggal: new Date("2026-04-24"), jenis: "out", qty: 25, source: "distribusi_sales", reference_id: tj5.id, user_id: superadmin.id } })

    // ─── Audit Log ────────────────────────────────────────────────────────────
    await tx.auditLog.createMany({
      data: [
        {
          entity_type: "Pengeluaran",
          change_type: "Pembelian Alat",
          entity_id:   "seed-sample-1",
          action:      "CREATE",
          new_values:  { tanggal: "2026-04-24", jumlah: 200000, keterangan: "Pembelian Alat Tulis Kantor" },
          user_id:     admin.id,
          user_name:   admin.name,
          createdAt:   new Date("2026-04-24T09:15:00Z"),
        },
        {
          entity_type: "Rokok",
          change_type: "Harga Toko & Perorangan",
          entity_id:   rokok["Dji Sam Soe 234"].id,
          action:      "UPDATE",
          old_values:  { harga_toko: 28000, harga_perorangan: 29500 },
          new_values:  { harga_toko: 28500, harga_perorangan: 30000 },
          alasan:      "Penyesuaian harga sesuai kenaikan harga dari supplier",
          user_id:     superadmin.id,
          user_name:   superadmin.name,
          createdAt:   new Date("2026-04-25T10:30:00Z"),
        },
        {
          entity_type: "Pengeluaran",
          change_type: "Penghapusan (Input Salah)",
          entity_id:   "seed-sample-deleted",
          action:      "DELETE",
          old_values:  { tanggal: "2026-04-25", jumlah: 300000, keterangan: "Pembelian AC Gudang" },
          alasan:      "Input salah, bukan pengeluaran bulan ini",
          user_id:     admin.id,
          user_name:   admin.name,
          createdAt:   new Date("2026-04-26T08:00:00Z"),
        },
        {
          entity_type: "SesiHarian",
          change_type: "Laporan Sore - Setoran",
          entity_id:   s3.id,
          action:      "UPDATE",
          old_values:  { setoran_cash: 2000000, setoran_transfer: 0 },
          new_values:  { setoran_cash: 2120000, setoran_transfer: 0 },
          alasan:      "Koreksi setoran laporan sore – ada selisih Rp 120.000",
          user_id:     admin.id,
          user_name:   admin.name,
          createdAt:   new Date("2026-04-28T14:20:00Z"),
        },
        {
          entity_type: "TitipJual",
          change_type: "Perpanjang Jatuh Tempo",
          entity_id:   tj5.id,
          action:      "UPDATE",
          old_values:  { tanggal_jatuh_tempo: "2026-04-25" },
          new_values:  { tanggal_jatuh_tempo: "2026-04-28" },
          alasan:      "Perpanjangan jatuh tempo atas permintaan pemilik Warung Bu Siti",
          user_id:     admin.id,
          user_name:   admin.name,
          createdAt:   new Date("2026-04-25T11:45:00Z"),
        },
        {
          entity_type: "Rokok",
          change_type: "Penghapusan Produk",
          entity_id:   "seed-rokok-deleted",
          action:      "DELETE",
          old_values:  { nama: "Marlboro Light", harga_beli: 28000, stok: 0 },
          alasan:      "Produk tidak tersedia lagi dari supplier, stok habis dan tidak akan direstok",
          user_id:     superadmin.id,
          user_name:   superadmin.name,
          createdAt:   new Date("2026-04-30T09:00:00Z"),
        },
      ],
    })

    // ─── Re-Sync Cache Stok ───────────────────────────────────────────────────
    const allRokok = await tx.rokok.findMany()
    for (const r of allRokok) {
      const muts = await tx.stockMutation.groupBy({
        by:    ["jenis"],
        where: { rokok_id: r.id },
        _sum:  { qty: true },
      })
      const totalIn  = muts.find(m => m.jenis === "in" )?._sum.qty || 0
      const totalOut = muts.find(m => m.jenis === "out")?._sum.qty || 0
      await tx.rokok.update({ where: { id: r.id }, data: { stok: totalIn - totalOut } })
    }
  }, { timeout: 30000 })

  console.log("✅ Seed data berhasil dibuat!")
  console.log("   Users   : 5 (2 superadmin/admin, 3 staff)")
  console.log("   Rokok   : 8 jenis")
  console.log("   Sales   : 5 orang | Toko: 6")
  console.log("   Distribusi: 7 selesai, 2 aktif")
  console.log("   Titip Jual: 2 selesai, 3 aktif (1 hari ini, 1 overdue)")
  console.log("   Pengeluaran: 10 | Retur: 5 | Audit Log: 6")
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
