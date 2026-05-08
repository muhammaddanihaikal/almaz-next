-- Indexes for distribution actions that repeatedly filter child rows by session.
-- IF NOT EXISTS keeps the migration safe if an index was added manually in production.

CREATE INDEX IF NOT EXISTS "SesiHarian_tanggal_createdAt_idx" ON "SesiHarian"("tanggal", "createdAt");
CREATE INDEX IF NOT EXISTS "SesiHarian_sales_id_idx" ON "SesiHarian"("sales_id");
CREATE INDEX IF NOT EXISTS "SesiHarian_status_idx" ON "SesiHarian"("status");

CREATE INDEX IF NOT EXISTS "SesiBarangKeluar_sesi_id_idx" ON "SesiBarangKeluar"("sesi_id");
CREATE INDEX IF NOT EXISTS "SesiBarangKeluar_rokok_id_idx" ON "SesiBarangKeluar"("rokok_id");

CREATE INDEX IF NOT EXISTS "SesiPenjualan_sesi_id_idx" ON "SesiPenjualan"("sesi_id");
CREATE INDEX IF NOT EXISTS "SesiPenjualan_rokok_id_idx" ON "SesiPenjualan"("rokok_id");

CREATE INDEX IF NOT EXISTS "SesiSetoran_sesi_id_idx" ON "SesiSetoran"("sesi_id");

CREATE INDEX IF NOT EXISTS "SesiBarangKembali_sesi_id_idx" ON "SesiBarangKembali"("sesi_id");
CREATE INDEX IF NOT EXISTS "SesiBarangKembali_rokok_id_idx" ON "SesiBarangKembali"("rokok_id");

CREATE INDEX IF NOT EXISTS "TitipJual_sesi_id_idx" ON "TitipJual"("sesi_id");
CREATE INDEX IF NOT EXISTS "TitipJual_sales_id_idx" ON "TitipJual"("sales_id");
CREATE INDEX IF NOT EXISTS "TitipJual_toko_id_idx" ON "TitipJual"("toko_id");
CREATE INDEX IF NOT EXISTS "TitipJual_status_idx" ON "TitipJual"("status");
CREATE INDEX IF NOT EXISTS "TitipJual_tanggal_jatuh_tempo_idx" ON "TitipJual"("tanggal_jatuh_tempo");
CREATE INDEX IF NOT EXISTS "TitipJual_tanggal_selesai_idx" ON "TitipJual"("tanggal_selesai");

CREATE INDEX IF NOT EXISTS "TitipJualItem_titip_jual_id_idx" ON "TitipJualItem"("titip_jual_id");
CREATE INDEX IF NOT EXISTS "TitipJualItem_rokok_id_idx" ON "TitipJualItem"("rokok_id");

CREATE INDEX IF NOT EXISTS "TitipJualSetoran_titip_jual_id_idx" ON "TitipJualSetoran"("titip_jual_id");
CREATE INDEX IF NOT EXISTS "TitipJualSetoran_sesi_penyelesaian_id_idx" ON "TitipJualSetoran"("sesi_penyelesaian_id");
CREATE INDEX IF NOT EXISTS "TitipJualSetoran_tanggal_idx" ON "TitipJualSetoran"("tanggal");

CREATE INDEX IF NOT EXISTS "TukarBarang_sesi_selesai_id_idx" ON "TukarBarang"("sesi_selesai_id");

CREATE INDEX IF NOT EXISTS "TukarBarangItemMasuk_tukar_id_idx" ON "TukarBarangItemMasuk"("tukar_id");
CREATE INDEX IF NOT EXISTS "TukarBarangItemMasuk_rokok_id_idx" ON "TukarBarangItemMasuk"("rokok_id");

CREATE INDEX IF NOT EXISTS "TukarBarangItemKeluar_tukar_id_idx" ON "TukarBarangItemKeluar"("tukar_id");
CREATE INDEX IF NOT EXISTS "TukarBarangItemKeluar_rokok_id_idx" ON "TukarBarangItemKeluar"("rokok_id");
