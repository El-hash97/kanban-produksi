# Design Spec — Panel Urutan Tapping Furnace (PRD §3.5)

**Date:** 2026-07-06 (revised same day after implementation feedback)
**Status:** Implemented
**Source PRD:** `prd.md` §3.5 ("Integrasi Urutan Tapping Furnace")
**Depends on:** `2026-07-05-shikake-production-board-design.md` (papan Shikake MVP, sudah diimplementasikan)

> **Revisi:** Setelah implementasi awal (kolom PLAN/ACTION side-by-side, kartu isi teks, siklus
> dua-barisan independen), user memberi masukan lanjutan: layout kanban vertikal (PLAN di atas,
> ACTION di bawah), token berbentuk (persegi/segitiga/lingkaran) berisi nomor furnace saja, dan
> furnace 3 harus tetap ikut siklus tapping TR begitu stok KAI/CRANK habis alih-alih idle. Dokumen
> ini sudah diperbarui untuk mencerminkan desain final yang diimplementasikan; lihat §2/§3/§5.

---

## 1. Ringkasan & Cakupan

Menambahkan panel baru pada aplikasi Shikake yang sudah ada: **Urutan Tapping Furnace**, sebuah
mini-kanban (kolom **PLAN** / **ACTION**) yang menampilkan giliran tapping dari 4 furnace, **diturunkan
otomatis** dari `planLots` yang sudah ada di board utama — tanpa mengubah cara lot digenerate atau
diurutkan di board utama.

**Cakupan:**
- 4 identitas furnace (F1–F4), masing-masing warna berbeda; ditampilkan sebagai **nomor furnace saja**
  di dalam sebuah token berbentuk.
- Aturan: 1 tapping = 3 lot kecil.
- Aturan: `KAI` dan `CRANK` selalu tapping di Furnace 3 (murni, tidak campur dengan produk lain).
  Bentuk token: **segitiga** untuk CRANK, **lingkaran** untuk KAI.
- Aturan: `2TR`/`1TR` (boleh campur satu sama lain dalam 1 tapping) mengikuti siklus tetap
  **F1, F1, F3, F4, F3, F2, F2** (berulang) — F1 & F2 masing-masing 2× berturut-turut, F4 hanya 1×.
  Bentuk token: **persegi**.
- Kedua slot F3 dalam siklus **lebih memilih** KAI/CRANK; begitu stok KAI/CRANK habis, kedua slot itu
  **tidak idle** — otomatis mengambil TR berikutnya (tetap 2× tapping di posisi yang sama, siklus
  yang sama, bentuk token jadi persegi karena isinya TR).
- Panel kanban vertikal: **PLAN di atas**, **ACTION di bawah** — token tapping berpindah otomatis
  (turun dari PLAN ke ACTION) mengikuti jam berjalan, bukan klik manual.
- Tervalidasi ulang otomatis saat Line Stop menggeser waktu lot (PRD §3.5, kalimat terakhir).

**Di luar cakupan:**
- Tidak mengubah urutan/algoritma `autoPlaceLots` di board utama — urutan produk pada PLN tetap
  sepenuhnya ditentukan oleh urutan input PIC di `AddLotsForm`, sama seperti sekarang.
- Tidak ada UI untuk mengedit identitas/warna furnace (4 furnace tetap/statis, seperti katalog produk
  tetap ada 4).
- Tidak ada konfigurasi siklus rotasi furnace lewat UI (siklus F1,F1,F3,F4,F3,F2,F2 adalah konstanta domain).

---

## 2. Keputusan Desain Kunci (hasil brainstorming)

