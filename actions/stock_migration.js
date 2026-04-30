"use server"

import { prisma } from "@/lib/db"

export async function migrateToStockMutations() {
  console.log("Starting stock migration...");
  
  await prisma.$transaction(async (tx) => {
    // 1. Safety Check: If there are already mutations, do not run migration to avoid duplication
    const existingMutations = await tx.stockMutation.count();
    if (existingMutations > 0) {
      throw new Error("Migrasi dibatalkan: Tabel StockMutation sudah berisi data. Hapus data secara manual jika ingin mengulang migrasi.");
    }
    
    // 2. Migrate StokMasuk
    const stokMasuk = await tx.stokMasuk.findMany();
    for (const sm of stokMasuk) {
      await tx.stockMutation.create({
        data: {
          rokok_id: sm.rokok_id,
          tanggal: sm.tanggal,
          jenis: 'in',
          qty: sm.qty,
          source: 'supplier',
          reference_id: sm.id,
          createdAt: sm.createdAt,
          updatedAt: sm.updatedAt
        }
      });
    }

    // 3. Migrate SesiBarangKeluar
    const sesiKeluar = await tx.sesiBarangKeluar.findMany({ include: { sesi: true } });
    for (const sk of sesiKeluar) {
      await tx.stockMutation.create({
        data: {
          rokok_id: sk.rokok_id,
          tanggal: sk.sesi.tanggal,
          jenis: 'out',
          qty: sk.qty,
          source: 'distribusi_sales',
          reference_id: sk.sesi.id
        }
      });
    }

    // 4. Migrate SesiBarangKembali
    const sesiKembali = await tx.sesiBarangKembali.findMany({ include: { sesi: true } });
    for (const sk of sesiKembali) {
      await tx.stockMutation.create({
        data: {
          rokok_id: sk.rokok_id,
          tanggal: sk.sesi.tanggal,
          jenis: 'in',
          qty: sk.qty,
          source: 'retur_sales',
          reference_id: sk.sesi.id
        }
      });
    }

    // 5. Migrate ReturItem
    const returItems = await tx.returItem.findMany({ include: { retur: true } });
    for (const ri of returItems) {
      await tx.stockMutation.create({
        data: {
          rokok_id: ri.rokok_id,
          tanggal: ri.retur.tanggal,
          jenis: 'in',
          qty: ri.qty,
          source: 'retur',
          reference_id: ri.retur.id
        }
      });
    }

    // 6. Migrate Konsinyasi / Titip Jual (Keluar & Kembali)
    // We should migrate based on titipJualItem.
    const titipJual = await tx.titipJual.findMany({ include: { items: true } });
    for (const tj of titipJual) {
      for (const item of tj.items) {
        if (item.qty_keluar > 0) {
          await tx.stockMutation.create({
            data: {
              rokok_id: item.rokok_id,
              tanggal: tj.createdAt, // Since items don't have separate date, use TJ creation date
              jenis: 'out',
              qty: item.qty_keluar,
              source: 'distribusi_sales', // Assuming titip jual issues act like distribution out
              reference_id: tj.id
            }
          });
        }
        if (item.qty_kembali > 0) {
          // If already returned, use completion date or fallback to today
          await tx.stockMutation.create({
            data: {
              rokok_id: item.rokok_id,
              tanggal: tj.tanggal_selesai || new Date(), 
              jenis: 'in',
              qty: item.qty_kembali,
              source: 'konsinyasi_kembali',
              reference_id: tj.id
            }
          });
        }
      }
    }

    // 7. Migrate Penjualan (Direct out & sample out/in)
    const penjualan = await tx.penjualan.findMany({ include: { masukItems: true, sampleItems: true } });
    for (const p of penjualan) {
      for (const item of p.masukItems) {
        await tx.stockMutation.create({
          data: {
            rokok_id: item.rokok_id,
            tanggal: p.tanggal,
            jenis: 'out',
            qty: item.qty,
            source: 'penjualan',
            reference_id: p.id
          }
        });
      }
      for (const item of p.sampleItems) {
        if (item.qty_masuk > 0) {
          await tx.stockMutation.create({
            data: {
              rokok_id: item.rokok_id,
              tanggal: p.tanggal,
              jenis: 'out',
              qty: item.qty_masuk,
              source: 'penjualan_sample',
              reference_id: p.id
            }
          });
        }
      }
    }
  });

  console.log("Migration complete!");
  return { success: true };
}
