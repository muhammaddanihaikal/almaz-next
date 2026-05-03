-- Remove Tukar Barang tables
DROP TABLE IF EXISTS "TukarBarangItemMasuk";
DROP TABLE IF EXISTS "TukarBarangItemKeluar";
DROP TABLE IF EXISTS "TukarBarang";

-- Rename Toko → Retail
ALTER TABLE "Toko" RENAME TO "Retail";

-- Rename harga_toko → harga_retail in Rokok
ALTER TABLE "Rokok" RENAME COLUMN "harga_toko" TO "harga_retail";

-- Rename toko_id → retail_id in TitipJual
ALTER TABLE "TitipJual" RENAME COLUMN "toko_id" TO "retail_id";

-- Update default value for Retail.kategori
ALTER TABLE "Retail" ALTER COLUMN "kategori" SET DEFAULT 'retail';

-- Update existing data
UPDATE "Retail" SET "kategori" = 'retail' WHERE "kategori" = 'toko';
UPDATE "SesiPenjualan" SET "kategori" = 'retail' WHERE "kategori" = 'toko';
UPDATE "TitipJual" SET "kategori" = 'retail' WHERE "kategori" = 'toko';
