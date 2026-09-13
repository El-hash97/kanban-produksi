# Design Spec — "Input Parameter" Pop-up (4 Tab) + "Update Planning" Window

**Date:** 2026-09-13
**Status:** Approved (design), pending implementation plan
**Depends on:** existing board (`src/store/boardStore.ts`, `src/domain/*`, `src/components/LineStopPanel.tsx`, `AddLotsForm.tsx`, `ModelSummary.tsx`, `BoardHeader.tsx`)
**Reference:** foto `referensi/IMG_20260912_165126.jpg` (Update Planning), `165157.jpg` (Input Problem), `165203.jpg` (Input Planning), `165218.jpg` (Input Informasi), `165227.jpg` (InputPic) — jendela HMI "Input Parameter" & "Update Planning" pada mesin Andon Molding Production asli.

---

## 1. Ringkasan & Tujuan

Papan Shikake saat ini memasukkan data lewat form inline yang tersebar di beberapa tab
(`+ LOT` di `AddLotsForm`, form Line Stop inline di `LineStopPanel`). Referensi menunjukkan
pola HMI asli: satu jendela pop-up **"Input Parameter"** dengan **4 tab** (Input Problem,
Input Planning, Input Informasi, InputPic), plus jendela terpisah **"Update Planning"**
(qty saat ini vs target + riwayat).

**Cakupan:**
- Pop-up **Input Parameter** (4 tab) menggantikan form tambah-data inline yang ada.
- Pop-up **Update Planning** terpisah (qty per model: CURRENT vs PLANNING + HISTORY PLANNING).
- Field baru: **Counter Measure** & kategori **AV/PE/RQ** pada Line Stop.
- Field baru: **Sand Meas. Time** & **Mold/Batch** (referensi saja, tidak memengaruhi jadwal).
- Field baru: **Group** (RED/BLUE/GREEN/YELLOW) pada shift, diedit lewat tab InputPic.
- Fitur baru: **Input Informasi** — catatan bebas.
- Relabel produk: kode `KAI` tetap, label tampilan menjadi **"CAMS"**.

**Di luar cakupan (sesuai keputusan brainstorming):**
- Sand Meas. Time / Mold per Batch **tidak** mengubah `LOT_PITCH_SEC` atau algoritma
  penempatan lot — murni informasi/referensi yang disimpan & ditampilkan.
- Tidak ada produk ke-5; "CAMS" adalah label baru untuk kode `KAI` yang sudah ada.

---

## 2. Keputusan Desain (hasil brainstorming)

| Topik | Keputusan |
|---|---|
| AV/PE/RQ | **Radio, pilih satu** (kategori OEE: Availability/Performance/Rate-Quality). |
| Sand Meas Time & Mold/Batch | **Referensi saja** — disimpan & ditampilkan, tidak dipakai `autoPlaceLots`/`applyLineStops`. |
| CAMS vs KAI | **Sama** — kode internal tetap `'KAI'`, hanya `Product.label` yang berubah jadi "CAMS". |
| Update Planning vs Input Planning | **Dua pintu berbeda tujuan**: Input Planning = tambah lot baru ke jadwal (seperti `+ LOT` sekarang, diperkaya); Update Planning = sesuaikan qty saat ini ke target + riwayat perubahan (`HISTORY PLANNING`). |
| Bentuk pop-up | Satu modal **Input Parameter** bertab (4 tab), menggantikan form inline yang ada; **Update Planning** modal terpisah, dibuka dari tombol sendiri. |
| Form lama | `AddLotsForm.tsx` (form tambah) dan form-tambah inline di `LineStopPanel.tsx` **dipensiunkan**; tabel log/summary read-only yang sudah ada (termasuk edit-inline ✎ dan tombol "− LOT" di `ModelSummary`) **tetap ada**, tidak dipindah ke modal. |

---

## 3. Model Data

### 3.1 `LineStop` — tambah Counter Measure & kategori

```ts
export type LineStopCategory = 'AV' | 'PE' | 'RQ';

export interface LineStop {
  id: string;
  startMin: number;
  endMin: number;
  durationMin: number;
  keterangan: string;
  counterMeasure: string;       // BARU
  category: LineStopCategory;   // BARU, default 'AV' pada form
}
```

