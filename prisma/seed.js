const { PrismaClient } = require("@prisma/client")
const bcrypt = require("bcryptjs")

const prisma = new PrismaClient()

async function main() {
  console.log("Memulai proses seeding data yang komprehensif...")
  
  await prisma.$transaction(async (tx) => {
    // ─── Clear Data ───────────────────────────────────────────────────────────
    console.log("Membersihkan data lama...")
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
    console.log("Memasukkan data pengguna (5)...")
    const pass = await bcrypt.hash("admin123", 10)
    const users = [
      { username: "mdanihaikal", name: "M. Dani Haikal", role: "superadmin" },
      { username: "bossalmaz",   name: "Boss Almaz",     role: "admin"      },
      { username: "manager01",   name: "Manager Gudang", role: "admin"      },
      { username: "kasir01",     name: "Kasir Satu",     role: "staff"      },
      { username: "staff02",     name: "Staff Dua",      role: "staff"      },
    ]
    
    const userMap = {}
    for (const u of users) {
      userMap[u.username] = await tx.user.upsert({
        where:  { username: u.username },
        update: { role: u.role, name: u.name },
        create: { username: u.username, password: pass, name: u.name, role: u.role },
      })
    }

    // ─── Rokok ────────────────────────────────────────────────────────────────
    console.log("Memasukkan data rokok (13)...")
    const rokokData = [
      { nama: "Gudang Garam Surya 12", harga_beli: 20000, harga_grosir: 22000, harga_toko: 23000, harga_perorangan: 25000, urutan: 1, stok_awal: 1000 },
      { nama: "Sampoerna A Mild 16",   harga_beli: 22000, harga_grosir: 24500, harga_toko: 25500, harga_perorangan: 27500, urutan: 2, stok_awal: 800  },
      { nama: "Dji Sam Soe 234",       harga_beli: 25000, harga_grosir: 27500, harga_toko: 28500, harga_perorangan: 30000, urutan: 3, stok_awal: 500  },
      { nama: "Marlboro Merah",        harga_beli: 29000, harga_grosir: 31000, harga_toko: 32500, harga_perorangan: 35000, urutan: 4, stok_awal: 400  },
      { nama: "LA Bold",               harga_beli: 19500, harga_grosir: 21500, harga_toko: 22500, harga_perorangan: 24500, urutan: 5, stok_awal: 600  },
      { nama: "Gudang Garam Merah",    harga_beli: 17500, harga_grosir: 19500, harga_toko: 20500, harga_perorangan: 22500, urutan: 6, stok_awal: 1200 },
      { nama: "Camel Filter",          harga_beli: 24000, harga_grosir: 26000, harga_toko: 27000, harga_perorangan: 29000, urutan: 7, stok_awal: 300  },
      { nama: "Dunhill Filter",        harga_beli: 26000, harga_grosir: 28000, harga_toko: 29500, harga_perorangan: 32000, urutan: 8, stok_awal: 350  },
      { nama: "Djarum Super 12",       harga_beli: 21000, harga_grosir: 23000, harga_toko: 24000, harga_perorangan: 26000, urutan: 9, stok_awal: 400  },
      { nama: "Djarum 76",             harga_beli: 16000, harga_grosir: 18000, harga_toko: 19000, harga_perorangan: 21000, urutan: 10, stok_awal: 500 },
      { nama: "Juara Teh Manis",       harga_beli: 14000, harga_grosir: 16000, harga_toko: 17000, harga_perorangan: 19000, urutan: 11, stok_awal: 300 },
      { nama: "Esse Change",           harga_beli: 28000, harga_grosir: 30000, harga_toko: 31500, harga_perorangan: 34000, urutan: 12, stok_awal: 250 },
      { nama: "Gudang Garam Surya 16", harga_beli: 25500, harga_grosir: 27500, harga_toko: 28500, harga_perorangan: 31000, urutan: 13, stok_awal: 400 },
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
        data: { rokok_id: item.id, tanggal: new Date("2026-04-01"), jenis: "in", qty: r.stok_awal, source: "stok_awal", reference_id: sm.id, keterangan: "Saldo awal sistem", user_id: userMap["mdanihaikal"].id },
      })
    }

    // ─── Sales ────────────────────────────────────────────────────────────────
    console.log("Memasukkan data sales (6)...")
    const salesNames = [
      ["Budi Santoso",  "081234567890"],
      ["Agus Prasetyo", "081234567891"],
      ["Siti Rahayu",   "081234567892"],
      ["Hendra Kusuma", "081234567893"],
      ["Dian Safitri",  "081234567894"],
      ["Rizky Ramadhan", "081234567895"],
    ]
    const salesMap = {}
    for (const [nama, no_hp] of salesNames) {
      salesMap[nama] = await tx.sales.create({ data: { nama, no_hp } })
    }

    // ─── Toko ─────────────────────────────────────────────────────────────────
    console.log("Memasukkan data toko (11)...")
    const tokoData = [
      { nama: "Toko Berkah",       alamat: "Jl. Merdeka No. 10",     kategori: "toko"   },
      { nama: "Grosir Jaya",       alamat: "Pasar Baru Blok A-12",   kategori: "grosir" },
      { nama: "Warung Bu Siti",    alamat: "Jl. Mawar No. 5",        kategori: "toko"   },
      { nama: "Minimarket Almaz",  alamat: "Jl. Almaz Raya No. 1",   kategori: "toko"   },
      { nama: "Toko Murah Meriah", alamat: "Jl. Pahlawan No. 22",    kategori: "toko"   },
      { nama: "Grosir Sentral",    alamat: "Pasar Induk Blok D-3",   kategori: "grosir" },
      { nama: "Warung Pak Haji",   alamat: "Jl. Kebon Jeruk No. 8",  kategori: "toko"   },
      { nama: "Toko Barokah",      alamat: "Jl. Melati No. 15",      kategori: "toko"   },
      { nama: "Minimarket Sejahtera", alamat: "Jl. Damai No. 3",      kategori: "toko"   },
      { nama: "Grosir Maju",       alamat: "Pasar Lama Blok C-5",    kategori: "grosir" },
      { nama: "Toko Serbaguna",    alamat: "Jl. Kenanga No. 12",     kategori: "toko"   },
    ]
    const tokoMap = {}
    for (const t of tokoData) {
      tokoMap[t.nama] = await tx.toko.create({ data: t })
    }

    // ─── Absensi ──────────────────────────────────────────────────────────────
    console.log("Memasukkan data absensi (6 sales x 14 hari)...")
    const startDate = new Date("2026-04-18")
    const endDate = new Date("2026-05-01")
    for (const salesNama of Object.keys(salesMap)) {
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const key = d.toISOString().split("T")[0]
        // Acak status absensi
        const rand = Math.random()
        let status = "hadir"
        if (rand > 0.95) status = "alpha"
        else if (rand > 0.90) status = "sakit"
        else if (rand > 0.85) status = "izin"

        await tx.absensi.create({
          data: { tanggal: new Date(key), sales_id: salesMap[salesNama].id, status },
        })
      }
    }

    // ─── Pengeluaran ──────────────────────────────────────────────────────────
    console.log("Memasukkan data pengeluaran (15)...")
    const expData = [
      ["2026-04-18", 50000, "Bensin Motor Budi"],
      ["2026-04-19", 150000, "Makan Siang Tim"],
      ["2026-04-20", 25000, "Parkir & Tol"],
      ["2026-04-21", 500000, "Maintenance Gudang"],
      ["2026-04-22", 75000, "Bensin Agus"],
      ["2026-04-24", 200000, "Alat Tulis Kantor"],
      ["2026-04-25", 120000, "Servis AC Kantor"],
      ["2026-04-26", 35000, "Bensin Siti"],
      ["2026-04-27", 80000, "Listrik Kantor"],
      ["2026-04-28", 1200000, "Gaji Staff Gudang"],
      ["2026-04-29", 45000, "Parkir & Tol"],
      ["2026-04-30", 85000, "Bensin Hendra"],
      ["2026-05-01", 100000, "Pembelian Air Galon"],
      ["2026-05-01", 50000, "Bensin Dian"],
      ["2026-04-23", 60000, "Konsumsi Rapat Internal"],
    ]
    for (const [tgl, jumlah, keterangan] of expData) {
      await tx.pengeluaran.create({ data: { tanggal: new Date(tgl), jumlah, keterangan } })
    }

    // ─── Retur ────────────────────────────────────────────────────────────────
    console.log("Memasukkan data retur (5)...")
    const returData = [
      { tgl: "2026-04-20", sales: "Budi Santoso", item: "Gudang Garam Surya 12", qty: 10, alasan: "Bungkus rusak" },
      { tgl: "2026-04-25", sales: "Agus Prasetyo", item: "Sampoerna A Mild 16", qty: 5, alasan: "Hampir kadaluarsa" },
      { tgl: "2026-04-27", sales: "Siti Rahayu", item: "LA Bold", qty: 3, alasan: "Kena air hujan" },
      { tgl: "2026-04-29", sales: "Hendra Kusuma", item: "Dji Sam Soe 234", qty: 2, alasan: "Salah pengiriman" },
      { tgl: "2026-04-30", sales: "Dian Safitri", item: "Djarum Super 12", qty: 4, alasan: "Bungkus penyok" },
    ]
    for (const r of returData) {
      const ret = await tx.retur.create({
        data: {
          tanggal: new Date(r.tgl),
          sales_id: salesMap[r.sales].id,
          alasan: r.alasan,
          items: { create: [{ rokok_id: rokok[r.item].id, qty: r.qty }] }
        }
      })
      await tx.stockMutation.create({
        data: { rokok_id: rokok[r.item].id, tanggal: new Date(r.tgl), jenis: "in", qty: r.qty, source: "retur", reference_id: ret.id, keterangan: `Retur: ${r.alasan}`, user_id: userMap["mdanihaikal"].id }
      })
    }

    // ─── Helper: Sesi Harian ──────────────────────────────────────────────────
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
        await tx.stockMutation.create({ data: { rokok_id: rokok[k.nama].id, tanggal: new Date(tgl), jenis: "out", qty: k.qty, source: "distribusi_sales", reference_id: sesi.id, user_id: userMap["mdanihaikal"].id } })
      }
      for (const k of kembali) {
        await tx.stockMutation.create({ data: { rokok_id: rokok[k.nama].id, tanggal: new Date(tgl), jenis: "in",  qty: k.qty, source: "retur_sales",      reference_id: sesi.id, user_id: userMap["mdanihaikal"].id } })
      }
      return sesi
    }

    // ─── Distribusi: 15 Selesai (Campuran Produk) ─────────────────────────────
    console.log("Memasukkan data distribusi selesai (15 dengan campuran produk)...")
    const rNames = Object.keys(rokok)
    const sesiSelesaiData = [
      { tgl: "2026-04-18", sales: "Budi Santoso",  items: [{ n: rNames[0], q: 80 }, { n: rNames[5], q: 100 }] },
      { tgl: "2026-04-18", sales: "Agus Prasetyo", items: [{ n: rNames[1], q: 60 }, { n: rNames[4], q: 50 }] },
      { tgl: "2026-04-19", sales: "Siti Rahayu",   items: [{ n: rNames[4], q: 70 }, { n: rNames[2], q: 40 }] },
      { tgl: "2026-04-19", sales: "Hendra Kusuma", items: [{ n: rNames[5], q: 120 }, { n: rNames[0], q: 50 }] },
      { tgl: "2026-04-20", sales: "Dian Safitri",  items: [{ n: rNames[2], q: 30 }, { n: rNames[3], q: 20 }, { n: rNames[8], q: 30 }] },
      { tgl: "2026-04-21", sales: "Budi Santoso",  items: [{ n: rNames[6], q: 50 }, { n: rNames[7], q: 40 }] },
      { tgl: "2026-04-22", sales: "Agus Prasetyo", items: [{ n: rNames[7], q: 40 }, { n: rNames[1], q: 30 }] },
      { tgl: "2026-04-23", sales: "Siti Rahayu",   items: [{ n: rNames[8], q: 60 }, { n: rNames[9], q: 50 }] },
      { tgl: "2026-04-24", sales: "Hendra Kusuma", items: [{ n: rNames[9], q: 80 }, { n: rNames[5], q: 60 }] },
      { tgl: "2026-04-25", sales: "Dian Safitri",  items: [{ n: rNames[11], q: 25 }, { n: rNames[4], q: 30 }] },
      { tgl: "2026-04-26", sales: "Budi Santoso",  items: [{ n: rNames[12], q: 50 }, { n: rNames[0], q: 40 }] },
      { tgl: "2026-04-27", sales: "Agus Prasetyo", items: [{ n: rNames[0], q: 70 }, { n: rNames[5], q: 80 }] },
      { tgl: "2026-04-28", sales: "Siti Rahayu",   items: [{ n: rNames[1], q: 50 }, { n: rNames[2], q: 30 }, { n: rNames[4], q: 40 }] },
      { tgl: "2026-04-29", sales: "Hendra Kusuma", items: [{ n: rNames[4], q: 90 }, { n: rNames[6], q: 30 }] },
      { tgl: "2026-04-30", sales: "Dian Safitri",  items: [{ n: rNames[5], q: 110 }, { n: rNames[3], q: 40 }] },
    ]

    const sesiMap = []
    for (const s of sesiSelesaiData) {
      const keluar = s.items.map(it => ({ nama: it.n, qty: it.q }))
      const penjualan = s.items.map(it => {
        const prod = rokok[it.n]
        const terjual = Math.floor(it.q * 0.9)
        return { nama: it.n, kategori: "toko", qty: terjual, harga: prod.harga_toko }
      })
      const kembali = s.items.map(it => {
        const terjual = Math.floor(it.q * 0.9)
        return { nama: it.n, qty: it.q - terjual }
      })
      
      const totalPendapatan = penjualan.reduce((sum, p) => sum + (p.qty * p.harga), 0)
      
      const sesi = await buatSesiSelesai({
        tgl: s.tgl, salesNama: s.sales,
        keluar, penjualan, kembali,
        setoran: [{ metode: "cash", jumlah: totalPendapatan }]
      })
      sesiMap.push(sesi)
    }

    // ─── Distribusi: 5 Aktif (Campuran Produk) ───────────────────────────────
    console.log("Memasukkan data distribusi aktif (5 dengan campuran produk)...")
    const salesAktif = ["Budi Santoso", "Agus Prasetyo", "Siti Rahayu", "Hendra Kusuma", "Dian Safitri"]
    for (const sn of salesAktif) {
      const i1 = Math.floor(Math.random() * rNames.length)
      const i2 = (i1 + 1) % rNames.length
      const items = [
        { rokok_id: rokok[rNames[i1]].id, qty: 100 },
        { rokok_id: rokok[rNames[i2]].id, qty: 50 }
      ]
      
      const sesi = await tx.sesiHarian.create({
        data: {
          tanggal: new Date("2026-05-01"),
          sales_id: salesMap[sn].id,
          status: "aktif",
          barangKeluar: { create: items }
        }
      })
      
      for (const it of items) {
        await tx.stockMutation.create({ 
          data: { 
            rokok_id: it.rokok_id, 
            tanggal: new Date("2026-05-01"), 
            jenis: "out", 
            qty: it.qty, 
            source: "distribusi_sales", 
            reference_id: sesi.id, 
            user_id: userMap["mdanihaikal"].id 
          } 
        })
      }
    }

    // ─── Titip Jual ────────────────────────────────────────────────────────────
    console.log("Memasukkan data titip jual (10)...")
    const tjData = [
      { sIdx: 0, sales: "Budi Santoso", toko: "Toko Berkah", r: "Dji Sam Soe 234", q: 20, tglOut: "2026-04-18", status: "selesai" },
      { sIdx: 2, sales: "Siti Rahayu", toko: "Grosir Jaya", r: "Gudang Garam Merah", q: 50, tglOut: "2026-04-19", status: "selesai" },
      { sIdx: 4, sales: "Dian Safitri", toko: "Warung Bu Siti", r: "LA Bold", q: 30, tglOut: "2026-04-20", status: "aktif", due: "2026-05-05" },
      { sIdx: 5, sales: "Budi Santoso", toko: "Minimarket Almaz", r: "Camel Filter", q: 25, tglOut: "2026-04-21", status: "aktif", due: "2026-04-28" }, // Overdue
      { sIdx: 6, sales: "Agus Prasetyo", toko: "Toko Murah Meriah", r: "Dunhill Filter", q: 15, tglOut: "2026-04-22", status: "aktif", due: "2026-05-01" }, // Today
      { sIdx: 7, sales: "Siti Rahayu", toko: "Grosir Sentral", r: "Djarum Super 12", q: 40, tglOut: "2026-04-23", status: "aktif", due: "2026-05-10" },
      { sIdx: 8, sales: "Hendra Kusuma", toko: "Warung Pak Haji", r: "Djarum 76", q: 20, tglOut: "2026-04-24", status: "aktif", due: "2026-05-08" },
      { sIdx: 9, sales: "Dian Safitri", toko: "Toko Barokah", r: "Esse Change", q: 10, tglOut: "2026-04-25", status: "aktif", due: "2026-05-05" },
      { sIdx: 10, sales: "Budi Santoso", toko: "Minimarket Sejahtera", r: "Gudang Garam Surya 16", q: 30, tglOut: "2026-04-26", status: "aktif", due: "2026-05-15" },
      { sIdx: 11, sales: "Agus Prasetyo", toko: "Grosir Maju", r: "Gudang Garam Surya 12", q: 60, tglOut: "2026-04-27", status: "aktif", due: "2026-05-20" },
    ]

    for (const tj of tjData) {
      const prod = rokok[tj.r]
      const tjRec = await tx.titipJual.create({
        data: {
          sesi_id: sesiMap[tj.sIdx].id,
          sales_id: salesMap[tj.sales].id,
          toko_id: tokoMap[tj.toko].id,
          kategori: tokoMap[tj.toko].kategori,
          tanggal_jatuh_tempo: new Date(tj.due || "2026-04-30"),
          status: tj.status,
          items: { create: [{ rokok_id: prod.id, qty_keluar: tj.q, harga: prod.harga_toko }] }
        }
      })
      await tx.stockMutation.create({ data: { rokok_id: prod.id, tanggal: new Date(tj.tglOut), jenis: "out", qty: tj.q, source: "distribusi_sales", reference_id: tjRec.id, user_id: userMap["mdanihaikal"].id } })
      
      if (tj.status === "selesai") {
        await tx.titipJualSetoran.create({
          data: { titip_jual_id: tjRec.id, metode: "transfer", jumlah: tj.q * prod.harga_toko, tanggal: new Date("2026-04-28") }
        })
      }
    }

    // ─── Audit Log ────────────────────────────────────────────────────────────
    console.log("Memasukkan data audit log (15)...")
    const auditData = []
    const actions = ["CREATE", "UPDATE", "DELETE"]
    const entities = ["Rokok", "Toko", "Sales", "Pengeluaran", "TitipJual"]
    
    for (let i = 0; i < 15; i++) {
      const user = Object.values(userMap)[i % 5]
      auditData.push({
        entity_type: entities[i % 5],
        entity_id: `seed-id-${i}`,
        action: actions[i % 3],
        alasan: "Data dummy untuk pengujian sistem",
        user_id: user.id,
        user_name: user.name,
        createdAt: new Date(`2026-04-${10 + i}T10:00:00Z`)
      })
    }
    await tx.auditLog.createMany({ data: auditData })

    // ─── Closing Harian ───────────────────────────────────────────────────────
    console.log("Memasukkan data closing harian (30 hari)...")
    for (const rNama of Object.keys(rokok)) {
      const rId = rokok[rNama].id
      const closings = []
      for (let i = 1; i <= 30; i++) {
        closings.push({
          tanggal: new Date(`2026-04-${i < 10 ? '0'+i : i}`),
          rokok_id: rId,
          stok_akhir: 500 + Math.floor(Math.random() * 500)
        })
      }
      await tx.closingHarian.createMany({ data: closings })
    }

    // ─── Re-Sync Cache Stok ───────────────────────────────────────────────────
    console.log("Sinkronisasi cache stok...")
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

    console.log("Seed data berhasil dibuat!")
  }, { timeout: 60000 })
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
