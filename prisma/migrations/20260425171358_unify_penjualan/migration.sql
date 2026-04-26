-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rokok" (
    "id" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "stok" INTEGER NOT NULL DEFAULT 0,
    "harga_beli" INTEGER NOT NULL,
    "harga_grosir" INTEGER NOT NULL,
    "harga_toko" INTEGER NOT NULL,
    "harga_perorangan" INTEGER NOT NULL,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rokok_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sales" (
    "id" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "no_hp" TEXT,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Toko" (
    "id" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "tipe" TEXT NOT NULL,
    "alamat" TEXT,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Toko_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Penjualan" (
    "id" TEXT NOT NULL,
    "tanggal" DATE NOT NULL,
    "sales_id" TEXT NOT NULL,
    "toko_id" TEXT,
    "setoran_tipe" TEXT,
    "setoran_total" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Penjualan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PenjualanKeluar" (
    "id" TEXT NOT NULL,
    "penjualan_id" TEXT NOT NULL,
    "rokok_id" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "qty_sample" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PenjualanKeluar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PenjualanMasuk" (
    "id" TEXT NOT NULL,
    "penjualan_id" TEXT NOT NULL,
    "rokok_id" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "qty_sample" INTEGER NOT NULL DEFAULT 0,
    "harga" INTEGER NOT NULL DEFAULT 0,
    "pembayaran" TEXT NOT NULL DEFAULT 'Cash',

    CONSTRAINT "PenjualanMasuk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Retur" (
    "id" TEXT NOT NULL,
    "tanggal" DATE NOT NULL,
    "tipe_penjualan" TEXT NOT NULL,
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

-- CreateTable
CREATE TABLE "Pengeluaran" (
    "id" TEXT NOT NULL,
    "tanggal" DATE NOT NULL,
    "jumlah" INTEGER NOT NULL,
    "keterangan" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pengeluaran_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Absensi" (
    "id" TEXT NOT NULL,
    "tanggal" DATE NOT NULL,
    "sales_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Absensi_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Rokok_nama_key" ON "Rokok"("nama");

-- CreateIndex
CREATE UNIQUE INDEX "Sales_nama_key" ON "Sales"("nama");

-- CreateIndex
CREATE UNIQUE INDEX "Toko_nama_key" ON "Toko"("nama");

-- CreateIndex
CREATE UNIQUE INDEX "Absensi_tanggal_sales_id_key" ON "Absensi"("tanggal", "sales_id");

-- AddForeignKey
ALTER TABLE "Penjualan" ADD CONSTRAINT "Penjualan_sales_id_fkey" FOREIGN KEY ("sales_id") REFERENCES "Sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Penjualan" ADD CONSTRAINT "Penjualan_toko_id_fkey" FOREIGN KEY ("toko_id") REFERENCES "Toko"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PenjualanKeluar" ADD CONSTRAINT "PenjualanKeluar_penjualan_id_fkey" FOREIGN KEY ("penjualan_id") REFERENCES "Penjualan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PenjualanKeluar" ADD CONSTRAINT "PenjualanKeluar_rokok_id_fkey" FOREIGN KEY ("rokok_id") REFERENCES "Rokok"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PenjualanMasuk" ADD CONSTRAINT "PenjualanMasuk_penjualan_id_fkey" FOREIGN KEY ("penjualan_id") REFERENCES "Penjualan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PenjualanMasuk" ADD CONSTRAINT "PenjualanMasuk_rokok_id_fkey" FOREIGN KEY ("rokok_id") REFERENCES "Rokok"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Retur" ADD CONSTRAINT "Retur_sales_id_fkey" FOREIGN KEY ("sales_id") REFERENCES "Sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturItem" ADD CONSTRAINT "ReturItem_retur_id_fkey" FOREIGN KEY ("retur_id") REFERENCES "Retur"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturItem" ADD CONSTRAINT "ReturItem_rokok_id_fkey" FOREIGN KEY ("rokok_id") REFERENCES "Rokok"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Absensi" ADD CONSTRAINT "Absensi_sales_id_fkey" FOREIGN KEY ("sales_id") REFERENCES "Sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