Data lama yang sudah tersimpan (localStorage) tidak punya dua field ini. Karena keduanya
murni informasi tambahan (tidak memengaruhi `applyLineStops`/penjadwalan), **tidak perlu
migrasi paksa** — cukup fallback aman di titik baca: `s.counterMeasure ?? ''`,
`s.category ?? 'AV'`.

### 3.2 `Product` — tambah info referensi sand/mold

```ts
export interface Product {
  code: ProductCode;
  label: string;
  color: string;
  sandMeasTimeMin: number;   // BARU, referensi saja
  moldPerBatch: number;      // BARU, referensi saja
}
```

`DEFAULT_PRODUCTS` diperbarui (nilai dari foto referensi):

| code | label baru | sandMeasTimeMin | moldPerBatch |
|---|---|---|---|
| `2TR` | B/C 2TR | 9.5 | 7 |
| `1TR` | B/C 1TR | 9.5 | 7 |
| `KAI` | **CAMS** (ganti dari "TR-KAI") | 11.5 | 5 |
| `CRANK` | CRANK | 11.5 | 5 |

### 3.3 `ShiftConfig` — tambah Group

```ts
export type TeamGroup = 'RED' | 'BLUE' | 'GREEN' | 'YELLOW';

export interface ShiftConfig {
  // ...field lama tidak berubah...
  group: TeamGroup;   // BARU, default 'RED'
}
```

`buildShiftConfig` menyertakan `group: 'RED'` secara default. `migrateShift` (sudah ada,
dipakai di persist `merge`) diperluas: `group: shift.group ?? 'RED'` — sama pola dengan
perbaikan field lama (`ensureDandori`, dsb.), state lama otomatis sembuh saat load.

### 3.4 Riwayat Planning & Informasi (baru, top-level state)

```ts
export interface PlanningEntry {
  productCode: ProductCode;
  qty: number;
  sandMeasTimeMin: number;   // nilai yang dipilih user saat submit, boleh beda dari default Product
}

export interface PlanningSnapshot {
  id: string;
  at: number;              // minute-of-day board saat dicatat (untuk tampilan riwayat)
  entries: PlanningEntry[];
  totalQty: number;
  taktTimeSec: number;      // salinan shiftConfig.tTimeSec saat itu
  timeBeginMin: number;
  group: TeamGroup;
  sandPerMixing: number;
}

export interface InformasiNote {
  id: string;
  at: number;
  text: string;
}
```

Store gains: `planningHistory: PlanningSnapshot[]` (terbaru pertama), `informasiLog: InformasiNote[]`
(terbaru pertama), `sandPerMixing: number` (default `2700`).

---

## 4. Pop-up "Input Parameter" (4 tab)

Satu tombol **"⚙ Input Parameter"** di tab strip membuka modal ini (gaya sama dengan
`BreakSettingsModal` yang sudah ada: overlay gelap, panel tengah, ✕ tutup). Berisi 4 tab
internal (mirip referensi: `Input Problem | Input Planning | Input Informasi | InputPic`).

### 4.1 Tab: Input Problem (memperkaya Line Stop)

Field: `TIME BEGIN` / `TIME END` (`TimeSelect` yang sudah ada), `PROBLEM` (textarea — sebelumnya
input satu baris), **`COUNTER MEASURE`** (textarea, baru), **kategori radio `AV / PE / RQ`**
(baru, default `AV`, wajib pilih satu). Tombol **"INSERT LINE STOP"** memanggil:

```ts
addLineStop(startMin, endMin, problem, counterMeasure, category)
```

`addLineStop` di store diperluas menerima 2 parameter baru (menggantikan `keterangan` lama
dengan `problem`, field `LineStop.keterangan` tetap dipakai sebagai nama field internal untuk
kompatibilitas). `updateLineStop` diperluas serupa: `(id, startMin, endMin, problem, counterMeasure, category)`.

Tabel log Line Stop yang sudah ada di papan (bukan di dalam modal — tetap terlihat di board)
mendapat 2 kolom baru: **COUNTER MEASURE** dan badge kategori (**AV**/**PE**/**RQ**),
melengkapi kolom "COUNTER MEASURE" pada header papan referensi asli yang selama ini kosong.

### 4.2 Tab: Input Planning (memperkaya "+ LOT")