| Topik | Keputusan |
|---|---|
| Sumber data | Panel **diturunkan (derived)** dari `planLots` yang sudah ada — tidak ada state baru di `boardStore` untuk tapping. |
| Pengelompokan 1 tapping | 3 lot kecil **berurutan** dalam antrian yang kompatibel (lihat §3). Sisa <3 di ujung tetap ditampilkan sebagai token "belum lengkap". |
| Siklus furnace | **Dua template**, dipilih ulang di awal tiap pass 7-slot berdasarkan status antrian KAI/CRANK saat itu: selama masih ada sisa → **F1,F1,F3,F4,F3,F2,F2** (F3 split oleh F4); begitu sudah habis **sebelum pass baru dimulai** → **F1,F1,F4,F2,F2,F3,F3** (F3 dua kali berturut-turut, tanpa jeda furnace lain). |
| Assignment slot F3 | **Mengutamakan** antrian KAI/CRANK; begitu antrian itu habis di tengah 1 pass, slot F3 **fallback** ke antrian TR (2TR/1TR) pada pass yang sama — furnace 3 tetap tapping 2× di posisi yang sama, tidak pernah idle. Pass berikutnya (kalau KAI/CRANK sudah habis total) langsung pakai template merged sehingga 2 tapping F3 itu berurutan tanpa jeda. |
| Assignment slot F1/F2/F4 | Selalu dari antrian TR (2TR/1TR); boleh campur 2TR+1TR dalam 1 kartu. |
| Tidak pernah campur | KAI/CRANK tidak pernah berbagi 1 kartu dengan 2TR/1TR, baik saat F3 memakai antrian aslinya maupun saat fallback. |
| Bentuk token | `square` (default/TR — termasuk fallback F3), `triangle` (CRANK), `circle` (KAI) — ditentukan dari `productCode` isi kartu, independen dari `furnaceId`. |
| Penomoran urut tapping | Global, mengikuti **urutan konsumsi siklus** (bukan lagi sort berdasarkan `startMin` dua barisan terpisah — lihat §3). |
| Trigger PLAN → ACTION | Otomatis: begitu **lot ke-3 (lot terakhir)** dalam kartu tapping mencapai `startMin`-nya relatif ke jam berjalan (`nowMin`) — mekanisme sama seperti `deriveActual` di board utama. |
| Reaksi terhadap Line Stop | Otomatis — karena derivasi membaca `planLots` (yang sudah di-reflow oleh `applyLineStops`) dan `nowMin`, tidak perlu logika tambahan apa pun. |
| Warna furnace | F1 oranye `#f97316`, F2 cyan `#06b6d4`, F3 ungu `#a855f7`, F4 merah muda `#f43f5e` — dipilih berbeda dari palet 4 produk yang sudah ada (biru/fuchsia/amber/hijau) agar tidak tertukar. |
| Layout panel | Grid 2 kolom: label baris (**PLAN**/**ACTION**) di kiri dengan garis bantu (`border-r`/`border-b`), token di kanan. Tiap baris adalah `flex flex-wrap` sendiri (wrap independen, bukan scroll horizontal); PLAN selalu menampilkan semua tap, ACTION hanya yang `status === 'ACTION'`. Token diperkecil (`w-6 h-6`). |

---

## 3. Algoritma Inti (fungsi murni baru — `src/lib/tapping.ts`)

Mengikuti pola modul murni yang sudah ada (`scheduling.ts`, `time.ts`): tanpa React, tanpa akses
store, input/output deterministik, diuji dengan Vitest.

```ts
export type FurnaceId = 1 | 2 | 3 | 4;
export type TappingShape = 'square' | 'triangle' | 'circle';
export type TappingStatus = 'PLAN' | 'ACTION';

export interface TappingGroup {
  id: string;
  sequenceNo: number;       // urut global, 1..N (urutan konsumsi siklus)
  furnaceId: FurnaceId;
  shape: TappingShape;
  lots: PlanLot[];          // 1-3 lot; <3 hanya di ujung (belum lengkap)
  startMin: number;         // = lots[0].startMin
  complete: boolean;        // lots.length === 3
}
```

### 3.1 `deriveTappingGroups(planLots: PlanLot[]): TappingGroup[]`

1. Filter `planLots` (urutan array = urutan kronologis) menjadi dua antrian, **mempertahankan urutan
   relatif asli**, lalu chunk masing-masing jadi grup berurutan maksimal 3 lot (`chunk(arr, 3)`; grup
   terakhir boleh berisi 1–2 lot, `complete = lots.length === 3`):
   - `furnace3Queue`: `productCode === 'KAI' || productCode === 'CRANK'`
   - `trQueue`: `productCode === '2TR' || productCode === '1TR'`
2. Proses satu **pass** (7 slot) pada satu waktu. Di awal tiap pass, pilih template berdasarkan status
   `furnace3Queue` **saat itu**:
   - Masih ada sisa → **`[1, 1, 3, 4, 3, 2, 2]`** (F3 split oleh F4 — mungkin masih KAI/CRANK asli).
   - Sudah habis → **`[1, 1, 4, 2, 2, 3, 3]`** (F3 dua kali berturut-turut, tanpa jeda F4).
   Untuk tiap slot dalam pass itu:
   - Slot `3`: ambil grup berikutnya dari `furnace3Queue` bila masih ada; kalau sudah habis di
     tengah pass ini, **fallback** ambil dari `trQueue` (skenario ini hanya terjadi di pass yang
     dimulai dengan template split, karena template merged hanya dipakai begitu `furnace3Queue`
     kosong sejak awal pass).
   - Slot `1`/`2`/`4`: selalu ambil grup berikutnya dari `trQueue`.
   - Bila queue yang dibutuhkan slot itu kosong, slot tersebut dilewati (tidak menghasilkan kartu).
   - Pass berikutnya dimulai bila salah satu queue masih punya sisa; loop luar berhenti begitu kedua
     queue habis.
3. `shape` ditentukan dari isi kartu (bukan dari `furnaceId`): ada `CRANK` → `triangle`; ada `KAI` →
   `circle`; selain itu (TR, termasuk hasil fallback di slot F3) → `square`.
4. `sequenceNo` = urutan kartu dihasilkan oleh loop di atas (1..N) — **bukan** hasil sort ulang
   berdasarkan `startMin`; urutan loop itu sendiri sudah merepresentasikan urutan tapping yang dituju.

### 3.2 `withTappingStatus(groups: TappingGroup[], nowMin: number): (TappingGroup & { status: TappingStatus })[]`

- `status = 'ACTION'` bila `lots[lots.length - 1].startMin <= nowMin` (lot terakhir dalam kartu sudah
  "mulai" menurut jam berjalan — termasuk kartu belum lengkap, dievaluasi dari lot terakhir yang ada).
- Selain itu `status = 'PLAN'`.

**Edge case:**
- `planLots` kosong → `[]`.
- Total lot per barisan tidak kelipatan 3 → grup terakhir barisan itu tetap dibuat, `complete: false`.
- Reassignment produk lot (`setLotsProduct`) mengubah `productCode` sebuah lot di tengah barisan →
  derivasi dihitung ulang dari awal tiap render (fungsi murni, bukan incremental), jadi selalu konsisten
  dengan state `planLots` terkini — termasuk saat lot berpindah antar Barisan A/B karena retag produk.

---

## 4. Model Data Tambahan

```ts
// src/domain/types.ts (tambahan)
export type FurnaceId = 1 | 2 | 3 | 4;

export interface Furnace {
  id: FurnaceId;
  label: string;   // "Furnace 1".."Furnace 4"
  color: string;
}
```

```ts
// src/domain/defaults.ts (tambahan)
export const DEFAULT_FURNACES: Furnace[] = [
  { id: 1, label: 'Furnace 1', color: '#f97316' },
  { id: 2, label: 'Furnace 2', color: '#06b6d4' },
  { id: 3, label: 'Furnace 3', color: '#a855f7' },
  { id: 4, label: 'Furnace 4', color: '#f43f5e' },
];
```

Tidak ada perubahan pada `boardStore.ts` — `DEFAULT_FURNACES` adalah konstanta statis (seperti
`DEFAULT_PRODUCTS` dari sisi bentuknya, tapi tidak perlu disimpan sebagai state karena tidak ada UI
untuk mengeditnya).

---

## 5. UI / Komponen

### 5.1 `TappingPanel.tsx` (baru)

- Ditambahkan sebagai tab baru di `App.tsx`: `{ key: 'tapping', label: 'URUTAN TAPPING FURNACE' }`,
  di samping tab LINE STOP / BREAK / MODEL yang sudah ada — pola identik (state `tab` lokal, render
  kondisional).
- Membaca `planLots` dan `shiftConfig` dari `boardStore`, `nowMin` dari `useNowMin` (hook yang sudah
  ada), lalu memanggil `withTappingStatus(deriveTappingGroups(planLots), nowMin)` — dibungkus
  `useMemo` sama seperti pola di `ModelSummary.tsx`.
- Layout **grid 2 kolom** (`grid-cols-[3.5rem_1fr]`): kolom kiri berisi label baris (**PLAN**/**ACTION**),
  kolom kanan berisi token, dengan **garis bantu** — `border-r` memisahkan label dari token, `border-b`
  memisahkan baris PLAN dari baris ACTION. 4 elemen (label-PLAN, token-PLAN, label-ACTION,
  token-ACTION) ditaruh berurutan di DOM, grid otomatis membentuk 2 baris × 2 kolom.
