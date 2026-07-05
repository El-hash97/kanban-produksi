import { describe, it, expect, beforeEach } from 'vitest';
import { useBoardStore } from './boardStore';
import { DEFAULT_PRODUCTS, DEFAULT_SHIFT, buildShiftConfig } from '../domain/defaults';

// Full state reset for test isolation. resetBoard() itself intentionally
// leaves shiftConfig (and its breaks) alone — see the dedicated test below —
// so tests use this instead to start every case from a clean shift 1.
beforeEach(() => {
  localStorage.clear();
  useBoardStore.setState({
    shiftConfig: DEFAULT_SHIFT,
    shiftPresets: { [DEFAULT_SHIFT.shiftNo]: DEFAULT_SHIFT },
    products: DEFAULT_PRODUCTS,
    planLots: [],
    lineStops: [],
  });
});

// DEFAULT_SHIFT starts at 07:00 (420) but has a Dandori block 07:00–07:10
// (420–430), so the first production lot lands at 430. Lots then advance on
// a fixed 240s (4min) pitch.
describe('boardStore', () => {
  it('adds lots and places them after the opening Dandori block', () => {
    useBoardStore.getState().addLots([{ productCode: '2TR', count: 3 }]);
    const lots = useBoardStore.getState().planLots;
    expect(lots).toHaveLength(3);
    expect(lots.map((l) => l.startMin)).toEqual([430, 434, 438]);
  });

  it('records a line stop and shifts affected lots', () => {
    useBoardStore.getState().addLots([{ productCode: '2TR', count: 3 }]);
    // stop 430–440 overlaps all three lots (430, 434, 438) -> they shift past it
    useBoardStore.getState().addLineStop(430, 440, 'F.Releasing LS Fault');
    const { planLots, lineStops } = useBoardStore.getState();
    expect(lineStops).toHaveLength(1);
    expect(planLots.map((l) => l.startMin)).toEqual([440, 444, 448]);
  });

  it('removing a line stop restores the original schedule', () => {
    useBoardStore.getState().addLots([{ productCode: '2TR', count: 3 }]);
    useBoardStore.getState().addLineStop(430, 440, 'x');
    const id = useBoardStore.getState().lineStops[0].id;
    useBoardStore.getState().removeLineStop(id);
    expect(useBoardStore.getState().planLots.map((l) => l.startMin)).toEqual([430, 434, 438]);
  });

  it('retagging a lot changes its model and renumbers lots per product', () => {
    useBoardStore.getState().addLots([{ productCode: '2TR', count: 3 }]);
    const [first, second, third] = useBoardStore.getState().planLots;
    useBoardStore.getState().setLotProduct(second.id, 'KAI');
    const lots = useBoardStore.getState().planLots;
    expect(lots.map((l) => `${l.productCode}#${l.lotNo}`)).toEqual([
      `2TR#1`, `KAI#1`, `2TR#2`,
    ]);
    // positions on the board are untouched, only product/lotNo change
    expect(lots.map((l) => l.startMin)).toEqual([first.startMin, second.startMin, third.startMin]);
  });

  it('setLotsProduct retags a whole block of lots at once (bulk drag-select)', () => {
    useBoardStore.getState().addLots([{ productCode: '2TR', count: 4 }]);
    const [first, second, third, fourth] = useBoardStore.getState().planLots;
    useBoardStore.getState().setLotsProduct([second.id, third.id], 'KAI');
    const lots = useBoardStore.getState().planLots;
    expect(lots.map((l) => `${l.productCode}#${l.lotNo}`)).toEqual([
      '2TR#1', 'KAI#1', 'KAI#2', '2TR#2',
    ]);
    // positions on the board are untouched, only product/lotNo change
    expect(lots.map((l) => l.startMin)).toEqual([
      first.startMin, second.startMin, third.startMin, fourth.startMin,
    ]);
  });

  it('adding a break shifts lots scheduled during it', () => {
    useBoardStore.getState().addLots([{ productCode: '2TR', count: 3 }]);
    // lots land at 430, 434, 438; a new break 430-440 pushes all past it
    useBoardStore.getState().addBreak('Wakom-3', 430, 440);
    const { shiftConfig, planLots } = useBoardStore.getState();
    expect(shiftConfig.breaks.some((b) => b.label === 'Wakom-3')).toBe(true);
    expect(planLots.map((l) => l.startMin)).toEqual([440, 444, 448]);
  });

  it('removing a break restores the original schedule', () => {
    useBoardStore.getState().addLots([{ productCode: '2TR', count: 3 }]);
    useBoardStore.getState().addBreak('Wakom-3', 430, 440);
    const brk = useBoardStore.getState().shiftConfig.breaks.find((b) => b.label === 'Wakom-3')!;
    useBoardStore.getState().removeBreak(brk.id);
    const { shiftConfig, planLots } = useBoardStore.getState();
    expect(shiftConfig.breaks.some((b) => b.label === 'Wakom-3')).toBe(false);
    expect(planLots.map((l) => l.startMin)).toEqual([430, 434, 438]);
  });

  it('switching to shift 2 regenerates the window as 19:00-07:00 and clears the board', () => {
    useBoardStore.getState().addLots([{ productCode: '2TR', count: 3 }]);
    useBoardStore.getState().addLineStop(430, 440, 'x');
    useBoardStore.getState().setShiftNo(2);
    const { shiftConfig, planLots, lineStops } = useBoardStore.getState();
    expect(shiftConfig.shiftNo).toBe(2);
    expect(shiftConfig.startMin).toBe(1140);
    expect(shiftConfig.endMin).toBe(1860);
    expect(planLots).toHaveLength(0);
    expect(lineStops).toHaveLength(0);
  });

  it('switching shift is a no-op when already on that shift', () => {
    useBoardStore.getState().addLots([{ productCode: '2TR', count: 3 }]);
    useBoardStore.getState().setShiftNo(1);
    expect(useBoardStore.getState().planLots).toHaveLength(3);
  });

  it('resetBoard clears lots/line stops but leaves shift settings and custom breaks alone', () => {
    useBoardStore.getState().setShiftNo(2);
    useBoardStore.getState().addLots([{ productCode: '2TR', count: 3 }]);
    useBoardStore.getState().addLineStop(1200, 1210, 'x');
    useBoardStore.getState().addBreak('Wakom-3', 1500, 1505);

    useBoardStore.getState().resetBoard();

    const { shiftConfig, planLots, lineStops } = useBoardStore.getState();
    expect(planLots).toHaveLength(0);
    expect(lineStops).toHaveLength(0);
    expect(shiftConfig.shiftNo).toBe(2);
    expect(shiftConfig.startMin).toBe(1140);
    expect(shiftConfig.breaks.some((b) => b.label === 'Wakom-3')).toBe(true);
  });

  it('a break added to shift 1 survives switching to shift 2 and back', () => {
    useBoardStore.getState().addBreak('Wakom-3', 500, 505);
    useBoardStore.getState().setShiftNo(2);
    useBoardStore.getState().setShiftNo(1);

    const { shiftConfig } = useBoardStore.getState();
    expect(shiftConfig.shiftNo).toBe(1);
    expect(shiftConfig.breaks.some((b) => b.label === 'Wakom-3')).toBe(true);
  });

  it('Dandori cannot be removed, so generated lots always start after it', () => {
    const dandori = useBoardStore.getState().shiftConfig.breaks.find((b) => b.type === 'DANDORI')!;
    useBoardStore.getState().removeBreak(dandori.id);

    const { shiftConfig } = useBoardStore.getState();
    expect(shiftConfig.breaks.some((b) => b.type === 'DANDORI')).toBe(true);

    useBoardStore.getState().addLots([{ productCode: '2TR', count: 1 }]);
    expect(useBoardStore.getState().planLots[0].startMin).toBe(430); // after 420-430 Dandori
  });

  it('updateBreak edits a break\'s time (Dandori included) and reflows lots', () => {
    const dandori = useBoardStore.getState().shiftConfig.breaks.find((b) => b.type === 'DANDORI')!;
    // stretch Dandori from 07:00-07:10 to 07:00-07:20
    useBoardStore.getState().updateBreak(dandori.id, 420, 440);

    const { shiftConfig } = useBoardStore.getState();
    const updated = shiftConfig.breaks.find((b) => b.id === dandori.id)!;
    expect(updated.startMin).toBe(420);
    expect(updated.endMin).toBe(440);

    useBoardStore.getState().addLots([{ productCode: '2TR', count: 1 }]);
    expect(useBoardStore.getState().planLots[0].startMin).toBe(440); // after the widened Dandori
  });

  it('setProductionStart moves where the first lot lands and reflows existing lots', () => {
    useBoardStore.getState().addLots([{ productCode: '2TR', count: 2 }]);
    expect(useBoardStore.getState().planLots.map((l) => l.startMin)).toEqual([430, 434]);

    // production is meant to start at a round 07:15 instead of right at 07:10
    useBoardStore.getState().setProductionStart(435);
    expect(useBoardStore.getState().shiftConfig.productionStartMin).toBe(435);
    expect(useBoardStore.getState().planLots.map((l) => l.startMin)).toEqual([435, 439]);
  });

  it('setProductionStart still respects Dandori if set earlier than Dandori ends', () => {
    useBoardStore.getState().setProductionStart(421); // Dandori runs 420-430
    useBoardStore.getState().addLots([{ productCode: '2TR', count: 1 }]);
    expect(useBoardStore.getState().planLots[0].startMin).toBe(430);
  });

  it('repairs a legacy shift preset that is missing Dandori when switched to', () => {
    // simulate state persisted from before Dandori became mandatory, where
    // shift 2's saved preset never had a Dandori break at all
    const shift2 = buildShiftConfig(2);
    const corrupted = { ...shift2, breaks: shift2.breaks.filter((b) => b.type !== 'DANDORI') };
    useBoardStore.setState({ shiftPresets: { 1: DEFAULT_SHIFT, 2: corrupted } });

    useBoardStore.getState().setShiftNo(2);
    const { shiftConfig } = useBoardStore.getState();
    expect(shiftConfig.breaks.some((b) => b.type === 'DANDORI')).toBe(true);

    useBoardStore.getState().addLots([{ productCode: '2TR', count: 1 }]);
    expect(useBoardStore.getState().planLots[0].startMin).toBe(1150); // after 1140-1150 Dandori
  });

  it('each shift keeps its own independently-customized breaks', () => {
    useBoardStore.getState().addBreak('Shift1-Only', 500, 505);
    useBoardStore.getState().setShiftNo(2);
    useBoardStore.getState().addBreak('Shift2-Only', 1500, 1505);

    const shift2 = useBoardStore.getState().shiftConfig;
    expect(shift2.breaks.some((b) => b.label === 'Shift1-Only')).toBe(false);
    expect(shift2.breaks.some((b) => b.label === 'Shift2-Only')).toBe(true);

    useBoardStore.getState().setShiftNo(1);
    const shift1 = useBoardStore.getState().shiftConfig;
    expect(shift1.breaks.some((b) => b.label === 'Shift1-Only')).toBe(true);
    expect(shift1.breaks.some((b) => b.label === 'Shift2-Only')).toBe(false);
  });
});
