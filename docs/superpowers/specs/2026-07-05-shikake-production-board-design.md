# Design Spec — Aplikasi Shikake Digital (MVP: Production Board + Line Stop)

**Date:** 2026-07-05
**Status:** Approved (design), pending implementation plan
**Source PRD:** `prd.md`
**Reference:** Foto papan "PRODUCTION CONTROL BOARD MOULDING LINE" (PT TMMIN, Casting Division-Sunter II)

---

## 1. Ringkasan & Cakupan

Papan kontrol produksi digital yang menampilkan perbandingan **Plan (PLN)** vs **Actual (ACT)**
untuk lini *moulding* secara real-time. Data disimpan lokal di browser (localStorage), tanpa backend.

**Cakupan MVP ini:**
- Grid matriks waktu (PLN/ACT) 07:00–19:00.
- Katalog 4 produk: `2TR`, `1TR`, `KAI`, `CRANK`.
- Input perencanaan lot kecil (auto-place sekuensial).
- Blok non-produksi bawaan (Dandori, Wakom-1/2, Istirahat-1, Istirahat, Istirahat Maghrib) — dapat diedit.
- Auto-fill ACT mengikuti PLN berdasarkan jam sistem.
- Modul **Line Stop** + **auto-shifting** lot kecil.
- Panel log line stop + tabel ringkasan MODEL (PLAN/ACTUAL).

**Ditunda (bukan MVP ini):**
- Integrasi Urutan Tapping Furnace (PRD §3.5).
- Sinkronisasi antar-perangkat (localStorage saja, single device — PRD §5.3).

---

## 2. Keputusan Desain Kunci (hasil brainstorming)

| Topik | Keputusan |
|---|---|
| Skala grid | **Presisi internal 1 menit**, ditampilkan dikelompokkan **per 5 menit** (kolom 05–55). Akurat untuk shifting, tetap mirip papan asli. |
| Durasi lot kecil | **Tetap 5 menit** per lot kecil (≈12 lot/jam). `endMin = startMin + 5`. |
| Metode input plan | **Auto-place**: PIC memasukkan `produk + jumlah lot`; engine menempatkan berurutan dari awal shift, melompati blok non-produksi. |
| Blok istirahat | Punya **default** waktu (dapat diedit), tidak memaksa setup di run pertama. |
| Penomoran lot | **Restart dari 1 per produk** (2TR Lot 1, 1TR Lot 1, dst — PRD §3.2). |

---

## 3. Arsitektur & Tech Stack

Sesuai PRD §5: **React + Vite**, **Tailwind CSS**, **Zustand** (persist middleware → localStorage),
**Day.js** untuk kalkulasi waktu. SPA murni frontend.

### Batas modul (tiap unit terisolasi & dapat diuji sendiri)

- **`src/lib/time.ts`** — helper murni tanpa state:
  - `toMinOfDay(hhmm)`, `toHHmm(min)`
  - `minToDisplayCol(min)` → pemetaan menit ke sel tampilan 5-menit
  - util rentang shift & jam.
  - *Dependency:* Day.js. *Kontrak:* fungsi murni, input→output deterministik.

- **`src/lib/scheduling.ts`** — engine penjadwalan murni (tanpa React):
  - `autoPlaceLots(sequence, shiftConfig)` → `planLots[]`
  - `deriveActual(planLots, nowMin)` → `actualLots[]`
  - `applyLineStop(planLots, lineStop, shiftConfig)` → `planLots[]` tergeser
  - *Dependency:* `time.ts`. *Kontrak:* murni; state produksi masuk sebagai argumen, hasil dikembalikan. Ini titik utama unit test.

- **`src/store/boardStore.ts`** — Zustand store (satu-satunya sumber kebenaran):
  - state: `shiftConfig`, `products`, `planLots`, `lineStops`
  - derived: `actualLots` (dihitung dari `planLots` + jam sekarang)
  - actions: `addLots`, `addLineStop`, `removeLineStop`, `updateBreak`, `resetBoard`
  - persist ke localStorage (key: `shikake-board-v1`), JSON string.
  - *Kontrak:* komponen hanya membaca store & memanggil action; semua logika berat didelegasikan ke `scheduling.ts`.

- **`src/components/`** — presentational (baca store, tanpa logika penjadwalan):
  `BoardHeader`, `TimeGrid` (+ `HourRow`, `LotCell`), `BreakOverlay`, `LineStopBlock`,
  `LineStopPanel` (log + form), `ModelSummary`, `LiveClock`.

---

## 4. Model Data (skema localStorage)

```ts
type ProductCode = '2TR' | '1TR' | 'KAI' | 'CRANK';

interface Break {
  type: 'DANDORI' | 'WAKOM1' | 'WAKOM2' | 'ISTIRAHAT1' | 'ISTIRAHAT' | 'MAGHRIB';
  label: string;
  startMin: number;   // menit-dari-tengah-malam
  endMin: number;
}

interface ShiftConfig {
  startMin: number;   // default 07:00 → 420
  endMin: number;     // default 19:00 → 1140
  pic: string;
  shiftNo: number;
  tTimeSec: number;   // takt/T.Time (mis. 48) — ditampilkan saja di MVP
  breaks: Break[];
}

interface Product { code: ProductCode; label: string; color: string; }

interface PlanLot {
  id: string;
  productCode: ProductCode;
  lotNo: number;      // urut per produk, mulai 1
  startMin: number;
  endMin: number;     // = startMin + 5
  shifted: boolean;   // true bila tergeser oleh line stop
}

interface LineStop {
  id: string;
  startMin: number;
  endMin: number;
  durationMin: number;   // endMin - startMin
  keterangan: string;    // mis. "F.Releasing LS Fault"
}
```

