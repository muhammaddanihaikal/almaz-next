-- Add optional session relation for Retur records created from distribution reports.
-- This is non-destructive: existing Retur rows keep sesi_id = NULL.

ALTER TABLE "Retur" ADD COLUMN IF NOT EXISTS "sesi_id" TEXT;

CREATE INDEX IF NOT EXISTS "Retur_sesi_id_idx" ON "Retur"("sesi_id");

DO $$
BEGIN
  ALTER TABLE "Retur"
    ADD CONSTRAINT "Retur_sesi_id_fkey"
    FOREIGN KEY ("sesi_id") REFERENCES "SesiHarian"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
