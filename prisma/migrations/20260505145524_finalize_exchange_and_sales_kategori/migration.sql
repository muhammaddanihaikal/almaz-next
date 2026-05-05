/*
  Warnings:

  - You are about to drop the column `harga_retail` on the `Rokok` table. All the data in the column will be lost.
  - You are about to drop the column `retail_id` on the `TitipJual` table. All the data in the column will be lost.
  - You are about to drop the `Retail` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `harga_toko` to the `Rokok` table without a default value. This is not possible if the table is not empty.
  - Added the required column `toko_id` to the `TitipJual` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "TitipJual" DROP CONSTRAINT "TitipJual_toko_id_fkey";

-- AlterTable
ALTER TABLE "Rokok" DROP COLUMN "harga_retail",
ADD COLUMN     "harga_toko" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "Sales" ADD COLUMN     "kategori" TEXT NOT NULL DEFAULT 'grosir';

-- AlterTable
ALTER TABLE "TitipJual" DROP COLUMN "retail_id",
ADD COLUMN     "toko_id" TEXT NOT NULL;

-- DropTable
DROP TABLE "Retail";

-- CreateTable
CREATE TABLE "Toko" (
    "id" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "alamat" TEXT,
    "kategori" TEXT NOT NULL DEFAULT 'toko',
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Toko_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TukarBarang" (
    "id" TEXT NOT NULL,
    "tanggal" DATE NOT NULL,
    "sesi_id" TEXT NOT NULL,
    "sesi_selesai_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'aktif',
    "kategori" TEXT NOT NULL DEFAULT 'grosir',
    "tanggal_selesai" DATE,
    "selisih_uang" INTEGER NOT NULL DEFAULT 0,
    "catatan" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TukarBarang_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TukarBarangItemMasuk" (
    "id" TEXT NOT NULL,
    "tukar_id" TEXT NOT NULL,
    "rokok_id" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "harga_satuan" INTEGER NOT NULL,

    CONSTRAINT "TukarBarangItemMasuk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TukarBarangItemKeluar" (
    "id" TEXT NOT NULL,
    "tukar_id" TEXT NOT NULL,
    "rokok_id" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "harga_satuan" INTEGER NOT NULL,

    CONSTRAINT "TukarBarangItemKeluar_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Toko_nama_key" ON "Toko"("nama");

-- CreateIndex
CREATE INDEX "TukarBarang_tanggal_idx" ON "TukarBarang"("tanggal");

-- CreateIndex
CREATE INDEX "TukarBarang_sesi_id_idx" ON "TukarBarang"("sesi_id");

-- CreateIndex
CREATE INDEX "TukarBarang_status_idx" ON "TukarBarang"("status");

-- AddForeignKey
ALTER TABLE "TitipJual" ADD CONSTRAINT "TitipJual_toko_id_fkey" FOREIGN KEY ("toko_id") REFERENCES "Toko"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TukarBarang" ADD CONSTRAINT "TukarBarang_sesi_id_fkey" FOREIGN KEY ("sesi_id") REFERENCES "SesiHarian"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TukarBarang" ADD CONSTRAINT "TukarBarang_sesi_selesai_id_fkey" FOREIGN KEY ("sesi_selesai_id") REFERENCES "SesiHarian"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TukarBarangItemMasuk" ADD CONSTRAINT "TukarBarangItemMasuk_tukar_id_fkey" FOREIGN KEY ("tukar_id") REFERENCES "TukarBarang"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TukarBarangItemMasuk" ADD CONSTRAINT "TukarBarangItemMasuk_rokok_id_fkey" FOREIGN KEY ("rokok_id") REFERENCES "Rokok"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TukarBarangItemKeluar" ADD CONSTRAINT "TukarBarangItemKeluar_tukar_id_fkey" FOREIGN KEY ("tukar_id") REFERENCES "TukarBarang"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TukarBarangItemKeluar" ADD CONSTRAINT "TukarBarangItemKeluar_rokok_id_fkey" FOREIGN KEY ("rokok_id") REFERENCES "Rokok"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
