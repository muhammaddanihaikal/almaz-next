-- AlterTable
ALTER TABLE "Pengeluaran" ADD COLUMN     "sumber" TEXT NOT NULL DEFAULT 'penjualan';

-- CreateTable
CREATE TABLE "TukarBarang" (
    "id" TEXT NOT NULL,
    "tanggal" DATE NOT NULL,
    "sesi_id" TEXT NOT NULL,
    "toko_id" TEXT NOT NULL,
    "selisih_uang" INTEGER NOT NULL DEFAULT 0,
    "catatan" TEXT,
    "pengeluaran_id" TEXT,
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
CREATE INDEX "TukarBarang_tanggal_idx" ON "TukarBarang"("tanggal");

-- CreateIndex
CREATE INDEX "TukarBarang_sesi_id_idx" ON "TukarBarang"("sesi_id");

-- AddForeignKey
ALTER TABLE "TukarBarang" ADD CONSTRAINT "TukarBarang_sesi_id_fkey" FOREIGN KEY ("sesi_id") REFERENCES "SesiHarian"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TukarBarang" ADD CONSTRAINT "TukarBarang_toko_id_fkey" FOREIGN KEY ("toko_id") REFERENCES "Toko"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TukarBarangItemMasuk" ADD CONSTRAINT "TukarBarangItemMasuk_tukar_id_fkey" FOREIGN KEY ("tukar_id") REFERENCES "TukarBarang"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TukarBarangItemMasuk" ADD CONSTRAINT "TukarBarangItemMasuk_rokok_id_fkey" FOREIGN KEY ("rokok_id") REFERENCES "Rokok"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TukarBarangItemKeluar" ADD CONSTRAINT "TukarBarangItemKeluar_tukar_id_fkey" FOREIGN KEY ("tukar_id") REFERENCES "TukarBarang"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TukarBarangItemKeluar" ADD CONSTRAINT "TukarBarangItemKeluar_rokok_id_fkey" FOREIGN KEY ("rokok_id") REFERENCES "Rokok"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
