const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const include = {
  sales: true,
  barangKeluar:  { include: { rokok: true } },
  penjualan:     { include: { rokok: true } },
  setoran:       true,
  barangKembali: { include: { rokok: true } },
  titipJual:     { include: { items: { include: { rokok: true } }, setoran: true, toko: true } },
}

function serialize(s) {
  const tanggal = s.tanggal.toISOString().split("T")[0]
  const nilaiPenjualan = s.penjualan.reduce((sum, it) => sum + it.qty * it.harga, 0)
  const totalSetoran   = s.setoran.reduce((sum, it) => sum + it.jumlah, 0)
  const qtyKeluar      = s.barangKeluar.reduce((sum, it) => sum + it.qty, 0)
  const qtyTerjual     = s.penjualan.reduce((sum, it) => sum + it.qty, 0)
  const qtyKonsinyasi  = s.titipJual.reduce((sum, k) => sum + k.items.reduce((ss, it) => ss + it.qty_keluar, 0), 0)
  const qtyKembali     = s.barangKembali.reduce((sum, it) => sum + it.qty, 0)
  const flagSetoran    = nilaiPenjualan > 0 && totalSetoran !== nilaiPenjualan
  const flagQty        = qtyKeluar > 0 && s.status === "selesai" && (qtyTerjual + qtyKonsinyasi + qtyKembali) !== qtyKeluar

  return {
    id:        s.id,
    tanggal,
    sales_id:  s.sales_id,
    sales:     s.sales.nama,
    status:    s.status,
    catatan:   s.catatan,
    createdAt: s.createdAt.toISOString(),
    flagSetoran,
    flagQty,
    nilaiPenjualan,
    totalSetoran,
    barangKeluar: s.barangKeluar
      .sort((a, b) => (a.rokok?.urutan ?? 0) - (b.rokok?.urutan ?? 0))
      .map((it) => ({
        id: it.id, rokok_id: it.rokok_id, rokok: it.rokok?.nama || "???", qty: it.qty,
      })),
    penjualan: s.penjualan
      .sort((a, b) => (a.rokok?.urutan ?? 0) - (b.rokok?.urutan ?? 0))
      .map((it) => ({
        id: it.id, rokok_id: it.rokok_id, rokok: it.rokok?.nama || "???",
        kategori: it.kategori, qty: it.qty, harga: it.harga,
      })),
    setoran: s.setoran.map((it) => ({
      id: it.id, metode: it.metode, jumlah: it.jumlah,
    })),
    barangKembali: s.barangKembali
      .sort((a, b) => (a.rokok?.urutan ?? 0) - (b.rokok?.urutan ?? 0))
      .map((it) => ({
        id: it.id, rokok_id: it.rokok_id, rokok: it.rokok?.nama || "???", qty: it.qty,
      })),
    konsinyasi: s.titipJual.map((k) => ({
      id:                  k.id,
      toko_id:             k.toko_id,
      nama_toko:           k.toko.nama,
      kategori:            k.kategori,
      tanggal_jatuh_tempo: k.tanggal_jatuh_tempo.toISOString().split("T")[0],
      tanggal_selesai:     k.tanggal_selesai ? k.tanggal_selesai.toISOString().split("T")[0] : null,
      status:              k.status,
      items: k.items
        .sort((a, b) => (a.rokok?.urutan ?? 0) - (b.rokok?.urutan ?? 0))
        .map((it) => ({
          id: it.id, rokok_id: it.rokok_id, rokok: it.rokok?.nama || "???",
          qty_keluar: it.qty_keluar, qty_terjual: it.qty_terjual,
          qty_kembali: it.qty_kembali, harga: it.harga,
        })),
      setoran: k.setoran.map((it) => ({
        id: it.id, metode: it.metode, jumlah: it.jumlah,
        tanggal: it.tanggal.toISOString().split("T")[0],
      })),
    })),
  }
}

async function main() {
  const start = Date.now();
  const rows = await prisma.sesiHarian.findMany({
    include,
    orderBy: [{ tanggal: "desc" }, { createdAt: "desc" }],
  });
  const fetchEnd = Date.now();
  console.log(`Prisma findMany took: ${fetchEnd - start}ms`);
  
  rows.map(serialize);
  const serializeEnd = Date.now();
  console.log(`Serialization took: ${serializeEnd - fetchEnd}ms`);
  console.log(`Total took: ${serializeEnd - start}ms`);
  
  process.exit(0);
}

main();
