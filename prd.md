Baik, pembaruan ini sangat penting untuk menyederhanakan alur kerja pengguna (UX) saat merencanakan jadwal. Input langsung menggunakan "lot kecil" akan membuat pemetaan pada grid menit menjadi lebih presisi tanpa sistem harus melakukan konversi perhitungan lot di belakang layar.

Berikut adalah _Product Requirements Document_ (PRD) yang telah direvisi dengan logika input lot kecil:

---

# PRODUCT REQUIREMENTS DOCUMENT (PRD)

## 1. Identifikasi Dokumen

- **Nama Proyek:** Aplikasi Shikake Digital (Integration Production Board & Tapping Sequence)
- **Target Pengguna:** Operator Produksi, PIC Shift, Production Supervisor
- **Platform:** Web-based Application (dioptimalkan untuk tampilan Layar Monitor Produksi / Tablet di area kerja)

## 2. Ringkasan & Tujuan Sistem

Aplikasi Shikake ini berfungsi sebagai papan kontrol produksi digital untuk memantau perbandingan _Plan_ (PLN) dan _Actual_ (ACT) proses produksi di lini _moulding_ secara _real-time_. Sistem ini menghilangkan proses pencatatan manual dengan mengotomatisasi pengisian data aktual berdasarkan rencana waktu, serta menyediakan fitur interupsi _line stop_ pintar yang secara otomatis menggeser jadwal dan nomor lot produksi ke depan tanpa merusak urutan kerja.

## 3. Fitur Utama & Spesifikasi Fungsional

### 3.1. Antarmuka Papan Shikake (Grid Matrix View)

- **Skala Waktu Grid:** Sumbu horizontal menampilkan waktu yang dibagi menjadi blok jam dan kolom menit. **1 Grid mewakili tepat 1 menit** waktu produksi.
- **Struktur Baris:** Setiap jam memiliki dua baris utama:
- **Baris PLN (Plan):** Menampilkan rencana alokasi lot produksi dan aktivitas terencana.
- **Baris ACT (Actual):** Menampilkan realisasi produksi di lapangan.

- **Blok Aktivitas Non-Produksi:** Sistem menyediakan visualisasi bawaan untuk waktu istirahat dan persiapan terencana:
- _Istirahat-1, Istirahat Maghrib, Istirahat Umum_
- _Dandori_ (Setup/Changeover)
- _Wakom-1, Wakom-2_

### 3.2. Manajemen Produk & Mekanisme Input Lot

- **Katalog Produk:** Sistem mendukung 4 jenis produk utama: `2TR`, `1TR`, `KAI`, dan `CRANK`.
- **Sistem Penomoran Lot:** Setiap produk memiliki penomoran lot yang berdiri sendiri dan **selalu dimulai dari Lot 1** untuk setiap siklus produk tersebut (misal: 2TR Lot 1, 1TR Lot 1).
- **Metode Input Perencanaan (PLN):**
- Input perencanaan produksi ke dalam grid Shikake dilakukan secara langsung berdasarkan **satuan Lot Kecil**.
- Aturan _1 Lot Besar = 3 Lot Kecil_ tetap menjadi referensi rasio operasional pabrik, namun secara teknis di dalam aplikasi, perencana jadwal (PIC) hanya berinteraksi dan mengalokasikan data dalam bentuk Lot Kecil ke dalam grid menit.

### 3.3. Logika Otomatisasi Data Aktual (ACT)

- **Kondisi Sinkronisasi Otomatis:** Di bawah operasional normal (tanpa adanya input _Line Stop_), **data aktual (ACT) akan berjalan dan terisi otomatis mengikuti data rencana (PLN)**.
- **Presisi Waktu:** Pengisian otomatis ini akurat hingga tingkat menit, sehingga operator tidak perlu melakukan klik/konfirmasi manual untuk setiap grid lot yang berhasil diselesaikan jika produksi sesuai jadwal.

### 3.4. Mekanisme Modul Line Stop & Pergeseran Lot (Auto-Shifting)

Fitur ini mengatasi deviasi antara rencana dan kenyataan jika terjadi masalah yang menghentikan jalur produksi.

- **Form Input Line Stop:** Sistem memiliki fitur pengisian cepat dengan tiga parameter wajib:

1. **Waktu Mulai:** Jam dan menit awal terjadinya _line stop_.
2. **Waktu Selesai (Tujuan):** Jam dan menit estimasi mesin kembali beroperasi normal.
3. **Keterangan:** Kategori/alasan kendala (contoh: _F.Releasing LS Fault_).

- **Logika Pergeseran Jadwal (Shifting Algorithm):**
- Sistem mengunci rentang waktu antara "Waktu Mulai" dan "Waktu Selesai" pada baris PLN, mengubahnya menjadi blok khusus (berwarna merah) yang menampilkan keterangan kendala.
- **Seluruh Lot Kecil** yang jadwalnya terpotong oleh atau berada setelah _line stop_ akan **tergeser maju secara otomatis**.
- Lot pertama yang tertunda akan langsung ditempatkan pada menit pertama setelah _line stop_ selesai, diikuti oleh lot-lot berikutnya secara berurutan (_kumulatif_).

- **Penyesuaian Aktual:** Karena baris ACT diprogram untuk selalu mengikuti baris PLN, maka ketika Lot Kecil di PLN bergeser mundur (menuju jam yang lebih lambat), baris ACT akan menyesuaikan secara _real-time_.

