# Design Spec — Break Schedules per Day-Type (DAY / FRIDAY) + Settings Pop-up

**Date:** 2026-09-13
**Status:** Approved (design), pending implementation plan
**Depends on:** existing board (`src/store/boardStore.ts`, `src/domain/*`, `src/lib/scheduling.ts`, `src/components/TimeGrid.tsx`)
**Reference:** foto "Setting Andon Molding Production → Work and Break Time Setting" (kolom Break Day = DAY / FRIDAY)

---

## 1. Ringkasan & Tujuan

Saat ini break (Dandori/Wakom/Istirahat) berupa satu daftar datar di `ShiftConfig.breaks`
— sama untuk setiap hari. Pengguna ingin **dua jadwal break**: **DAY** (hari biasa) dan
**FRIDAY** (Jumat), di mana Jumat berbeda (istirahat siang lebih panjang untuk salat Jumat),
serta **pop-up editor** untuk mengatur keduanya.

**Cakupan:**
- Dimensi hari (`DayType = 'DAY' | 'FRIDAY'`) pada setiap Break.
- Pemilihan jadwal aktif **otomatis dari tanggal** (Jumat → FRIDAY, selain itu DAY) dengan
  **override manual** (toggle) untuk sesi berjalan.
- Default break DAY & FRIDAY (hanya istirahat siang yang berbeda).
- **Pop-up `BreakSettingsModal`** dengan dua tabel editable (DAY & FRIDAY), dibuka dari
  tombol **⚙ Setting**; tab lama `DANDORI/WAKOM/ISTIRAHAT` dihapus.

**Di luar cakupan (sesuai keputusan):**
- Work Time (jam mulai/selesai shift) tetap seperti sekarang — tidak diedit di pop-up.
- Tidak menambah hari lain (mis. Sabtu). Hanya DAY vs FRIDAY.

---

## 2. Keputusan Desain (hasil brainstorming)

| Topik | Keputusan |
|---|---|
| Pemilihan hari | **Otomatis dari tanggal** saat load (`isFriday(today) → FRIDAY`), **+ toggle override** untuk sesi. |
| Isi pop-up | **Break Time saja** (DAY & FRIDAY). Work Time tidak diubah. |
| Tab lama | **Dihapus**, diganti tombol **⚙ Setting** yang membuka pop-up. |
| Sumber kebenaran break | Tetap satu list `ShiftConfig.breaks`, tiap item diberi tag `day`. Scheduling menerima **effective shift** (breaks difilter per `activeDay`). |
| Perbedaan DAY vs FRIDAY | Hanya **Istirahat siang** (DAY 45 menit, FRIDAY 75 menit). Sisanya sama. |
| Cara simpan di pop-up | **Apply-immediately** (seperti perilaku live-reflow sekarang), tidak ada draft/save terpisah. |

---

## 3. Model Data

```ts
// types.ts
export type DayType = 'DAY' | 'FRIDAY';

export interface Break extends Range {
  id: string;
  type: BreakType;
  label: string;
  day: DayType;          // BARU — hari mana break ini berlaku
}
```

- `ShiftConfig.breaks` menampung break **kedua hari** sekaligus (masing-masing bertanda `day`).
- `ShiftConfig` tidak berubah selain isi `breaks` kini mencakup dua hari.
- State store baru: `activeDay: DayType`.

### Effective shift (proyeksi hari aktif)
Helper murni baru di `src/lib/scheduling.ts`:

```ts
export function effectiveShift(shift: ShiftConfig, day: DayType): ShiftConfig {
  return { ...shift, breaks: shift.breaks.filter((b) => b.day === day) };
}
```

`autoPlaceLots` / `applyLineStops` **tidak berubah** — store selalu memberi mereka hasil
`effectiveShift(shiftConfig, activeDay)`. `TimeGrid` merender `effectiveShift(...).breaks`.

---

## 4. Default Break (offset dari awal shift)

Template offset (relatif ke `shift.startMin`) tetap dipakai agar shift 2 (19:00–07:00) ikut benar.
Dua template: `DAY_BREAKS` dan `FRIDAY_BREAKS`. Untuk shift 1 (mulai 07:00) menghasilkan:

| Break | DAY | FRIDAY | offset DAY | offset FRIDAY |
|---|---|---|---|---|
| Dandori | 07:00–07:15 | 07:00–07:15 | 0:00–0:15 | 0:00–0:15 |
| Wakom-1 | 09:30–09:40 | 09:30–09:40 | 2:30–2:40 | 2:30–2:40 |
| Istirahat-1 | 11:45–12:30 | **11:45–13:00** | 4:45–5:30 | 4:45–**6:00** |
| Wakom-2 | 14:30–14:40 | 14:30–14:40 | 7:30–7:40 | 7:30–7:40 |
| Istirahat-2 | 16:30–17:00 | 16:30–17:00 | 9:30–10:00 | 9:30–10:00 |

Semua nilai ini adalah **seed** dan **editable** lewat pop-up. `id` break memuat hari:
`brk-${shiftNo}-${day}-${idSuffix}` (mis. `brk-1-FRIDAY-istirahat1`) agar unik lintas hari.

