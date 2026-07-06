# Design Spec — Panel Urutan Tapping Furnace (PRD §3.5)

**Date:** 2026-07-06
**Status:** Approved (design), pending implementation plan
**Source PRD:** `prd.md` §3.5 ("Integrasi Urutan Tapping Furnace")
**Depends on:** `2026-07-05-shikake-production-board-design.md` (papan Shikake MVP, sudah diimplementasikan)

---

## 1. Ringkasan & Cakupan

Menambahkan panel baru pada aplikasi Shikake yang sudah ada: **Urutan Tapping Furnace**, sebuah
mini-kanban (kolom **PLAN** / **ACTION**) yang menampilkan giliran tapping dari 4 furnace, **diturunkan
otomatis** dari `planLots` yang sudah ada di board utama — tanpa mengubah cara lot digenerate atau
diurutkan di board utama.

**Cakupan:**
- 4 identitas furnace (F1–F4), masing-masing warna berbeda.
- Aturan: 1 tapping = 3 lot kecil.
- Aturan: `KAI` dan `CRANK` selalu tapping di Furnace 3 (murni, tidak campur dengan produk lain).
- Aturan: `2TR`/`1TR` (boleh campur satu sama lain dalam 1 tapping) bergantian furnace mengikuti
  siklus default **F1, F1, F4, F2, F2** (berulang) — F1 & F2 masing-masing 2× berturut-turut,
  F4 hanya 1×.
- Panel kanban PLAN → ACTION, kartu tapping berpindah otomatis mengikuti jam berjalan (bukan klik manual).
- Tervalidasi ulang otomatis saat Line Stop menggeser waktu lot (PRD §3.5, kalimat terakhir).

**Di luar cakupan:**
- Tidak mengubah urutan/algoritma `autoPlaceLots` di board utama — urutan produk pada PLN tetap
  sepenuhnya ditentukan oleh urutan input PIC di `AddLotsForm`, sama seperti sekarang.
- Tidak ada UI untuk mengedit identitas/warna furnace (4 furnace tetap/statis, seperti katalog produk
  tetap ada 4).
- Tidak ada konfigurasi siklus rotasi furnace lewat UI (siklus F1,F1,F4,F2,F2 adalah konstanta domain).

---

## 2. Keputusan Desain Kunci (hasil brainstorming)

| Topik | Keputusan |
|---|---|
| Sumber data | Panel **diturunkan (derived)** dari `planLots` yang sudah ada — tidak ada state baru di `boardStore` untuk tapping. |
| Pengelompokan 1 tapping | 3 lot kecil **berurutan** dalam barisan yang kompatibel (lihat §3). Sisa <3 di ujung tetap ditampilkan sebagai kartu "belum lengkap". |
| Assignment furnace KAI/CRANK | Selalu **Furnace 3**, tidak pernah campur dengan 2TR/1TR dalam 1 kartu. |
| Assignment furnace 2TR/1TR | Bergantian mengikuti siklus tetap **F1, F1, F4, F2, F2** (lalu berulang), dihitung terpisah dari kelompok KAI/CRANK. Boleh campur 2TR+1TR dalam 1 kartu. |
| Penomoran urut tapping | Global, berdasarkan `startMin` lot pertama tiap kartu (gabungan kedua barisan, diurutkan kronologis). |
| Trigger PLAN → ACTION | Otomatis: begitu **lot ke-3 (lot terakhir)** dalam kartu tapping mencapai `startMin`-nya relatif ke jam berjalan (`nowMin`) — mekanisme sama seperti `deriveActual` di board utama. |
| Reaksi terhadap Line Stop | Otomatis — karena derivasi membaca `planLots` (yang sudah di-reflow oleh `applyLineStops`) dan `nowMin`, tidak perlu logika tambahan apa pun. |
| Warna furnace | F1 oranye `#f97316`, F2 cyan `#06b6d4`, F3 ungu `#a855f7`, F4 merah muda `#f43f5e` — dipilih berbeda dari palet 4 produk yang sudah ada (biru/fuchsia/amber/hijau) agar tidak tertukar. |

---

## 3. Algoritma Inti (fungsi murni baru — `src/lib/tapping.ts`)

Mengikuti pola modul murni yang sudah ada (`scheduling.ts`, `time.ts`): tanpa React, tanpa akses
store, input/output deterministik, diuji dengan Vitest.

