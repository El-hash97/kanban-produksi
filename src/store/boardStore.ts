import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  LineStop, LotRequest, PlanLot, Product, ProductCode, ShiftConfig,
} from '../domain/types';
import { DEFAULT_PRODUCTS, DEFAULT_SHIFT } from '../domain/defaults';
import { applyLineStops, autoPlaceLots, makeLineStop } from '../lib/scheduling';

interface BoardState {
  shiftConfig: ShiftConfig;
  products: Product[];
  planLots: PlanLot[];
  lineStops: LineStop[];
  addLots: (requests: LotRequest[]) => void;
  addLineStop: (startMin: number, endMin: number, keterangan: string) => void;
  removeLineStop: (id: string) => void;
  resetBoard: () => void;
}

function recount(planLots: PlanLot[]): LotRequest[] {
  const counts = new Map<ProductCode, number>();
  for (const l of planLots) counts.set(l.productCode, (counts.get(l.productCode) ?? 0) + 1);
  return [...counts.entries()].map(([productCode, count]) => ({ productCode, count }));
}

export const useBoardStore = create<BoardState>()(
  persist(
    (set, get) => ({
      shiftConfig: DEFAULT_SHIFT,
      products: DEFAULT_PRODUCTS,
      planLots: [],
      lineStops: [],

      addLots: (requests) => {
        const { shiftConfig, planLots, lineStops } = get();
        const existing = recount(planLots);
        const merged = [...existing, ...requests];
        const placed = autoPlaceLots(merged, shiftConfig);
        set({ planLots: applyLineStops(placed, shiftConfig, lineStops) });
      },

      addLineStop: (startMin, endMin, keterangan) => {
        const { shiftConfig, planLots, lineStops } = get();
        const stop = makeLineStop(startMin, endMin, keterangan);
        const nextStops = [...lineStops, stop];
        set({
          lineStops: nextStops,
          planLots: applyLineStops(planLots, shiftConfig, nextStops),
        });
      },

      removeLineStop: (id) => {
        const { shiftConfig, planLots, lineStops } = get();
        const nextStops = lineStops.filter((s) => s.id !== id);
        set({
          lineStops: nextStops,
          planLots: applyLineStops(planLots, shiftConfig, nextStops),
        });
      },

      resetBoard: () =>
        set({
          shiftConfig: DEFAULT_SHIFT,
          products: DEFAULT_PRODUCTS,
          planLots: [],
          lineStops: [],
        }),
    }),
    { name: 'shikake-board-v1' },
  ),
);
