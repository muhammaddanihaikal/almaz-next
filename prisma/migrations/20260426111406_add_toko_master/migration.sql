/*
  Warnings:

  - You are about to drop the column `nama_toko` on the `Konsinyasi` table. All the data in the column will be lost.
  - Added the required column `toko_id` to the `Konsinyasi` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Konsinyasi" DROP COLUMN "nama_toko",
ADD COLUMN     "toko_id" TEXT NOT NULL;

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
CREATE TABLE "Retur" (
    "id" TEXT NOT NULL,
    "tanggal" DATE NOT NULL,
    "tipe_penjualan" TEXT,
    "sales_id" TEXT NOT NULL,
    "alasan" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Retur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReturItem" (
    "id" TEXT NOT NULL,
    "retur_id" TEXT NOT NULL,
    "rokok_id" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,

    CONSTRAINT "ReturItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Toko_nama_key" ON "Toko"("nama");

-- AddForeignKey
ALTER TABLE "Konsinyasi" ADD CONSTRAINT "Konsinyasi_toko_id_fkey" FOREIGN KEY ("toko_id") REFERENCES "Toko"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Retur" ADD CONSTRAINT "Retur_sales_id_fkey" FOREIGN KEY ("sales_id") REFERENCES "Sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturItem" ADD CONSTRAINT "ReturItem_retur_id_fkey" FOREIGN KEY ("retur_id") REFERENCES "Retur"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturItem" ADD CONSTRAINT "ReturItem_rokok_id_fkey" FOREIGN KEY ("rokok_id") REFERENCES "Rokok"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