- Baris **PLAN** (token area) selalu menampilkan token untuk **setiap** `TappingGroup`. Baris
  **ACTION** menampilkan token **hanya** untuk grup dengan `status === 'ACTION'` — jadi begitu sebuah
  tap sudah ACTION, tokennya tetap ada di PLAN (tidak berpindah/menghilang) sekaligus muncul di ACTION.
- **Tidak ada scroll horizontal:** kedua kolom token memakai `flex flex-wrap`, bukan `overflow-x-auto`
  — begitu token tidak muat di lebar layar, sisanya otomatis pindah ke baris baru di bawah. Baris PLAN
  dan ACTION wrap **independen** (masing-masing render token dengan caption lengkap sendiri, karena
  keduanya tidak lagi dipasangkan per kolom).
- Token tapping (`TappingShapeIcon`): sebuah bentuk kecil (`w-6 h-6`) berwarna `furnace.color`, isi
  hanya **nomor furnace** (tanpa label teks "Furnace N"):
  - `square` (persegi, default) — div biasa.
  - `triangle` (segitiga) — `clip-path: polygon(50% 0%, 0% 100%, 100% 100%)`.
  - `circle` (lingkaran) — `rounded-full`.
- Di bawah tiap bentuk, keterangan kecil (`text-[8px]`): `#<sequenceNo>` + ringkasan lot (mis.
  `2TR Lot 5-6, 1TR Lot 1` atau `CRANK Lot 3-5`); token `complete: false` mendapat label tambahan
  "!lengkap".