Satu baris per produk (2TR / 1TR / **CAMS** / CRANK) berisi: input qty, dropdown **Sand Meas.
Time** (preset, default dari `Product.sandMeasTimeMin`), dan angka **Mold/Batch** (read-only,
dari `Product.moldPerBatch`). Di bawahnya: **TOTAL** (jumlah semua qty, read-only, dihitung
live), **TAKT TIME** (read-only, salinan `shiftConfig.tTimeSec`), `TIME BEGIN` (`TimeSelect`,
terhubung ke `setProductionStart` yang sudah ada), **GROUP** (dropdown RED/BLUE/GREEN/YELLOW),
**JML.SAND/MIXING** (angka, terhubung ke `sandPerMixing`).

Tombol **"INSERT PLAN"**:
1. `setGroup(group)`
2. `setProductionStart(timeBeginMin)`
3. `setSandPerMixing(jmlSand)`
4. `addLots(entries.filter(e => e.qty > 0).map(e => ({ productCode: e.productCode, count: e.qty })))` — memakai engine penempatan yang **sudah ada**, tidak berubah.
5. `logPlanningSnapshot(entries, group, timeBeginMin)` — mencatat snapshot ke `planningHistory` (bookkeeping murni, tidak menyentuh `planLots`).

### 4.3 Tab: Input Informasi (baru)

Satu textarea + tombol **"INSERT INFORMASI"** → `addInformasi(text)`, menambah entri ke
`informasiLog`. Daftar catatan (terbaru dulu) ditampilkan sebagai list kecil di bawah kotak
input, di dalam tab yang sama — tidak ada tempat lain di referensi yang menampilkannya, jadi
riwayatnya cukup terlihat di sini.

### 4.4 Tab: InputPic (baru)

Field: `PIC` (teks bebas), `SHIFT` (dropdown 1/2 — memanggil `setShiftNo` yang **sudah ada**,
efek sampingnya *[reset planLots/lineStops saat shift berbeda]* tidak berubah), `GROUP`
(dropdown RED/BLUE/GREEN/YELLOW). Tombol **"UPDATE"** memanggil `setPic(pic)` dan
`setGroup(group)` (dan `setShiftNo(shiftNo)` bila berbeda dari shift aktif). `BoardHeader`
menampilkan `Group` di sebelah PIC/Shift/T.Time yang sudah ada.

---

## 5. Pop-up "Update Planning" (jendela terpisah)

Tombol **"📋 Update Planning"** sendiri di tab strip (terpisah dari Input Parameter). Tabel:
`MODEL | CURRENT | PLANNING` untuk 2TR/1TR/CAMS/CRANK — **CURRENT** dihitung live dari
`planLots` (read-only, jumlah lot per produk saat ini), **PLANNING** adalah input target qty
(terisi awal = CURRENT), plus dropdown Sand Meas Time per baris dan `JML.SAND/MIXING`.

Tombol **"UPDATE PLANNING"** memanggil store action baru:

```ts
applyPlanningTargets(entries: { productCode: ProductCode; qty: number }[]): void
```

**Algoritma** (satu pembaruan state, bukan berurutan per produk): untuk setiap produk, hitung
`target - current`. Bila positif, lot tambahan ditempatkan lewat `autoPlaceLots` (mesin yang
sama dipakai `addLots`) menyambung di akhir lot produk itu. Bila negatif, lot dengan `lotNo`
tertinggi pada produk itu dihapus — persis semantik `removeLots` yang sudah ada. Semua produk
direkonsiliasi bersamaan, lalu di-renumber per produk (`renumberByProduct`), lalu dijalankan
lewat `applyLineStops(..., effectiveShift(shiftConfig, activeDay), lineStops)` — pipa yang
sama dipakai `addLots`/`removeLots` sekarang, hanya digabung jadi satu langkah agar tidak ada
render antara per-produk. Setelah berhasil, memanggil `logPlanningSnapshot(...)` yang sama
dipakai Input Planning, sehingga riwayat gabungan.

Di bawah tabel: **HISTORY PLANNING** (No, 1TR, 2TR, CAMS, CRANK), membaca `planningHistory`
(terbaru pertama), kosong menampilkan "No data to display" seperti referensi.

---

## 6. Perubahan pada Komponen yang Sudah Ada

- **`AddLotsForm.tsx`**: form "+ LOT" dan "JAM MULAI PRODUKSI" dipensiunkan (fungsinya
  dipindah ke tab Input Planning). Tombol **Reset** (papan) dipindah ke tempat lain di tab
  strip (mis. dekat tombol ⚙ Setting yang sudah ada), supaya tetap bisa diakses.
