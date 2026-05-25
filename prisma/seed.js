const { PrismaClient } = require("@prisma/client")

const prisma = new PrismaClient()

async function main() {
  await prisma.$transaction(async (tx) => {
    // ─── Clear Data (except users) ────────────────────────────────────────────
    await tx.auditLog.deleteMany({})
    await tx.closingHarian.deleteMany({})
    await tx.stockMutation.deleteMany({})
    await tx.sampleHarianItem.deleteMany({})
    await tx.sampleHarian.deleteMany({})
    await tx.titipJualSetoran.deleteMany({})
    await tx.titipJualItem.deleteMany({})
    await tx.titipJual.deleteMany({})
    await tx.sesiSetoran.deleteMany({})
    await tx.sesiPenjualan.deleteMany({})
    await tx.sesiBarangKembali.deleteMany({})
    await tx.sesiBarangKeluar.deleteMany({})
    await tx.sesiSample.deleteMany({})
    await tx.sampleCukaiKonversi.deleteMany({})
    await tx.tukarBarangItemMasuk.deleteMany({})
    await tx.tukarBarangItemKeluar.deleteMany({})
    await tx.tukarBarang.deleteMany({})
    await tx.sesiHarian.deleteMany({})
    await tx.returItem.deleteMany({})
    await tx.retur.deleteMany({})
    await tx.absensi.deleteMany({})
    await tx.stokMasuk.deleteMany({})
    await tx.pengeluaran.deleteMany({})
    await tx.toko.deleteMany({})
    await tx.sales.deleteMany({})
    await tx.rokok.deleteMany({})

    // ─── Ambil user yang ada ──────────────────────────────────────────────────
    const superadmin = await tx.user.findFirst({ where: { role: "superadmin" } })
    const admin      = await tx.user.findFirst({ where: { role: "admin" } }) ?? superadmin
    if (!superadmin) throw new Error("Tidak ada user superadmin. Buat user dulu sebelum seed.")

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
    for (const [nama, no_hp, kategori] of [
      ["Budi Santoso",  "081234567890", "grosir"],
      ["Agus Prasetyo", "081234567891", "toko"],
      ["Siti Rahayu",   "081234567892", "grosir"],
      ["Hendra Kusuma", "081234567893", "toko"],
      ["Dian Safitri",  "081234567894", "grosir"],
    ]) {
      const s = await tx.sales.create({ data: { nama, no_hp, kategori } })
      salesMap[nama] = s
    }

    // ─── Toko ─────────────────────────────────────────────────────────────────
    const tokoMap = {}
    for (const t of [
      { nama: "Toko Berkah",       alamat: "Jl. Merdeka No. 10",   kategori: "toko"   },
      { nama: "Grosir Jaya",       alamat: "Pasar Baru Blok A-12", kategori: "grosir" },
      { nama: "Warung Bu Siti",    alamat: "Jl. Mawar No. 5",      kategori: "toko"   },
      { nama: "Minimarket Almaz",  alamat: "Jl. Almaz Raya No. 1", kategori: "toko"   },
      { nama: "Toko Murah Meriah", alamat: "Jl. Pahlawan No. 22",  kategori: "toko"   },
      { nama: "Grosir Sentral",    alamat: "Pasar Induk Blok D-3", kategori: "grosir" },
    ]) {
      tokoMap[t.nama] = await tx.toko.create({ data: t })
    }

    // ─── Absensi (May 24 – May 28) ─────────────────────────────────────────────
    const exceptions = {
      "Budi Santoso":   { "2026-05-25": "hadir" },
      "Agus Prasetyo":  { "2026-05-25": "hadir" },
      "Siti Rahayu":    { "2026-05-25": "hadir" },
      "Hendra Kusuma":  { "2026-05-25": "hadir" },
      "Dian Safitri":   { "2026-05-25": "hadir" },
    }
    for (const salesNama of Object.keys(salesMap)) {
      const exc = exceptions[salesNama] || {}
      for (let d = new Date("2026-05-24"); d <= new Date("2026-05-28"); d.setDate(d.getDate() + 1)) {
        const key = d.toISOString().split("T")[0]
        await tx.absensi.create({
          data: { tanggal: new Date(key), sales_id: salesMap[salesNama].id, status: exc[key] || "hadir" },
        })
      }
    }

    // ─── Pengeluaran ──────────────────────────────────────────────────────────
    for (const [tgl, jumlah, keterangan] of [
      ["2026-05-25",   50000, "Bensin Motor Budi Santoso"],
      ["2026-05-25",  150000, "Makan Siang Tim Sales"],
      ["2026-05-25",   25000, "Parkir & Tol Distribusi"],
      ["2026-05-26",  500000, "Biaya Maintenance Gudang"],
      ["2026-05-26",   75000, "Bensin Motor Agus Prasetyo"],
      ["2026-05-26",  200000, "Pembelian Alat Tulis Kantor"],
      ["2026-05-27",   35000, "Bensin Motor Siti Rahayu"],
      ["2026-05-27", 1200000, "Gaji Harian Staff Gudang (4 orang)"],
      ["2026-05-27",   45000, "Parkir & Tol Distribusi"],
      ["2026-05-28",   85000, "Bensin Motor Hendra Kusuma"],
      ["2026-05-28",   95000, "Bensin Motor Siti Rahayu"],
      ["2026-05-28",  110000, "Bensin Motor Budi Santoso"],
    ]) {
      await tx.pengeluaran.create({ data: { tanggal: new Date(tgl), jumlah, keterangan, sumber: "penjualan" } })
    }

    // ─── Retur ────────────────────────────────────────────────────────────────
    const retur1 = await tx.retur.create({
      data: { tanggal: new Date("2026-05-25"), sales_id: salesMap["Budi Santoso"].id, alasan: "Bungkus rusak / penyok",
        items: { create: [{ rokok_id: rokok["Gudang Garam Surya 12"].id, qty: 10 }] } },
    })
    await tx.stockMutation.create({ data: { rokok_id: rokok["Gudang Garam Surya 12"].id, tanggal: new Date("2026-05-25"), jenis: "in", qty: 10, source: "retur", reference_id: retur1.id, keterangan: "Retur dari toko - bungkus rusak", user_id: superadmin.id } })

    const retur2 = await tx.retur.create({
      data: { tanggal: new Date("2026-05-25"), sales_id: salesMap["Agus Prasetyo"].id, alasan: "Produk hampir kadaluarsa",
        items: { create: [{ rokok_id: rokok["Sampoerna A Mild 16"].id, qty: 5 }] } },
    })
    await tx.stockMutation.create({ data: { rokok_id: rokok["Sampoerna A Mild 16"].id, tanggal: new Date("2026-05-25"), jenis: "in", qty: 5, source: "retur", reference_id: retur2.id, keterangan: "Retur dari toko - hampir kadaluarsa", user_id: superadmin.id } })

    const retur3 = await tx.retur.create({
      data: { tanggal: new Date("2026-05-26"), sales_id: salesMap["Siti Rahayu"].id, alasan: "Kena air hujan",
        items: { create: [{ rokok_id: rokok["LA Bold"].id, qty: 3 }] } },
    })
    await tx.stockMutation.create({ data: { rokok_id: rokok["LA Bold"].id, tanggal: new Date("2026-05-26"), jenis: "in", qty: 3, source: "retur", reference_id: retur3.id, keterangan: "Retur dari toko - kena air hujan", user_id: superadmin.id } })

    const retur4 = await tx.retur.create({
      data: { tanggal: new Date("2026-05-26"), sales_id: salesMap["Hendra Kusuma"].id, alasan: "Salah pengiriman",
        items: { create: [{ rokok_id: rokok["Dji Sam Soe 234"].id, qty: 2 }] } },
    })
    await tx.stockMutation.create({ data: { rokok_id: rokok["Dji Sam Soe 234"].id, tanggal: new Date("2026-05-26"), jenis: "in", qty: 2, source: "retur", reference_id: retur4.id, keterangan: "Retur dari toko - salah pengiriman", user_id: superadmin.id } })

    const retur5 = await tx.retur.create({
      data: { tanggal: new Date("2026-05-26"), sales_id: salesMap["Dian Safitri"].id, alasan: "Bungkus penyok",
        items: { create: [{ rokok_id: rokok["Camel Filter"].id, qty: 4 }] } },
    })
    await tx.stockMutation.create({ data: { rokok_id: rokok["Camel Filter"].id, tanggal: new Date("2026-05-26"), jenis: "in", qty: 4, source: "retur", reference_id: retur5.id, keterangan: "Retur dari toko - bungkus penyok", user_id: superadmin.id } })

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

    // ─── Distribusi Selesai (8 Sesi) ──────────────────────────────────────────
    const s1 = await buatSesiSelesai({
      tgl: "2026-05-25", salesNama: "Budi Santoso",
      keluar:    [{ nama: "Gudang Garam Surya 12", qty: 80 }, { nama: "Gudang Garam Merah", qty: 100 }, { nama: "Dji Sam Soe 234", qty: 20 }],
      penjualan: [{ nama: "Gudang Garam Surya 12", kategori: "toko",   qty: 75, harga: 23000 },
                  { nama: "Gudang Garam Merah",    kategori: "grosir", qty: 95, harga: 19500 }],
      kembali:   [{ nama: "Gudang Garam Surya 12", qty: 5 }, { nama: "Gudang Garam Merah", qty: 5 }],
      setoran:   [{ metode: "cash", jumlah: 75 * 23000 + 95 * 19500 }],
    })

    const s2 = await buatSesiSelesai({
      tgl: "2026-05-25", salesNama: "Agus Prasetyo",
      keluar:    [{ nama: "Sampoerna A Mild 16", qty: 60 }, { nama: "LA Bold", qty: 50 }],
      penjualan: [{ nama: "Sampoerna A Mild 16", kategori: "toko", qty: 55, harga: 25500 },
                  { nama: "LA Bold",             kategori: "toko", qty: 45, harga: 22500 }],
      kembali:   [{ nama: "Sampoerna A Mild 16", qty: 5 }, { nama: "LA Bold", qty: 5 }],
      setoran:   [{ metode: "transfer", jumlah: 55 * 25500 + 45 * 22500 }],
    })

    const s3 = await buatSesiSelesai({
      tgl: "2026-05-25", salesNama: "Siti Rahayu",
      keluar:    [{ nama: "Dji Sam Soe 234", qty: 40 }, { nama: "Marlboro Merah", qty: 30 }, { nama: "Gudang Garam Merah", qty: 50 }, { nama: "Sampoerna A Mild 16", qty: 30 }],
      penjualan: [{ nama: "Dji Sam Soe 234", kategori: "perorangan", qty: 38, harga: 30000 },
                  { nama: "Marlboro Merah",  kategori: "perorangan", qty: 28, harga: 35000 }],
      kembali:   [{ nama: "Dji Sam Soe 234", qty: 2 }, { nama: "Marlboro Merah", qty: 2 }],
      setoran:   [{ metode: "cash", jumlah: 38 * 30000 + 28 * 35000 }],
    })

    const s4 = await buatSesiSelesai({
      tgl: "2026-05-25", salesNama: "Hendra Kusuma",
      keluar:    [{ nama: "Gudang Garam Surya 12", qty: 100 }, { nama: "Camel Filter", qty: 30 }],
      penjualan: [{ nama: "Gudang Garam Surya 12", kategori: "grosir", qty: 92, harga: 22000 },
                  { nama: "Camel Filter",          kategori: "toko",   qty: 25, harga: 27000 }],
      kembali:   [{ nama: "Gudang Garam Surya 12", qty: 8 }, { nama: "Camel Filter", qty: 5 }],
      setoran:   [{ metode: "cash", jumlah: 1619400 }, { metode: "transfer", jumlah: 1079600 }],
    })

    const s5 = await buatSesiSelesai({
      tgl: "2026-05-25", salesNama: "Dian Safitri",
      keluar:    [{ nama: "Gudang Garam Merah", qty: 120 }, { nama: "Sampoerna A Mild 16", qty: 50 }, { nama: "Camel Filter", qty: 25 }],
      penjualan: [{ nama: "Gudang Garam Merah",    kategori: "grosir", qty: 110, harga: 19500 },
                  { nama: "Sampoerna A Mild 16",   kategori: "toko",   qty: 48,  harga: 25500 }],
      kembali:   [{ nama: "Gudang Garam Merah", qty: 10 }, { nama: "Sampoerna A Mild 16", qty: 2 }],
      setoran:   [{ metode: "transfer", jumlah: 110 * 19500 + 48 * 25500 }],
    })

    const s6 = await buatSesiSelesai({
      tgl: "2026-05-26", salesNama: "Budi Santoso",
      keluar:    [{ nama: "Dunhill Filter", qty: 40 }, { nama: "Marlboro Merah", qty: 50 }],
      penjualan: [{ nama: "Dunhill Filter", kategori: "perorangan", qty: 36, harga: 32000 },
                  { nama: "Marlboro Merah", kategori: "toko",       qty: 27, harga: 32500 }],
      kembali:   [{ nama: "Dunhill Filter", qty: 4 }, { nama: "Marlboro Merah", qty: 3 }],
      setoran:   [{ metode: "cash", jumlah: 36 * 32000 + 27 * 32500 }],
    })

    const s7 = await buatSesiSelesai({
      tgl: "2026-05-26", salesNama: "Agus Prasetyo",
      keluar:    [{ nama: "LA Bold", qty: 75 }, { nama: "Gudang Garam Surya 12", qty: 70 }],
      penjualan: [{ nama: "LA Bold",              kategori: "toko", qty: 55, harga: 22500 },
                  { nama: "Gudang Garam Surya 12", kategori: "toko", qty: 65, harga: 23000 }],
      kembali:   [{ nama: "LA Bold", qty: 5 }, { nama: "Gudang Garam Surya 12", qty: 5 }],
      setoran:   [{ metode: "cash", jumlah: 55 * 22500 + 65 * 23000 }],
    })

    const s8 = await buatSesiSelesai({
      tgl: "2026-05-26", salesNama: "Siti Rahayu",
      keluar:    [{ nama: "Gudang Garam Surya 12", qty: 90 }, { nama: "Sampoerna A Mild 16", qty: 65 }, { nama: "Gudang Garam Merah", qty: 80 }],
      penjualan: [{ nama: "Gudang Garam Surya 12", kategori: "grosir", qty: 82, harga: 22000 },
                  { nama: "Sampoerna A Mild 16",   kategori: "toko",   qty: 58, harga: 25500 },
                  { nama: "Gudang Garam Merah",    kategori: "grosir", qty: 74, harga: 19500 }],
      kembali:   [{ nama: "Gudang Garam Surya 12", qty: 8 }, { nama: "Sampoerna A Mild 16", qty: 7 }, { nama: "Gudang Garam Merah", qty: 6 }],
      setoran:   [{ metode: "cash", jumlah: 82 * 22000 + 74 * 19500 }, { metode: "transfer", jumlah: 58 * 25500 }],
    })

    // ─── Distribusi Aktif (2 Sesi) ────────────────────────────────────────────
    const s9 = await tx.sesiHarian.create({
      data: {
        tanggal:  new Date("2026-05-26"),
        sales_id: salesMap["Hendra Kusuma"].id,
        status:   "aktif",
        barangKeluar: { create: [
          { rokok_id: rokok["Gudang Garam Merah"].id, qty: 80 },
          { rokok_id: rokok["Camel Filter"].id,       qty: 20 },
        ]},
      },
    })
    await tx.stockMutation.create({ data: { rokok_id: rokok["Gudang Garam Merah"].id, tanggal: new Date("2026-05-26"), jenis: "out", qty: 80, source: "distribusi_sales", reference_id: s9.id, user_id: superadmin.id } })
    await tx.stockMutation.create({ data: { rokok_id: rokok["Camel Filter"].id,       tanggal: new Date("2026-05-26"), jenis: "out", qty: 20, source: "distribusi_sales", reference_id: s9.id, user_id: superadmin.id } })

    const s10 = await tx.sesiHarian.create({
      data: {
        tanggal:  new Date("2026-05-26"),
        sales_id: salesMap["Dian Safitri"].id,
        status:   "aktif",
        barangKeluar: { create: [
          { rokok_id: rokok["Sampoerna A Mild 16"].id, qty: 40 },
          { rokok_id: rokok["Dunhill Filter"].id,      qty: 30 },
        ]},
      },
    })
    await tx.stockMutation.create({ data: { rokok_id: rokok["Sampoerna A Mild 16"].id, tanggal: new Date("2026-05-26"), jenis: "out", qty: 40, source: "distribusi_sales", reference_id: s10.id, user_id: superadmin.id } })
    await tx.stockMutation.create({ data: { rokok_id: rokok["Dunhill Filter"].id,      tanggal: new Date("2026-05-26"), jenis: "out", qty: 30, source: "distribusi_sales", reference_id: s10.id, user_id: superadmin.id } })

    // ─── Titip Jual (5 selesai, 2 aktif) ──────────────────────────────────────
    const tj1 = await tx.titipJual.create({
      data: {
        sesi_id: s1.id, sales_id: salesMap["Budi Santoso"].id,
        toko_id: tokoMap["Toko Berkah"].id, kategori: "toko",
        tanggal_jatuh_tempo: new Date("2026-05-28"), tanggal_selesai: new Date("2026-05-25"), status: "selesai",
        items:   { create: [{ rokok_id: rokok["Dji Sam Soe 234"].id, qty_keluar: 20, qty_terjual: 18, qty_kembali: 2, harga: 28500 }] },
        setoran: { create: [{ metode: "transfer", jumlah: 18 * 28500, tanggal: new Date("2026-05-25") }] },
      },
    })
    await tx.stockMutation.create({ data: { rokok_id: rokok["Dji Sam Soe 234"].id, tanggal: new Date("2026-05-25"), jenis: "out", qty: 20, source: "distribusi_sales",    reference_id: tj1.id, user_id: superadmin.id } })
    await tx.stockMutation.create({ data: { rokok_id: rokok["Dji Sam Soe 234"].id, tanggal: new Date("2026-05-25"), jenis: "in",  qty: 2,  source: "konsinyasi_kembali", reference_id: tj1.id, user_id: superadmin.id } })

    const tj2 = await tx.titipJual.create({
      data: {
        sesi_id: s3.id, sales_id: salesMap["Siti Rahayu"].id,
        toko_id: tokoMap["Grosir Jaya"].id, kategori: "grosir",
        tanggal_jatuh_tempo: new Date("2026-05-29"), tanggal_selesai: new Date("2026-05-25"), status: "selesai",
        items: { create: [
          { rokok_id: rokok["Gudang Garam Merah"].id,  qty_keluar: 50, qty_terjual: 47, qty_kembali: 3, harga: 19500 },
          { rokok_id: rokok["Sampoerna A Mild 16"].id, qty_keluar: 30, qty_terjual: 28, qty_kembali: 2, harga: 24500 },
        ]},
        setoran: { create: [{ metode: "transfer", jumlah: 47 * 19500 + 28 * 24500, tanggal: new Date("2026-05-25") }] },
      },
    })
    await tx.stockMutation.create({ data: { rokok_id: rokok["Gudang Garam Merah"].id,  tanggal: new Date("2026-05-25"), jenis: "out", qty: 50, source: "distribusi_sales",    reference_id: tj2.id, user_id: superadmin.id } })
    await tx.stockMutation.create({ data: { rokok_id: rokok["Sampoerna A Mild 16"].id, tanggal: new Date("2026-05-25"), jenis: "out", qty: 30, source: "distribusi_sales",    reference_id: tj2.id, user_id: superadmin.id } })
    await tx.stockMutation.create({ data: { rokok_id: rokok["Gudang Garam Merah"].id,  tanggal: new Date("2026-05-25"), jenis: "in",  qty: 3,  source: "konsinyasi_kembali", reference_id: tj2.id, user_id: superadmin.id } })
    await tx.stockMutation.create({ data: { rokok_id: rokok["Sampoerna A Mild 16"].id, tanggal: new Date("2026-05-25"), jenis: "in",  qty: 2,  source: "konsinyasi_kembali", reference_id: tj2.id, user_id: superadmin.id } })

    const tj3 = await tx.titipJual.create({
      data: {
        sesi_id: s2.id, sales_id: salesMap["Agus Prasetyo"].id,
        toko_id: tokoMap["Minimarket Almaz"].id, kategori: "toko",
        tanggal_jatuh_tempo: new Date("2026-05-28"), tanggal_selesai: new Date("2026-05-25"), status: "selesai",
        items:   { create: [{ rokok_id: rokok["Sampoerna A Mild 16"].id, qty_keluar: 15, qty_terjual: 15, qty_kembali: 0, harga: 25500 }] },
        setoran: { create: [{ metode: "cash", jumlah: 15 * 25500, tanggal: new Date("2026-05-25") }] },
      },
    })
    await tx.stockMutation.create({ data: { rokok_id: rokok["Sampoerna A Mild 16"].id, tanggal: new Date("2026-05-25"), jenis: "out", qty: 15, source: "distribusi_sales", reference_id: tj3.id, user_id: superadmin.id } })

    const tj4 = await tx.titipJual.create({
      data: {
        sesi_id: s4.id, sales_id: salesMap["Hendra Kusuma"].id,
        toko_id: tokoMap["Toko Murah Meriah"].id, kategori: "toko",
        tanggal_jatuh_tempo: new Date("2026-05-30"), tanggal_selesai: new Date("2026-05-25"), status: "selesai",
        items:   { create: [{ rokok_id: rokok["Gudang Garam Surya 12"].id, qty_keluar: 10, qty_terjual: 10, qty_kembali: 0, harga: 23000 }] },
        setoran: { create: [{ metode: "cash", jumlah: 10 * 23000, tanggal: new Date("2026-05-25") }] },
      },
    })
    await tx.stockMutation.create({ data: { rokok_id: rokok["Gudang Garam Surya 12"].id, tanggal: new Date("2026-05-25"), jenis: "out", qty: 10, source: "distribusi_sales", reference_id: tj4.id, user_id: superadmin.id } })

    const tj5 = await tx.titipJual.create({
      data: {
        sesi_id: s5.id, sales_id: salesMap["Dian Safitri"].id,
        toko_id: tokoMap["Warung Bu Siti"].id, kategori: "toko",
        tanggal_jatuh_tempo: new Date("2026-05-30"), tanggal_selesai: new Date("2026-05-25"), status: "selesai",
        items:   { create: [{ rokok_id: rokok["LA Bold"].id, qty_keluar: 20, qty_terjual: 18, qty_kembali: 2, harga: 22500 }] },
        setoran: { create: [{ metode: "transfer", jumlah: 18 * 22500, tanggal: new Date("2026-05-25") }] },
      },
    })
    await tx.stockMutation.create({ data: { rokok_id: rokok["LA Bold"].id, tanggal: new Date("2026-05-25"), jenis: "out", qty: 20, source: "distribusi_sales",    reference_id: tj5.id, user_id: superadmin.id } })
    await tx.stockMutation.create({ data: { rokok_id: rokok["LA Bold"].id, tanggal: new Date("2026-05-25"), jenis: "in",  qty: 2,  source: "konsinyasi_kembali", reference_id: tj5.id, user_id: superadmin.id } })

    const tj6 = await tx.titipJual.create({
      data: {
        sesi_id: s6.id, sales_id: salesMap["Budi Santoso"].id,
        toko_id: tokoMap["Grosir Sentral"].id, kategori: "grosir",
        tanggal_jatuh_tempo: new Date("2026-05-31"), status: "aktif",
        items: { create: [{ rokok_id: rokok["Marlboro Merah"].id, qty_keluar: 20, harga: 31000 }] },
      },
    })
    await tx.stockMutation.create({ data: { rokok_id: rokok["Marlboro Merah"].id, tanggal: new Date("2026-05-26"), jenis: "out", qty: 20, source: "distribusi_sales", reference_id: tj6.id, user_id: superadmin.id } })

    const tj7 = await tx.titipJual.create({
      data: {
        sesi_id: s7.id, sales_id: salesMap["Agus Prasetyo"].id,
        toko_id: tokoMap["Minimarket Almaz"].id, kategori: "toko",
        tanggal_jatuh_tempo: new Date("2026-05-31"), status: "aktif",
        items: { create: [{ rokok_id: rokok["LA Bold"].id, qty_keluar: 15, harga: 22500 }] },
      },
    })
    await tx.stockMutation.create({ data: { rokok_id: rokok["LA Bold"].id, tanggal: new Date("2026-05-26"), jenis: "out", qty: 15, source: "distribusi_sales", reference_id: tj7.id, user_id: superadmin.id } })

    // ─── Sample Harian (10 Sesi) ──────────────────────────────────────────────
    for (let i = 0; i < 10; i++) {
      const date = new Date("2026-05-22")
      date.setDate(date.getDate() + i)
      const isSelesai = i < 8
      const sh = await tx.sampleHarian.create({
        data: {
          tanggal: date,
          status: isSelesai ? "selesai" : "buka",
          catatan: `Sesi Sample Harian ${i + 1}`,
          items: {
            create: [
              { rokok_id: rokok["Gudang Garam Surya 12"].id, type: "biasa", qty_keluar: 10, qty_kembali: isSelesai ? 8 : 0 },
              { rokok_id: rokok["Sampoerna A Mild 16"].id, type: "cukai", qty_keluar: 5, qty_kembali: isSelesai ? 4 : 0 }
            ]
          }
        }
      })

      // Stock Mutations
      await tx.stockMutation.create({
        data: {
          rokok_id: rokok["Gudang Garam Surya 12"].id,
          tanggal: date,
          jenis: "out",
          qty: 10,
          source: "sample_harian_keluar",
          stock_type: "sample_biasa",
          reference_id: sh.id,
          user_id: superadmin.id
        }
      })
      await tx.stockMutation.create({
        data: {
          rokok_id: rokok["Sampoerna A Mild 16"].id,
          tanggal: date,
          jenis: "out",
          qty: 5,
          source: "sample_harian_keluar",
          stock_type: "sample_cukai",
          reference_id: sh.id,
          user_id: superadmin.id
        }
      })

      if (isSelesai) {
        await tx.stockMutation.create({
          data: {
            rokok_id: rokok["Gudang Garam Surya 12"].id,
            tanggal: date,
            jenis: "in",
            qty: 8,
            source: "sample_harian_kembali",
            stock_type: "sample_biasa",
            reference_id: sh.id,
            user_id: superadmin.id
          }
        })
        await tx.stockMutation.create({
          data: {
            rokok_id: rokok["Sampoerna A Mild 16"].id,
            tanggal: date,
            jenis: "in",
            qty: 4,
            source: "sample_harian_kembali",
            stock_type: "sample_cukai",
            reference_id: sh.id,
            user_id: superadmin.id
          }
        })
      }
    }

    // ─── Audit Log ────────────────────────────────────────────────────────────
    await tx.auditLog.createMany({
      data: [
        { entity_type: "Pengeluaran", change_type: "Pembelian Alat", entity_id: "seed-sample-1", action: "CREATE",
          new_values: { tanggal: "2026-05-26", jumlah: 200000, keterangan: "Pembelian Alat Tulis Kantor" },
          user_id: admin.id, user_name: admin.name, createdAt: new Date("2026-05-26T09:15:00Z") },
        { entity_type: "Rokok", change_type: "Harga Retail & Perorangan", entity_id: rokok["Dji Sam Soe 234"].id, action: "UPDATE",
          old_values: { harga_toko: 28000, harga_perorangan: 29500 }, new_values: { harga_toko: 28500, harga_perorangan: 30000 },
          alasan: "Penyesuaian harga sesuai kenaikan harga dari supplier",
          user_id: superadmin.id, user_name: superadmin.name, createdAt: new Date("2026-05-25T10:30:00Z") },
        { entity_type: "Pengeluaran", change_type: "Penghapusan (Input Salah)", entity_id: "seed-sample-deleted", action: "DELETE",
          old_values: { tanggal: "2026-05-25", jumlah: 300000, keterangan: "Pembelian AC Gudang" },
          alasan: "Input salah, bukan pengeluaran bulan ini",
          user_id: admin.id, user_name: admin.name, createdAt: new Date("2026-05-26T08:00:00Z") },
        { entity_type: "SesiHarian", change_type: "Laporan Sore - Setoran", entity_id: s3.id, action: "UPDATE",
          old_values: { setoran_cash: 2000000 }, new_values: { setoran_cash: 2120000 },
          alasan: "Koreksi setoran laporan sore – ada selisih Rp 120.000",
          user_id: admin.id, user_name: admin.name, createdAt: new Date("2026-05-25T14:20:00Z") },
        { entity_type: "TitipJual", change_type: "Perpanjang Jatuh Tempo", entity_id: tj5.id, action: "UPDATE",
          old_values: { tanggal_jatuh_tempo: "2026-05-29" }, new_values: { tanggal_jatuh_tempo: "2026-05-30" },
          alasan: "Perpanjangan jatuh tempo atas permintaan pemilik Warung Bu Siti",
          user_id: admin.id, user_name: admin.name, createdAt: new Date("2026-05-25T11:45:00Z") },
        { entity_type: "Rokok", change_type: "Penghapusan Produk", entity_id: "seed-rokok-deleted", action: "DELETE",
          old_values: { nama: "Marlboro Light", harga_beli: 28000, stok: 0 },
          alasan: "Produk tidak tersedia lagi dari supplier",
          user_id: superadmin.id, user_name: superadmin.name, createdAt: new Date("2026-05-26T09:00:00Z") },
      ],
    })

    // ─── Re-Sync Cache Stok ───────────────────────────────────────────────────
    const allRokok = await tx.rokok.findMany()
    for (const r of allRokok) {
      const muts = await tx.stockMutation.groupBy({
        by: ["jenis"], where: { rokok_id: r.id }, _sum: { qty: true },
      })
      const totalIn  = muts.find(m => m.jenis === "in" )?._sum.qty || 0
      const totalOut = muts.find(m => m.jenis === "out")?._sum.qty || 0
      await tx.rokok.update({ where: { id: r.id }, data: { stok: totalIn - totalOut } })
    }
  }, { timeout: 60000 })

  console.log("✅ Seed data berhasil dibuat!")
  console.log("   Rokok      : 8 jenis")
  console.log("   Sales      : 5 orang | Toko: 6")
  console.log("   Distribusi : 8 selesai, 2 aktif (Total 10)")
  console.log("   Titip Jual : 5 selesai, 2 aktif (Total 7)")
  console.log("   Sample Hari: 8 selesai, 2 buka (Total 10)")
  console.log("   Pengeluaran: 15 | Retur: 5 | Audit Log: 6")
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
