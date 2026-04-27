-- Rename tables: Konsinyasi → TitipJual (preserve all data)
ALTER TABLE "Konsinyasi" RENAME TO "TitipJual";
ALTER TABLE "KonsinyasiItem" RENAME TO "TitipJualItem";
ALTER TABLE "KonsinyasiSetoran" RENAME TO "TitipJualSetoran";

-- Rename foreign key columns
ALTER TABLE "TitipJualItem" RENAME COLUMN "konsinyasi_id" TO "titip_jual_id";
ALTER TABLE "TitipJualSetoran" RENAME COLUMN "konsinyasi_id" TO "titip_jual_id";

-- Rename foreign key constraints
ALTER TABLE "TitipJual" RENAME CONSTRAINT "Konsinyasi_sesi_id_fkey" TO "TitipJual_sesi_id_fkey";
ALTER TABLE "TitipJual" RENAME CONSTRAINT "Konsinyasi_sales_id_fkey" TO "TitipJual_sales_id_fkey";
ALTER TABLE "TitipJual" RENAME CONSTRAINT "Konsinyasi_toko_id_fkey" TO "TitipJual_toko_id_fkey";
ALTER TABLE "TitipJualItem" RENAME CONSTRAINT "KonsinyasiItem_konsinyasi_id_fkey" TO "TitipJualItem_titip_jual_id_fkey";
ALTER TABLE "TitipJualItem" RENAME CONSTRAINT "KonsinyasiItem_rokok_id_fkey" TO "TitipJualItem_rokok_id_fkey";
ALTER TABLE "TitipJualSetoran" RENAME CONSTRAINT "KonsinyasiSetoran_konsinyasi_id_fkey" TO "TitipJualSetoran_titip_jual_id_fkey";

-- Rename primary key constraints
ALTER TABLE "TitipJual" RENAME CONSTRAINT "Konsinyasi_pkey" TO "TitipJual_pkey";
ALTER TABLE "TitipJualItem" RENAME CONSTRAINT "KonsinyasiItem_pkey" TO "TitipJualItem_pkey";
ALTER TABLE "TitipJualSetoran" RENAME CONSTRAINT "KonsinyasiSetoran_pkey" TO "TitipJualSetoran_pkey";
