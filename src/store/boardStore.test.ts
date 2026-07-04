import { describe, it, expect, beforeEach } from 'vitest';
import { useBoardStore } from './boardStore';

beforeEach(() => {
  localStorage.clear();
  useBoardStore.getState().resetBoard();
});

// DEFAULT_SHIFT starts at 07:00 (420) but has a Dandori block 07:00–07:10
// (420–430), so the first production lot lands at 430.
describe('boardStore', () => {
  it('adds lots and places them after the opening Dandori block', () => {
    useBoardStore.getState().addLots([{ productCode: '2TR', count: 3 }]);
    const lots = useBoardStore.getState().planLots;
    expect(lots).toHaveLength(3);
    expect(lots.map((l) => l.startMin)).toEqual([430, 435, 440]);
  });

  it('records a line stop and shifts affected lots', () => {
    useBoardStore.getState().addLots([{ productCode: '2TR', count: 3 }]);
    // stop 430–440 overlaps the first two lots -> they shift past it
    useBoardStore.getState().addLineStop(430, 440, 'F.Releasing LS Fault');
    const { planLots, lineStops } = useBoardStore.getState();
    expect(lineStops).toHaveLength(1);
    expect(planLots.map((l) => l.startMin)).toEqual([440, 445, 450]);
  });

  it('removing a line stop restores the original schedule', () => {
    useBoardStore.getState().addLots([{ productCode: '2TR', count: 3 }]);
    useBoardStore.getState().addLineStop(430, 440, 'x');
    const id = useBoardStore.getState().lineStops[0].id;
    useBoardStore.getState().removeLineStop(id);
    expect(useBoardStore.getState().planLots.map((l) => l.startMin)).toEqual([430, 435, 440]);
  });
});
