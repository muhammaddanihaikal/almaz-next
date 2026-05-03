# 📦 Flow Bisnis Distribusi Harian

Dokumen ini menjelaskan alur operasional distribusi harian, mulai dari barang keluar (pagi) hingga laporan sales (sore).

Sistem berfokus pada:

- Pergerakan barang (stok)
- Uang hasil penjualan
- Pencatatan sederhana sesuai kondisi lapangan

Admin tidak mengetahui detail aktivitas di lapangan, dan hanya mencatat hasil laporan dari sales.

---

## 🧭 Prinsip Utama

- Sistem berbasis **stok dan uang**
- Admin hanya mencatat:
  - Barang keluar (pagi)
  - Barang kembali (sore)
  - Setoran uang
- Detail aktivitas di lapangan tidak dicatat
- Kategori Grosir & Retail digunakan sebagai referensi harga (opsional)

---

## 🌅 1. Pagi — Distribusi Barang (Gudang → Sales)

Admin membuat sesi distribusi:

### Input:

- Tanggal
- Sales
- Daftar barang yang dibawa (qty per produk)

### Proses:

- Barang keluar dari gudang
- Dicatat sebagai stok keluar

### Hasil:

- Stok gudang berkurang
- Sales membawa barang untuk aktivitas hari itu

---

## 🚶 2. Aktivitas Sales (Di Lapangan)

Sales melakukan aktivitas:

- Penjualan (grosir / retail)
- Titip jual (jika ada)
- Tukar barang

📌 Catatan:

- Aktivitas ini tidak dicatat secara detail oleh admin
- Sistem tidak menyimpan transaksi per pelanggan

---

## 🌇 3. Sore — Sales Kembali (Laporan ke Admin)

Sales kembali dan melaporkan:

---

### 📦 Barang

#### Barang Kembali

- Semua barang yang dibawa kembali oleh sales
- Merupakan gabungan dari:
  - Barang sisa yang tidak terjual
  - Barang hasil tukar di lapangan

👉 Dicatat sebagai:

- Barang masuk ke gudang

---

### 💰 Uang

- Uang hasil penjualan hari itu
- Bisa berupa:
  - Cash
  - Transfer

---

## 🧮 4. Input Laporan oleh Admin

Admin mencatat berdasarkan laporan sales:

---

### 📊 Penjualan

Admin mengisi:

- Qty Grosir
- Qty Retail

Untuk setiap produk

📌 Digunakan untuk estimasi penjualan

---

### 📦 Barang Kembali

Admin mengisi:

- Jumlah barang yang dibawa kembali oleh sales

---

### 💰 Setoran

Admin mengisi:

- Jumlah uang yang disetorkan oleh sales

---

## 🔍 5. Perhitungan & Indikasi

Sistem melakukan:

### Estimasi Penjualan:

Berdasarkan:

- Qty
- Harga (Grosir & Retail)

---

### Perbandingan:

- Estimasi Penjualan
- Setoran Aktual

---

### Contoh:

Estimasi: Rp 200.000  
Setoran: Rp 190.000

Selisih: -Rp 10.000

---

## ⚠️ Interpretasi Selisih

Selisih dapat terjadi karena:

- Perbedaan harga di lapangan
- Diskon / negosiasi
- Kesalahan pencatatan
- Faktor operasional lainnya

📌 Sistem tidak menentukan benar atau salah, hanya memberikan indikasi

---

## 📌 6. Titip Jual (Terpisah)

Jika ada transaksi titip jual:

- Dicatat di menu khusus
- Memiliki:
  - Data toko
  - Jatuh tempo
  - Status (Aktif / Selesai)

Digunakan untuk tracking pembayaran yang belum diterima

---

## 🔁 Ringkasan Alur

### Pagi:

- Admin input barang keluar (ke sales)

---

### Siang:

- Sales melakukan aktivitas di lapangan

---

### Sore:

Sales melaporkan:

- Barang kembali
- Uang setoran

---

### Admin:

- Input penjualan (qty grosir & retail)
- Input barang kembali
- Input setoran
- Melihat selisih (estimasi vs realisasi)

---

## 🎯 Tujuan Sistem

- Mencatat pergerakan barang dan uang
- Memberikan gambaran performa sales
- Menjaga sistem tetap sederhana dan mudah digunakan
- Tidak membebani admin dengan detail yang tidak diperlukan

---

## 🏁 Kesimpulan

Sistem ini bersifat:

- Sederhana
- Operasional
- Sesuai kondisi nyata di lapangan

Fokus utama:
→ **Mencatat apa yang terjadi, bukan memaksakan apa yang seharusnya terjadi**
