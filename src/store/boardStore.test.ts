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
    furnaceOverrides: {},
    activeDay: 'DAY',
    planningHistory: [],
    informasiLog: [],
    sandPerMixing: 2700,
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
    // stop 430–440 overlaps all three lots (430, 434, 438); lot1's natural
    // slot (430) is exactly the stop's own start (full gap already banked),
    // so they resume right at the stop's end, 440.
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
    // lots land at 430, 434, 438; a new break 430-440 covers lot1's natural
    // slot exactly at its own start (full gap already banked), so they
    // resume right at the break's end, 440.
    useBoardStore.getState().addBreak('DAY', 'Wakom-3', 430, 440);
    const { shiftConfig, planLots } = useBoardStore.getState();
    expect(shiftConfig.breaks.some((b) => b.label === 'Wakom-3')).toBe(true);
    expect(planLots.map((l) => l.startMin)).toEqual([440, 444, 448]);
  });

  it('removing a break restores the original schedule', () => {
    useBoardStore.getState().addLots([{ productCode: '2TR', count: 3 }]);
    useBoardStore.getState().addBreak('DAY', 'Wakom-3', 430, 440);
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
    useBoardStore.getState().addBreak('DAY', 'Wakom-3', 1500, 1505);

    useBoardStore.getState().resetBoard();

    const { shiftConfig, planLots, lineStops } = useBoardStore.getState();
    expect(planLots).toHaveLength(0);
    expect(lineStops).toHaveLength(0);
    expect(shiftConfig.shiftNo).toBe(2);
    expect(shiftConfig.startMin).toBe(1140);
    expect(shiftConfig.breaks.some((b) => b.label === 'Wakom-3')).toBe(true);
  });

  it('a break added to shift 1 survives switching to shift 2 and back', () => {
    useBoardStore.getState().addBreak('DAY', 'Wakom-3', 500, 505);
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
    // This is the very first lot, so its candidate (productionStartMin=430)
    // already sits 10 minutes inside the widened Dandori (420-440, duration
    // 20) with no earlier lot to have banked any gap — it resumes 20 minutes
    // past that candidate, at 450.
    expect(useBoardStore.getState().planLots[0].startMin).toBe(450);
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
    // First lot, candidate 421 sits 1 minute inside Dandori (duration 10)
    // with no earlier lot to have banked any gap — resumes at 421+10=431.
    expect(useBoardStore.getState().planLots[0].startMin).toBe(431);
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
    useBoardStore.getState().addBreak('DAY', 'Shift1-Only', 500, 505);
    useBoardStore.getState().setShiftNo(2);
    useBoardStore.getState().addBreak('DAY', 'Shift2-Only', 1500, 1505);

    const shift2 = useBoardStore.getState().shiftConfig;
    expect(shift2.breaks.some((b) => b.label === 'Shift1-Only')).toBe(false);
    expect(shift2.breaks.some((b) => b.label === 'Shift2-Only')).toBe(true);

    useBoardStore.getState().setShiftNo(1);
    const shift1 = useBoardStore.getState().shiftConfig;
    expect(shift1.breaks.some((b) => b.label === 'Shift1-Only')).toBe(true);
    expect(shift1.breaks.some((b) => b.label === 'Shift2-Only')).toBe(false);
  });

  it('setTappingFurnaceOverride records a manual furnace reassignment by tap id', () => {
    useBoardStore.getState().setTappingFurnaceOverride('tap-lot-1', 3);
    expect(useBoardStore.getState().furnaceOverrides).toEqual({ 'tap-lot-1': 3 });
  });

  it('setTappingFurnaceOverride overwrites a previous override for the same tap id', () => {
    useBoardStore.getState().setTappingFurnaceOverride('tap-lot-1', 3);
    useBoardStore.getState().setTappingFurnaceOverride('tap-lot-1', 4);
    expect(useBoardStore.getState().furnaceOverrides).toEqual({ 'tap-lot-1': 4 });
  });

  it('resetBoard clears furnace overrides along with lots/line stops', () => {
    useBoardStore.getState().setTappingFurnaceOverride('tap-lot-1', 3);
    useBoardStore.getState().resetBoard();
    expect(useBoardStore.getState().furnaceOverrides).toEqual({});
  });

  it('switching shift clears furnace overrides (tied to that shift\'s lots)', () => {
    useBoardStore.getState().setTappingFurnaceOverride('tap-lot-1', 3);
    useBoardStore.getState().setShiftNo(2);
    expect(useBoardStore.getState().furnaceOverrides).toEqual({});
  });

  it('setActiveDay reflows lots around that day\'s breaks', () => {
    // FRIDAY's main Istirahat is longer; place enough lots to reach it and
    // confirm switching days changes the schedule tail.
    useBoardStore.getState().addLots([{ productCode: '2TR', count: 120 }]);
    const dayEnds = useBoardStore.getState().planLots.at(-1)!.startMin;
    useBoardStore.getState().setActiveDay('FRIDAY');
    expect(useBoardStore.getState().activeDay).toBe('FRIDAY');
    const friEnds = useBoardStore.getState().planLots.at(-1)!.startMin;
    expect(friEnds).toBeGreaterThan(dayEnds); // longer Friday break pushes the tail later
  });

  it('adding a FRIDAY break does not move the board while DAY is active', () => {
    useBoardStore.getState().addLots([{ productCode: '2TR', count: 3 }]);
    const before = useBoardStore.getState().planLots.map((l) => l.startMin);
    useBoardStore.getState().addBreak('FRIDAY', 'F-only', 430, 460);
    expect(useBoardStore.getState().planLots.map((l) => l.startMin)).toEqual(before);
    // but it applies once FRIDAY is active
    useBoardStore.getState().setActiveDay('FRIDAY');
    expect(useBoardStore.getState().planLots[0].startMin).toBeGreaterThanOrEqual(460);
  });

  it('setPic updates the PIC name for the active shift', () => {
    useBoardStore.getState().setPic('Rudi');
    expect(useBoardStore.getState().shiftConfig.pic).toBe('Rudi');
  });

  it('setGroup updates the team group for the active shift', () => {
    useBoardStore.getState().setGroup('BLUE');
    expect(useBoardStore.getState().shiftConfig.group).toBe('BLUE');
  });

  it('setSandPerMixing updates the sand-per-mixing setting', () => {
    useBoardStore.getState().setSandPerMixing(3000);
    expect(useBoardStore.getState().sandPerMixing).toBe(3000);
  });

  it('addInformasi records a note with the newest first', () => {
    useBoardStore.getState().addInformasi('Mesin A maintenance');
    useBoardStore.getState().addInformasi('Ganti sand hopper');
    const log = useBoardStore.getState().informasiLog;
    expect(log.map((n) => n.text)).toEqual(['Ganti sand hopper', 'Mesin A maintenance']);
  });

  it('logPlanningSnapshot records a planning entry with the newest first', () => {
    useBoardStore.getState().logPlanningSnapshot(
      [{ productCode: '2TR', qty: 10, sandMeasTimeMin: 9.5 }],
      'RED',
      430,
    );
    const [snap] = useBoardStore.getState().planningHistory;
    expect(snap.totalQty).toBe(10);
    expect(snap.group).toBe('RED');
    expect(snap.timeBeginMin).toBe(430);
  });

  it('addLineStop stores counterMeasure and category when given', () => {
    useBoardStore.getState().addLineStop(430, 440, 'Sand jam', 'Bersihkan hopper', 'AV');
    const stop = useBoardStore.getState().lineStops[0];
    expect(stop.counterMeasure).toBe('Bersihkan hopper');
    expect(stop.category).toBe('AV');
  });

  it('addLineStop defaults counterMeasure/category when omitted (legacy callers)', () => {
    useBoardStore.getState().addLineStop(430, 440, 'Sand jam');
    const stop = useBoardStore.getState().lineStops[0];
    expect(stop.counterMeasure).toBe('');
    expect(stop.category).toBe('AV');
  });

  it('updateLineStop preserves counterMeasure/category when only editing time/problem', () => {
    useBoardStore.getState().addLineStop(430, 440, 'Sand jam', 'Bersihkan hopper', 'PE');
    const id = useBoardStore.getState().lineStops[0].id;
    useBoardStore.getState().updateLineStop(id, 430, 445, 'Sand jam parah');
    const stop = useBoardStore.getState().lineStops[0];
    expect(stop.counterMeasure).toBe('Bersihkan hopper');
    expect(stop.category).toBe('PE');
    expect(stop.endMin).toBe(445);
  });

  describe('applyPlanningTargets', () => {
    it('grows a product already on the board, keeping a later untouched product\'s order', () => {
      useBoardStore.getState().addLots([
        { productCode: '2TR', count: 2 }, { productCode: 'CRANK', count: 2 },
      ]);
      useBoardStore.getState().applyPlanningTargets([{ productCode: '2TR', qty: 4 }]);
      const lots = useBoardStore.getState().planLots;
      expect(lots.map((l) => `${l.productCode}#${l.lotNo}`)).toEqual([
        '2TR#1', '2TR#2', '2TR#3', '2TR#4', 'CRANK#1', 'CRANK#2',
      ]);
    });

    it('shrinks a product by dropping its highest-numbered lots', () => {
      useBoardStore.getState().addLots([{ productCode: '2TR', count: 4 }]);
      useBoardStore.getState().applyPlanningTargets([{ productCode: '2TR', qty: 2 }]);
      const lots = useBoardStore.getState().planLots;
      expect(lots.map((l) => l.lotNo)).toEqual([1, 2]);
    });

    it('leaves an earlier untouched product\'s lot positions unchanged', () => {
      useBoardStore.getState().addLots([
        { productCode: '2TR', count: 2 }, { productCode: 'CRANK', count: 2 },
      ]);
      const before = useBoardStore.getState().planLots
        .filter((l) => l.productCode === '2TR').map((l) => l.startMin);
      useBoardStore.getState().applyPlanningTargets([{ productCode: 'CRANK', qty: 3 }]);
      const after = useBoardStore.getState().planLots
        .filter((l) => l.productCode === '2TR').map((l) => l.startMin);
      expect(after).toEqual(before);
    });
  });
});
