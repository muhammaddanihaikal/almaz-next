# Sistem Distribusi Sales

## Latar Belakang

Sistem lama menggunakan master Toko untuk mencatat penjualan. Sistem baru dirancang untuk alur sales keliling harian tanpa master toko — penjualan dicatat per sesi harian dengan kategori grosir/toko/perorangan sebagai label transaksi.

---

## Alur Harian

```
PAGI  → Admin buat Sesi + input barang yang dibawa sales → stok gudang berkurang

SORE  → Admin input laporan sales:
         ├── Penjualan langsung (grosir/toko/perorangan) + setoran
         ├── Konsinyasi baru (kalau ada)
         ├── Penyelesaian konsinyasi (kalau ada yang jatuh tempo)
         └── Barang kembali (manual input → stok gudang bertambah)
```

---

## Struktur Database

### `SesiHarian`
Satu record per sales per hari.
```
id, tanggal, sales_id, status (aktif|selesai), catatan
```

### `SesiBarangKeluar`
Barang yang dibawa sales pagi hari. Memotong stok gudang saat dibuat.
```
id, sesi_id, rokok_id, qty
```

### `SesiPenjualan`
Detail penjualan langsung yang dilaporkan sore hari. Harga di-snapshot dari master rokok sesuai kategori.
```
id, sesi_id, rokok_id, kategori (grosir|toko|perorangan), qty, harga
```

### `SesiSetoran`
Uang masuk dari penjualan langsung. Bisa lebih dari satu record per sesi (cash + transfer).
```
id, sesi_id, metode (cash|transfer), jumlah
```

### `SesiBarangKembali`
Sisa barang yang dibawa pulang sales. Menambah stok gudang. Input manual oleh admin.
```
id, sesi_id, rokok_id, qty
```

### `Konsinyasi`
Transaksi titip jual ke toko. Nama toko berupa text bebas tanpa master toko.
Stok gudang berkurang saat konsinyasi dibuat (barang sudah dibawa pagi).
```
id, sesi_id, sales_id, nama_toko, kategori (grosir|toko),
tanggal_jatuh_tempo, status (aktif|selesai), catatan
```

### `KonsinyasiItem`
Detail produk per konsinyasi. Harga di-snapshot saat konsinyasi dibuat.
```
id, konsinyasi_id, rokok_id, qty_keluar, qty_terjual, qty_kembali, harga
```

### `KonsinyasiSetoran`
Pembayaran dari penyelesaian konsinyasi. Fleksibel cash/transfer.
```
id, konsinyasi_id, metode (cash|transfer), jumlah, tanggal, sesi_penyelesaian_id
```

---

## Validasi & Flag

| Flag | Kondisi |
|---|---|
| Qty tidak cocok | keluar ≠ terjual langsung + qty konsinyasi baru + qty kembali ke gudang |
| Setoran tidak cocok | total setoran ≠ nilai penjualan langsung (qty × harga per kategori) |
| Setoran konsinyasi tidak cocok | pembayaran ≠ qty_terjual × harga |
| Jatuh tempo terlewat | konsinyasi status aktif dan tanggal_jatuh_tempo < hari ini |
| Jatuh tempo mendekati | konsinyasi status aktif dan tanggal_jatuh_tempo ≤ 3 hari ke depan |

---

## Aturan Bisnis

- **Harga**: diambil dari master rokok sesuai kategori (harga_grosir / harga_toko / harga_perorangan)
- **Konsinyasi**: bisa ke grosir atau toko, harga mengikuti kategori
- **Setoran**: fleksibel cash + transfer, bisa kombinasi keduanya
- **Perorangan**: jarang, ditampilkan opsional/collapsed di UI
- **Barang kembali**: input manual, sistem flag jika tidak cocok dengan perhitungan
- **Sesi**: satu sales satu sesi per hari, bisa diedit bebas kapan saja
- **Konsinyasi diselesaikan**: selalu oleh sales yang sama yang membuat
- **Nama toko konsinyasi**: text bebas, tidak perlu master toko

---

## Modul

### 1. Distribusi
- List sesi harian (filter: tanggal, sales)
- Buat sesi pagi (pilih sales + tanggal + input barang keluar)
- Input laporan sore (penjualan langsung + setoran + konsinyasi baru + penyelesaian konsinyasi + barang kembali)
- Detail sesi dengan summary dan flag

### 2. Konsinyasi
- List semua konsinyasi (filter: status, sales, tanggal)
- Detail konsinyasi
- Penyelesaian konsinyasi (input qty terjual, qty kembali, setoran)

### 3. Dashboard
- Reminder konsinyasi yang jatuh tempo hari ini atau dalam 3 hari ke depan

---

## Yang Dihapus dari Sistem Lama

| Lama | Keterangan |
|---|---|
| Model `Toko` | Tidak dipakai lagi |
| Model `Penjualan`, `PenjualanKeluar`, `PenjualanMasuk`, `PenjualanSample` | Diganti dengan model sesi baru |
| Model `Retur`, `ReturItem` | Ter-cover oleh `SesiBarangKembali` dan `KonsinyasiItem.qty_kembali` |
| Modul Penjualan lama | Diganti modul Distribusi + Konsinyasi |
| Master Toko di sidebar | Dihapus dari navigasi |
