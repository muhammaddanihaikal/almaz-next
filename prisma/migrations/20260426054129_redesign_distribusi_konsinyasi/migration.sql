/*
  Warnings:

  - You are about to drop the `Penjualan` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PenjualanKeluar` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PenjualanMasuk` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Retur` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ReturItem` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Toko` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Penjualan" DROP CONSTRAINT "Penjualan_sales_id_fkey";

-- DropForeignKey
ALTER TABLE "Penjualan" DROP CONSTRAINT "Penjualan_toko_id_fkey";

-- DropForeignKey
ALTER TABLE "PenjualanKeluar" DROP CONSTRAINT "PenjualanKeluar_penjualan_id_fkey";

-- DropForeignKey
ALTER TABLE "PenjualanKeluar" DROP CONSTRAINT "PenjualanKeluar_rokok_id_fkey";

-- DropForeignKey
ALTER TABLE "PenjualanMasuk" DROP CONSTRAINT "PenjualanMasuk_penjualan_id_fkey";

-- DropForeignKey
ALTER TABLE "PenjualanMasuk" DROP CONSTRAINT "PenjualanMasuk_rokok_id_fkey";

-- DropForeignKey
ALTER TABLE "Retur" DROP CONSTRAINT "Retur_sales_id_fkey";

-- DropForeignKey
ALTER TABLE "ReturItem" DROP CONSTRAINT "ReturItem_retur_id_fkey";

-- DropForeignKey
ALTER TABLE "ReturItem" DROP CONSTRAINT "ReturItem_rokok_id_fkey";

-- DropTable
DROP TABLE "Penjualan";

-- DropTable
DROP TABLE "PenjualanKeluar";

-- DropTable
DROP TABLE "PenjualanMasuk";

-- DropTable
DROP TABLE "Retur";

-- DropTable
DROP TABLE "ReturItem";

-- DropTable
DROP TABLE "Toko";

-- CreateTable
CREATE TABLE "SesiHarian" (
    "id" TEXT NOT NULL,
    "tanggal" DATE NOT NULL,
    "sales_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'aktif',
    "catatan" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SesiHarian_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SesiBarangKeluar" (
    "id" TEXT NOT NULL,
    "sesi_id" TEXT NOT NULL,
    "rokok_id" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,

    CONSTRAINT "SesiBarangKeluar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SesiPenjualan" (
    "id" TEXT NOT NULL,
    "sesi_id" TEXT NOT NULL,
    "rokok_id" TEXT NOT NULL,
    "kategori" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "harga" INTEGER NOT NULL,

    CONSTRAINT "SesiPenjualan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SesiSetoran" (
    "id" TEXT NOT NULL,
    "sesi_id" TEXT NOT NULL,
    "metode" TEXT NOT NULL,
    "jumlah" INTEGER NOT NULL,

    CONSTRAINT "SesiSetoran_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SesiBarangKembali" (
    "id" TEXT NOT NULL,
    "sesi_id" TEXT NOT NULL,
    "rokok_id" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,

    CONSTRAINT "SesiBarangKembali_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Konsinyasi" (
    "id" TEXT NOT NULL,
    "sesi_id" TEXT NOT NULL,
    "sales_id" TEXT NOT NULL,
    "nama_toko" TEXT NOT NULL,
    "kategori" TEXT NOT NULL,
    "tanggal_jatuh_tempo" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'aktif',
    "catatan" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Konsinyasi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KonsinyasiItem" (
    "id" TEXT NOT NULL,
    "konsinyasi_id" TEXT NOT NULL,
    "rokok_id" TEXT NOT NULL,
    "qty_keluar" INTEGER NOT NULL,
    "qty_terjual" INTEGER NOT NULL DEFAULT 0,
    "qty_kembali" INTEGER NOT NULL DEFAULT 0,
    "harga" INTEGER NOT NULL,

    CONSTRAINT "KonsinyasiItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KonsinyasiSetoran" (
    "id" TEXT NOT NULL,
    "konsinyasi_id" TEXT NOT NULL,
    "metode" TEXT NOT NULL,
    "jumlah" INTEGER NOT NULL,
    "tanggal" DATE NOT NULL,
    "sesi_penyelesaian_id" TEXT,

    CONSTRAINT "KonsinyasiSetoran_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SesiHarian_tanggal_sales_id_key" ON "SesiHarian"("tanggal", "sales_id");

-- AddForeignKey
ALTER TABLE "SesiHarian" ADD CONSTRAINT "SesiHarian_sales_id_fkey" FOREIGN KEY ("sales_id") REFERENCES "Sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SesiBarangKeluar" ADD CONSTRAINT "SesiBarangKeluar_sesi_id_fkey" FOREIGN KEY ("sesi_id") REFERENCES "SesiHarian"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SesiBarangKeluar" ADD CONSTRAINT "SesiBarangKeluar_rokok_id_fkey" FOREIGN KEY ("rokok_id") REFERENCES "Rokok"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SesiPenjualan" ADD CONSTRAINT "SesiPenjualan_sesi_id_fkey" FOREIGN KEY ("sesi_id") REFERENCES "SesiHarian"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SesiPenjualan" ADD CONSTRAINT "SesiPenjualan_rokok_id_fkey" FOREIGN KEY ("rokok_id") REFERENCES "Rokok"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SesiSetoran" ADD CONSTRAINT "SesiSetoran_sesi_id_fkey" FOREIGN KEY ("sesi_id") REFERENCES "SesiHarian"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SesiBarangKembali" ADD CONSTRAINT "SesiBarangKembali_sesi_id_fkey" FOREIGN KEY ("sesi_id") REFERENCES "SesiHarian"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SesiBarangKembali" ADD CONSTRAINT "SesiBarangKembali_rokok_id_fkey" FOREIGN KEY ("rokok_id") REFERENCES "Rokok"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Konsinyasi" ADD CONSTRAINT "Konsinyasi_sesi_id_fkey" FOREIGN KEY ("sesi_id") REFERENCES "SesiHarian"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Konsinyasi" ADD CONSTRAINT "Konsinyasi_sales_id_fkey" FOREIGN KEY ("sales_id") REFERENCES "Sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KonsinyasiItem" ADD CONSTRAINT "KonsinyasiItem_konsinyasi_id_fkey" FOREIGN KEY ("konsinyasi_id") REFERENCES "Konsinyasi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KonsinyasiItem" ADD CONSTRAINT "KonsinyasiItem_rokok_id_fkey" FOREIGN KEY ("rokok_id") REFERENCES "Rokok"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KonsinyasiSetoran" ADD CONSTRAINT "KonsinyasiSetoran_konsinyasi_id_fkey" FOREIGN KEY ("konsinyasi_id") REFERENCES "Konsinyasi"("id") ON DELETE CASCADE ON UPDATE CASCADE;
