import type { Break, Product, ShiftConfig } from './types';

export const LOT_MIN = 5;

const h = (hh: number, mm = 0) => hh * 60 + mm;

const DEFAULT_BREAKS: Break[] = [
  { type: 'DANDORI', label: 'Dandori', startMin: h(7), endMin: h(7, 10) },
  { type: 'WAKOM1', label: 'Wakom-1', startMin: h(10), endMin: h(10, 5) },
  { type: 'ISTIRAHAT1', label: 'Istirahat-1', startMin: h(11), endMin: h(11, 15) },
  { type: 'ISTIRAHAT', label: 'Istirahat', startMin: h(12), endMin: h(12, 45) },
  { type: 'WAKOM2', label: 'Wakom-2', startMin: h(14), endMin: h(14, 5) },
  { type: 'MAGHRIB', label: 'Istirahat Maghrib', startMin: h(18), endMin: h(18, 15) },
];

export const DEFAULT_SHIFT: ShiftConfig = {
  startMin: h(7),
  endMin: h(19),
  pic: 'Bernad',
  shiftNo: 1,
  tTimeSec: 48,
  breaks: DEFAULT_BREAKS,
};

export const DEFAULT_PRODUCTS: Product[] = [
  { code: '2TR', label: 'B/C 2TR', color: '#3b82f6' },
  { code: '1TR', label: 'B/C 1TR', color: '#d946ef' },
  { code: 'KAI', label: 'TR-KAI', color: '#f59e0b' },
  { code: 'CRANK', label: 'CRANK', color: '#22c55e' },
];