### 3.5. Integrasi Urutan Tapping Furnace

- Aplikasi memiliki sinkronisasi data dengan pemetaan Urutan _Tapping Furnace_ (seperti pada papan _Cold Start/Hot Start_ di gambar "photo_2026-07-04_21-00-03.jpg").
- Urutan angka _tapping_ terhubung secara relasional dengan Lot Kecil yang sedang dikerjakan di papan Shikake (gambar "photo_2026-07-04_21-00-07.jpg"). Jika urutan Lot Kecil bergeser karena _Line Stop_, referensi penyelesaian urutan _tapping_ juga akan tervalidasi mundur menyesuaikan realita grid waktu.

## 4. Kebutuhan Non-Fungsional (Non-Functional Requirements)

- **Keandalan (Reliability):** Proses _auto-shifting_ jadwal lot kecil harus tereksekusi tanpa hambatan komputasi saat form _line stop_ disimpan.
- **Kemudahan Penggunaan (Usability):** Input menit dan jam untuk _line stop_ menggunakan elemen _dropdown_ atau _time-picker_ untuk mencegah _error_ input dari pengguna.
- **Visibilitas:** Palet warna aplikasi harus mengadaptasi warna papan aslinya (latar hitam, teks/grid warna terang, blok merah untuk _line stop_, biru untuk istirahat) demi visibilitas maksimal di _shop floor_.

Berikut adalah tambahan untuk dokumen PRD Anda, khusus membahas rekomendasi Tech Stack (teknologi yang digunakan) dengan mengakomodasi penggunaan localStorage sebagai basis data awal.

Penggunaan localStorage adalah langkah yang sangat tepat untuk fase Minimum Viable Product (MVP) atau Proof of Concept (PoC) karena memungkinkan pengembangan yang cepat tanpa perlu langsung mengatur server backend.

5. Rekomendasi Tech Stack & Arsitektur
   Mengingat aplikasi ini membutuhkan manipulasi data yang sangat interaktif (ratusan grid waktu) dan pembaruan antarmuka secara real-time saat terjadi pergeseran Line Stop, kerangka kerja frontend yang reaktif sangat direkomendasikan.

5.1. Frontend & User Interface (UI)
Framework/Library Utama: React.js (menggunakan Vite sebagai build tool agar ringan dan cepat).

Alasan: React sangat unggul dalam menangani perubahan state (status data) yang kompleks. Saat jadwal bergeser akibat Line Stop, React hanya akan merender ulang grid waktu yang terdampak, sehingga performa aplikasi tetap lancar di perangkat spesifikasi rendah.

Styling & Layouting: Tailwind CSS.

Alasan: Aplikasi Shikake sangat bergantung pada desain matriks/grid presisi (1 grid = 1 menit) dengan palet warna kontras tinggi (tema pabrik/gelap). Tailwind memungkinkan developer membangun struktur CSS Grid dan mewarnai blok Line Stop atau Istirahat dengan sangat cepat.

Manipulasi Waktu: Day.js atau Date-fns.

Alasan: Karena logika utama aplikasi ini adalah pergeseran jam dan menit (kalkulasi durasi dan penambahan waktu), library ini akan mencegah bug perhitungan waktu dibandingkan menggunakan Native Date API bawaan JavaScript.

5.2. State Management & Database (Penyimpanan Lokal)
State Manager: Zustand (untuk React).

Alasan: Zustand adalah alat pengelola state yang sangat ringan. Keuntungan utamanya adalah memiliki fitur Persist Middleware bawaan. Artinya, data state aplikasi bisa otomatis tersimpan dan tersinkronisasi dengan localStorage tanpa perlu menulis banyak kode tambahan.

Database Utama (Tahap MVP): Browser localStorage.

Data akan disimpan dalam format JSON String.

Struktur Data (Schema) yang disarankan:

shift_config: Menyimpan informasi jam mulai dan selesai shift, serta blok istirahat tetap.

plan_lots: Array objek yang berisi daftar Lot Kecil, ID Produk (2TR, 1TR, dll), menit mulai, dan menit selesai.

actual_lots: Array objek realisasi (akan menyalin dari plan_lots secara otomatis berdasar waktu sistem).

line_stops: Array log line stop (Waktu mulai, waktu selesai, durasi, keterangan).

5.3. Catatan Penting Penggunaan localStorage
Karena data disimpan murni di dalam browser perangkat keras yang digunakan (komputer/tablet di lapangan), mohon perhatikan hal-hal berikut untuk tahap MVP ini:

Tidak Ada Sinkronisasi Silang (No Cross-Sync): Data yang diinput di layar mesin moulding A tidak akan bisa dilihat dari komputer di ruangan Supervisor B. Semuanya tersimpan lokal di perangkat masing-masing.

Keamanan Data: Jika cache atau history browser dibersihkan (clear data), maka seluruh data jadwal produksi hari itu akan hilang.

Rekomendasi Transisi Masa Depan: Saat aplikasi ini sudah terbukti stabil di lapangan dan ingin dihubungkan antar divisi, Anda hanya perlu mengganti lapisan localStorage ini dengan API Backend ringan (misalnya Node.js/Express dengan database PostgreSQL atau MySQL).