- Gaya visual mengikuti konvensi panel lain: latar hitam, teks hijau/putih/cyan, border kontras
  (lihat `LineStopPanel.tsx`, `ModelSummary.tsx`).

---

## 6. Testing

- **Unit (utama):** `src/lib/tapping.test.ts` (Vitest, pola sama seperti `scheduling.*.test.ts`):
  - Siklus `F1,F1,F3,F4,F3,F2,F2` berjalan sesuai urutan, dengan `shape` yang benar per slot.
  - Slot F3 fallback ke TR (tetap `furnaceId: 3`, `shape: 'square'`) begitu antrian KAI/CRANK habis.
  - 2TR dan 1TR boleh campur dalam 1 kartu tapping; KAI/CRANK tidak pernah campur dengan TR.
  - Penomoran `sequenceNo` mengikuti urutan konsumsi siklus, mulai dari 1.
  - Kartu dengan sisa lot <3 di ujung antrian ditandai `complete: false`, tidak hilang.
  - `withTappingStatus` memindah status PLAN→ACTION tepat saat `nowMin` melewati `startMin` lot
    terakhir kartu.
- **Manual/visual:** dev server (`npm run dev`) — cek bentuk token (persegi/segitiga/lingkaran), warna
  furnace, dan token turun dari PLAN ke ACTION seiring jam berjalan. Tidak ada test komponen otomatis
  (`.test.tsx`) — mengikuti konvensi proyek saat ini yang hanya menguji logic murni di `lib/`.

---

## 7. Non-Fungsional

- **Reliability:** derivasi adalah fungsi murni sinkron — tidak ada risiko state tapping "basi"
  karena selalu dihitung ulang dari `planLots` + `nowMin` terkini, sama seperti `deriveActual`.
- **Konsistensi dengan Line Stop:** karena tidak ada state tapping tersendiri, pergeseran lot akibat
  Line Stop otomatis tercermin di panel tapping tanpa logika sinkronisasi tambahan (PRD §3.5).
- **Visibilitas:** 4 warna furnace dipilih kontras satu sama lain dan berbeda dari 4 warna produk yang
  sudah ada, konsisten dengan tema gelap shop-floor aplikasi.