`productionStartMin` tetap `startMin + 15` (tepat setelah Dandori 15 menit).

---

## 5. Pemilihan Hari (auto + override)

- `todayDayType(d = new Date()): DayType` — `d.getDay() === 5 ? 'FRIDAY' : 'DAY'` (helper murni di `src/lib/time.ts`).
- Saat load (persist `merge`) `activeDay` di-set dari `todayDayType()` — jadi papan selalu
  mengikuti hari nyata pada pembukaan.
- `setActiveDay(day)` (action store) mengubah `activeDay` dan **reflow** `planLots` memakai
  effective shift baru. Override ini berlaku untuk sesi; membuka ulang aplikasi kembali otomatis
  ke hari nyata (perilaku "auto + override" yang disepakati).

---

## 6. UI

### `BreakSettingsModal.tsx` (baru)
- Overlay gelap + panel tengah (tema papan: latar hitam, border cyan, teks terang).
- Judul: "SETTING DANDORI / WAKOM / ISTIRAHAT".
- **Dua tabel** bersisian/bertumpuk: **HARI BIASA (DAY)** dan **JUMAT (FRIDAY)**.
  Tiap baris: Nama, Mulai (`TimeSelect`), Selesai (`TimeSelect`), aksi ✎/✕.
  Baris Dandori terkunci 🔒 (tidak bisa dihapus, jam tetap editable) — konsisten aturan sekarang.
  Tiap tabel punya form "+ Tambah" (Nama + Mulai + Selesai) untuk hari tersebut.
- Edit **apply-immediately** ke store; menutup modal (tombol ✕ / klik overlay) hanya menutup.
- Isi tabel dipisah dari `TimeGrid`/scheduling: modal hanya memanggil action store.

### Tab strip (`App.tsx`)
- Hapus entri tab `{ key: 'break', label: 'DANDORI/WAKOM/ISTIRAHAT' }` dan cabang `tab === 'break'`.
- Tambah di ujung kanan strip: indikator **"HARI: DAY|FRIDAY"** sebagai toggle, dan tombol **⚙**
  yang membuka `BreakSettingsModal`.

### `TimeGrid.tsx`
- `Overlays` merender break dari `effectiveShift(shiftConfig, activeDay).breaks` (bukan
  `shiftConfig.breaks` mentah), sehingga hanya break hari aktif yang tampil.

---

## 7. Store

- Field baru: `activeDay: DayType`.
- `setActiveDay(day)`: set `activeDay`, reflow `planLots` via `applyLineStops(planLots, effectiveShift(shiftConfig, day), lineStops)`.
- `addBreak(day, label, startMin, endMin)`: `makeBreak` diberi `day`; reflow jika `day === activeDay`.
- `updateBreak(id, startMin, endMin)` & `removeBreak(id)`: tak berubah tanda tangannya (id sudah menentukan hari); reflow jika break yang diubah `day === activeDay`.
- Semua pemanggilan scheduling di store memakai `effectiveShift(shiftConfig, activeDay)` alih-alih `shiftConfig`.
- `ensureDandori(shift)`: jamin **satu Dandori per hari** (DAY & FRIDAY).

### Migrasi (`merge`)
State lama menyimpan break tanpa `day`. Saat load:
1. Untuk tiap shift (shiftConfig & shiftPresets): break tanpa `day` ditandai `DAY`.
2. Buat salinan **FRIDAY** dari break DAY (id & `day` baru) bila belum ada break FRIDAY,
   sehingga kedua hari selalu ada; pengguna lalu menyesuaikan istirahat Jumat.
3. `ensureDandori` menjamin Dandori tiap hari.
4. `activeDay` di-set dari `todayDayType()`.

---

## 8. Testing

- **`time.test.ts`**: `todayDayType` — Jumat → FRIDAY, hari lain → DAY.
- **`defaults.test.ts`**: `buildShiftConfig` menghasilkan break DAY & FRIDAY; Dandori ada di kedua
  hari; Istirahat FRIDAY lebih panjang dari DAY; semua break dalam jendela shift.
- **`scheduling` (baru: `scheduling.effectiveshift.test.ts`)**: `effectiveShift` hanya menyisakan
  break hari yang diminta; `autoPlaceLots` dengan effective FRIDAY menaruh lot berbeda dari DAY
  di sekitar istirahat siang.
- **`boardStore.test.ts`**: `setActiveDay('FRIDAY')` mengubah penempatan lot; `addBreak('FRIDAY', …)`
  tidak mengubah papan saat `activeDay==='DAY'`, tapi tampil setelah `setActiveDay('FRIDAY')`;
  migrasi state lama (break tanpa `day`) menghasilkan set DAY + FRIDAY.
- Perbarui literal `Break` di test scheduling/grid yang ada agar menyertakan `day`.

---

## 9. Non-Fungsional

- **Kompatibilitas:** state lama (localStorage `shikake-board-v1`) harus tetap terbaca via migrasi (§7).
- **Konsistensi visual:** modal & toggle mengikuti palet papan (hitam/cyan/hijau/kuning).
- **Kesederhanaan:** tidak ada draft-state di modal; edit langsung berlaku (seperti perilaku sekarang).