```ts
export type FurnaceId = 1 | 2 | 3 | 4;
export type TappingStatus = 'PLAN' | 'ACTION';

export interface TappingGroup {
  id: string;
  sequenceNo: number;       // urut global, 1..N
  furnaceId: FurnaceId;
  lots: PlanLot[];          // 1-3 lot; <3 hanya di ujung (belum lengkap)
  startMin: number;         // = lots[0].startMin
  complete: boolean;        // lots.length === 3
}
```

### 3.1 `deriveTappingGroups(planLots: PlanLot[]): TappingGroup[]`

1. Filter `planLots` (urutan array = urutan kronologis) menjadi dua barisan, **mempertahankan urutan
   relatif asli**:
   - Barisan A: `productCode === 'KAI' || productCode === 'CRANK'`
   - Barisan B: `productCode === '2TR' || productCode === '1TR'`
2. Chunk masing-masing barisan menjadi grup berurutan maksimal 3 lot (`chunk(arr, 3)`); grup terakhir
   tiap barisan boleh berisi 1–2 lot (`complete = lots.length === 3`).
3. Assign furnace:
   - Tiap grup dari Barisan A → `furnaceId = 3`.
   - Tiap grup dari Barisan B → furnace berikutnya dari siklus tetap `[1, 1, 4, 2, 2]`, diindeks oleh
     urutan grup dalam Barisan B saja (independen dari Barisan A).
4. Gabungkan semua grup dari kedua barisan, urutkan berdasarkan `startMin` (= `lots[0].startMin`),
   lalu beri `sequenceNo` 1..N sesuai urutan tersebut.

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
- Layout 2 kolom: **PLAN** (kartu dengan `status === 'PLAN'`) di kiri, **ACTION**
  (`status === 'ACTION'`) di kanan — masing-masing diurutkan `sequenceNo` menaik.
- Kartu tapping: border-left/background warna sesuai `furnace.color`, isi:
  - `Tap #<sequenceNo>` + label furnace (mis. "Furnace 3").
  - Ringkasan isi lot, mis. `2TR Lot 5-6, 1TR Lot 1` (dikelompokkan per productCode dalam kartu itu,
    tampilkan rentang lotNo bila berurutan) atau `CRANK Lot 3-5`.
  - Kartu `complete: false` diberi penanda visual (mis. label "belum lengkap" / opacity berbeda).
- Gaya visual mengikuti konvensi panel lain: latar hitam, teks hijau/putih/cyan, border kontras
  (lihat `LineStopPanel.tsx`, `ModelSummary.tsx`).

---

## 6. Testing

- **Unit (utama):** `src/lib/tapping.test.ts` (Vitest, pola sama seperti `scheduling.*.test.ts`):
  - KAI/CRANK selalu furnace 3, tidak pernah campur produk lain dalam 1 kartu.
  - 2TR/1TR rotasi F1,F1,F4,F2,F2 dan berulang dengan benar untuk banyak grup.
  - 2TR dan 1TR boleh campur dalam 1 kartu tapping.
  - Penomoran `sequenceNo` kronologis berdasar `startMin` gabungan kedua barisan.
  - Kartu dengan sisa lot <3 di ujung barisan ditandai `complete: false`, tidak hilang.
  - `withTappingStatus` memindah status PLAN→ACTION tepat saat `nowMin` melewati `startMin` lot
    terakhir kartu.
  - Retag produk (mis. lot pindah dari 2TR ke KAI) menghasilkan re-derivasi grup yang konsisten.
- **Komponen:** smoke render `TappingPanel` dengan beberapa `planLots` contoh; verifikasi visual
  (warna furnace, posisi PLAN/ACTION) via preview saat implementasi.

---

## 7. Non-Fungsional

- **Reliability:** derivasi adalah fungsi murni sinkron — tidak ada risiko state tapping "basi"
  karena selalu dihitung ulang dari `planLots` + `nowMin` terkini, sama seperti `deriveActual`.
- **Konsistensi dengan Line Stop:** karena tidak ada state tapping tersendiri, pergeseran lot akibat
  Line Stop otomatis tercermin di panel tapping tanpa logika sinkronisasi tambahan (PRD §3.5).
- **Visibilitas:** 4 warna furnace dipilih kontras satu sama lain dan berbeda dari 4 warna produk yang
  sudah ada, konsisten dengan tema gelap shop-floor aplikasi.