- **`LineStopPanel.tsx`**: form tambah inline (Mulai/Selesai/Keterangan/+ Line Stop)
  dipensiunkan; tabel log (dengan edit-inline ✎/✓/✕ yang sudah ada) **tetap ada**, ditambah
  2 kolom baru (§4.1).
- **`ModelSummary.tsx`**: tabel + tombol "− LOT" inline yang sudah ada **tetap ada** (tetap
  berguna untuk koreksi cepat satu produk); tidak digantikan Update Planning, keduanya
  hidup berdampingan.
- **`BoardHeader.tsx`**: menambah tampilan `Group` di samping PIC/Shift/T.Time.

---

## 7. Store (`boardStore.ts`)

Actions baru:
- `setPic(pic: string): void`
- `setGroup(group: TeamGroup): void`
- `setSandPerMixing(n: number): void`
- `addInformasi(text: string): void`
- `logPlanningSnapshot(entries: PlanningEntry[], group: TeamGroup, timeBeginMin: number): void`
- `applyPlanningTargets(entries: { productCode: ProductCode; qty: number }[]): void`

Actions diperluas (tanda tangan berubah, seluruh pemanggil disesuaikan):
- `addLineStop(startMin, endMin, problem, counterMeasure, category)`
- `updateLineStop(id, startMin, endMin, problem, counterMeasure, category)`

State baru: `planningHistory`, `informasiLog`, `sandPerMixing` (top-level, bukan per-shift —
berlaku lintas shift, konsisten dengan `products`).

`persist` `merge` diperluas: `migrateShift` menjamin `group` ada (default `'RED'`) di
`shiftConfig` maupun tiap entri `shiftPresets`; `planningHistory`/`informasiLog`/`sandPerMixing`
memakai default kosong/2700 bila belum ada di state lama (state persist lama tidak punya field
ini sama sekali, jadi cukup `merged.planningHistory ?? []`, dst., di dalam `merge`).

---

## 8. Testing

- **`defaults.test.ts`**: `DEFAULT_PRODUCTS` punya `sandMeasTimeMin`/`moldPerBatch` sesuai
  tabel §3.2; label `KAI` adalah "CAMS"; `buildShiftConfig` menyertakan `group: 'RED'`;
  `migrateShift` menambahkan `group` default pada shift lama yang belum punya.
- **`boardStore.test.ts`**:
  - `setPic`/`setGroup`/`setSandPerMixing` mengubah state yang sesuai.
  - `addInformasi` menambah entri ke `informasiLog` (terbaru di depan).
  - `logPlanningSnapshot` menambah entri ke `planningHistory` dengan field yang benar.
  - `applyPlanningTargets`: menaikkan qty suatu produk menambah lot (via engine yang sama,
    posisi lot lama tidak berubah); menurunkan qty menghapus lot ber-`lotNo` tertinggi milik
    produk itu (sama semantik `removeLots`); beberapa produk direkonsiliasi dalam satu
    pemanggilan tanpa lot produk lain ikut bergeser tak perlu.
  - `addLineStop`/`updateLineStop` versi baru menyimpan `counterMeasure` dan `category`.
- **Komponen**: verifikasi visual (preview) — modal Input Parameter dengan 4 tab, modal
  Update Planning, kolom baru pada tabel log Line Stop, badge kategori.

---

## 9. Non-Fungsional

- **Kompatibilitas mundur:** state lama (`shikake-board-v1`) tanpa `group`/`planningHistory`/
  `informasiLog`/`sandPerMixing`/`counterMeasure`/`category` tetap termuat tanpa error —
  semuanya punya default aman di `merge` atau di titik baca komponen.
- **Tidak mengubah engine penjadwalan:** `autoPlaceLots`, `applyLineStops`, `LOT_PITCH_SEC`
  tidak disentuh oleh field Sand Meas Time/Mold per Batch (§1, keputusan brainstorming).
  `applyPlanningTargets` memakai ulang fungsi-fungsi ini, tidak menduplikasi logika penempatan.
  Kompatibel dengan filter DAY/FRIDAY (`activeDay`/`effectiveShift`) yang sudah ada.
- **Konsistensi visual:** modal baru mengikuti palet papan (hitam/cyan/hijau/kuning/merah)
  seperti `BreakSettingsModal`, bukan meniru warna abu-abu Windows pada foto referensi.
