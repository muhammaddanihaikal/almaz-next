-- Remove Tukar Barang tables
DROP TABLE IF EXISTS "TukarBarangItemMasuk";
DROP TABLE IF EXISTS "TukarBarangItemKeluar";
DROP TABLE IF EXISTS "TukarBarang";

-- Rename Toko → Retail (safe for both fresh and existing DBs)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='Toko') THEN
    ALTER TABLE "Toko" RENAME TO "Retail";
  END IF;
END $$;

-- Rename harga_toko → harga_retail in Rokok (safe for both fresh and existing DBs)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Rokok' AND column_name='harga_toko') THEN
    ALTER TABLE "Rokok" RENAME COLUMN "harga_toko" TO "harga_retail";
  ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Rokok' AND column_name='harga_retail') THEN
    ALTER TABLE "Rokok" ADD COLUMN "harga_retail" INTEGER NOT NULL DEFAULT 0;
  END IF;
END $$;

-- Rename toko_id → retail_id in TitipJual (safe for both fresh and existing DBs)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='TitipJual' AND column_name='toko_id') THEN
    ALTER TABLE "TitipJual" RENAME COLUMN "toko_id" TO "retail_id";
  END IF;
END $$;

-- Update default value for Retail.kategori
ALTER TABLE "Retail" ALTER COLUMN "kategori" SET DEFAULT 'retail';

-- Update existing data
UPDATE "Retail" SET "kategori" = 'retail' WHERE "kategori" = 'toko';
UPDATE "SesiPenjualan" SET "kategori" = 'retail' WHERE "kategori" = 'toko';
UPDATE "TitipJual" SET "kategori" = 'retail' WHERE "kategori" = 'toko';
