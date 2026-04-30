-- CreateTable
CREATE TABLE "StokMasuk" (
    "id" TEXT NOT NULL,
    "rokok_id" TEXT NOT NULL,
    "tanggal" DATE NOT NULL,
    "qty" INTEGER NOT NULL,
    "keterangan" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StokMasuk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMutation" (
    "id" TEXT NOT NULL,
    "rokok_id" TEXT NOT NULL,
    "tanggal" DATE NOT NULL,
    "jenis" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "reference_id" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMutation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClosingHarian" (
    "id" TEXT NOT NULL,
    "tanggal" DATE NOT NULL,
    "rokok_id" TEXT NOT NULL,
    "stok_akhir" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClosingHarian_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockMutation_rokok_id_tanggal_idx" ON "StockMutation"("rokok_id", "tanggal");

-- CreateIndex
CREATE UNIQUE INDEX "ClosingHarian_tanggal_rokok_id_key" ON "ClosingHarian"("tanggal", "rokok_id");

-- AddForeignKey
ALTER TABLE "StokMasuk" ADD CONSTRAINT "StokMasuk_rokok_id_fkey" FOREIGN KEY ("rokok_id") REFERENCES "Rokok"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMutation" ADD CONSTRAINT "StockMutation_rokok_id_fkey" FOREIGN KEY ("rokok_id") REFERENCES "Rokok"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClosingHarian" ADD CONSTRAINT "ClosingHarian_rokok_id_fkey" FOREIGN KEY ("rokok_id") REFERENCES "Rokok"("id") ON DELETE CASCADE ON UPDATE CASCADE;
