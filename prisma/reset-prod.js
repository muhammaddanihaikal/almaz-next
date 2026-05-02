const { PrismaClient } = require("@prisma/client")
const prisma = new PrismaClient()

async function main() {
  console.log("🚀 Memulai reset data production (kecuali User)...")
  
  try {
    await prisma.$transaction(async (tx) => {
      // Hapus data transaksi & audit terlebih dahulu (karena ada foreign key)
      console.log("- Menghapus Audit Log & Closing...");
      await tx.auditLog.deleteMany({})
      await tx.closingHarian.deleteMany({})
      await tx.stockMutation.deleteMany({})
      
      console.log("- Menghapus Titip Jual & Setoran...");
      await tx.titipJualSetoran.deleteMany({})
      await tx.titipJualItem.deleteMany({})
      await tx.titipJual.deleteMany({})
      
      console.log("- Menghapus Sesi Harian & Distribusi...");
      await tx.sesiSetoran.deleteMany({})
      await tx.sesiPenjualan.deleteMany({})
      await tx.sesiBarangKembali.deleteMany({})
      await tx.sesiBarangKeluar.deleteMany({})
      await tx.sesiHarian.deleteMany({})
      
      console.log("- Menghapus Retur & Tukar Barang...");
      await tx.returItem.deleteMany({})
      await tx.retur.deleteMany({})
      await tx.tukarBarangItemMasuk.deleteMany({})
      await tx.tukarBarangItemKeluar.deleteMany({})
      await tx.tukarBarang.deleteMany({})
      
      console.log("- Menghapus Absensi & Stok Masuk...");
      await tx.absensi.deleteMany({})
      await tx.stokMasuk.deleteMany({})
      
      console.log("- Menghapus Master Data (Rokok, Toko, Sales)...");
      await tx.pengeluaran.deleteMany({})
      await tx.toko.deleteMany({})
      await tx.sales.deleteMany({})
      await tx.rokok.deleteMany({})
      
      // TABEL USER TIDAK DIHAPUS
      console.log("✅ Data berhasil dibersihkan! (Tabel User tetap utuh)");
    }, { timeout: 60000 })
  } catch (error) {
    console.error("❌ Gagal mereset data:", error)
  } finally {
    await prisma.$disconnect()
  }
}

main()