`actualLots` **tidak** disimpan terpisah — diturunkan runtime dari `planLots` (PRD §3.3: ACT selalu mengikuti PLN).

**Default produk & warna** (mengadaptasi papan asli):
`2TR` biru/cyan · `1TR` magenta · `KAI` oranye · `CRANK` hijau. (Nilai final ditentukan saat implementasi UI.)

---

## 5. Algoritma Inti (fungsi murni di `scheduling.ts`)

### 5.1 `autoPlaceLots(sequence, shiftConfig)`
Input: daftar `{ productCode, count }` sesuai urutan produksi.
Proses:
1. Mulai dari `shiftConfig.startMin`.
2. Untuk tiap lot: cari 5 menit berikutnya yang **tidak** bertumpang dengan blok non-produksi (Break) maupun line stop; bila menit jatuh di dalam blok, lompat ke akhir blok tersebut.
3. Tetapkan `startMin`, `endMin = startMin+5`, `lotNo` (increment per produk).
4. Ulang hingga semua count habis atau `endMin > shiftConfig.endMin` (sisa lot ditandai overflow).

### 5.2 `deriveActual(planLots, nowMin)`
- Untuk setiap `planLot` dengan `startMin ≤ nowMin`, hasilkan `actualLot` cermin (PRD §3.3).
- Tanpa line stop → ACT identik dengan PLN sampai jam sekarang. Tanpa klik manual.
- Dipicu ulang oleh tick 1 menit (`LiveClock`).

### 5.3 `applyLineStop(planLots, lineStop, shiftConfig)`  (PRD §3.4)
1. Kunci `[lineStop.startMin, lineStop.endMin]` di baris PLN sebagai **blok merah** dengan `keterangan`.
2. Semua lot dengan `startMin ≥ lineStop.startMin` **tergeser maju**:
   - Lot tertunda pertama ditempatkan pada menit bebas pertama **setelah** `lineStop.endMin`.
   - Lot berikutnya menyusul secara **kumulatif** 5-menit, tetap melompati blok non-produksi & line stop lain.
   - Tandai `shifted = true`.
3. Kembalikan `planLots` baru; `actualLots` otomatis diturunkan ulang oleh store.

**Edge cases yang harus ditangani:**
- Line stop yang menimpa lot yang sedang berjalan → lot itu ikut tergeser.
- Beberapa line stop bertumpuk → diterapkan berurutan (kumulatif).
- Lot yang tergeser melewati `endMin` shift → ditandai overflow, tidak hilang.
- Line stop yang seluruhnya jatuh di dalam blok istirahat → tetap dicatat di log, shifting no-op bila tak ada lot terdampak.

---

## 6. UI / Visual (mengikuti papan asli — PRD §4)

Latar hitam, garis grid kontras (merah), teks terang (hijau/cyan/putih/kuning) untuk visibilitas *shop floor*.

- **`BoardHeader`**: nama perusahaan/divisi, judul "PRODUCTION CONTROL BOARD MOULDING LINE",
  label "URUTAN KANBAN" & "INFORMASI LINE STOP", `PIC · SHIFT · T.TIME`, jam hidup + tanggal (`LiveClock`).
- **`TimeGrid`**: kolom kiri `WAKTU` (jam 07:00–19:00), tiap jam dua baris `PLN`/`ACT`;
  header menit 05–55; sel lot (`LotCell`) berwarna per produk berisi nomor lot;
  `BreakOverlay` biru transparan untuk blok non-produksi; `LineStopBlock` merah untuk line stop.
- **`LineStopPanel`** (kanan): tabel log (TIME, PROBLEM, COUNTER MEASURE, INFORMATION) +
  tombol/form **"+ Line Stop"** dengan **dropdown/time-picker** untuk jam & menit (PRD §3.5 usability),
  field keterangan.
- **`ModelSummary`** (kanan-bawah): tabel MODEL / PLAN / ACTUAL untuk 1TR, 2TR, KAI, CRANK, dan TOTAL.

**Layout target:** dioptimalkan untuk layar monitor lebar / tablet di area kerja (PRD §1).

---

## 7. Testing

- **Unit (utama):** `time.ts` dan `scheduling.ts` — kasus auto-place (dengan/ tanpa break), derive ACT
  pada berbagai `nowMin`, dan skenario line-stop (single, kumulatif, overflow, no-op). Ini kontrak inti aplikasi.
- **Store:** action `addLots` / `addLineStop` menghasilkan state yang benar dan persist.
- **Komponen:** smoke render grid + panel; verifikasi visual via preview (screenshot) saat implementasi.

---

## 8. Non-Fungsional (PRD §4)

- **Reliability:** auto-shifting harus selesai tanpa hambatan saat form line stop disimpan (fungsi murni, sinkron).
- **Usability:** input jam/menit line stop pakai dropdown/time-picker untuk cegah error input.
- **Visibilitas:** palet kontras tinggi tema pabrik gelap.
- **Persistence:** localStorage; catat keterbatasan no cross-sync & risiko clear-data (PRD §5.3).
