export type ProductCode = '2TR' | '1TR' | 'KAI' | 'CRANK';

export type BreakType =
  | 'DANDORI' | 'WAKOM1' | 'WAKOM2'
  | 'ISTIRAHAT1' | 'ISTIRAHAT' | 'MAGHRIB' | 'CUSTOM';

export type DayType = 'DAY' | 'FRIDAY';

export type LineStopCategory = 'AV' | 'PE' | 'RQ';

export type TeamGroup = 'RED' | 'WHITE';

export interface Range {
  startMin: number;
  endMin: number;
}

export interface Break extends Range {
  id: string;
  type: BreakType;
  label: string;
  day: DayType;
}

export interface ShiftConfig {
  startMin: number;
  endMin: number;
  pic: string;
  shiftNo: number;
  tTimeSec: number;
  breaks: Break[];
  /** Clock time the first lot should be generated from. Defaults to right
   * after Dandori, but is independently editable (e.g. production may be
   * meant to start at a round 07:15 rather than exactly when Dandori ends). */
  productionStartMin: number;
  group: TeamGroup;
}

export interface Product {
  code: ProductCode;
  label: string;
  color: string;
  sandMeasTimeMin: number;
  moldPerBatch: number;
}

export type FurnaceId = 1 | 2 | 3 | 4;

export interface Furnace {
  id: FurnaceId;
  label: string;
  color: string;
}

export interface PlanLot {
  id: string;
  productCode: ProductCode;
  lotNo: number;
  startMin: number;
  endMin: number;
  shifted: boolean;
}

export interface LineStop {
  id: string;
  startMin: number;
  endMin: number;
  durationMin: number;
  keterangan: string;
  counterMeasure: string;
  category: LineStopCategory;
}

export interface LotRequest {
  productCode: ProductCode;
  count: number;
}

export interface PlanningEntry {
  productCode: ProductCode;
  qty: number;
  sandMeasTimeMin: number;
}

export interface PlanningSnapshot {
  id: string;
  at: number;
  entries: PlanningEntry[];
  totalQty: number;
  taktTimeSec: number;
  timeBeginMin: number;
  group: TeamGroup;
  sandPerMixing: number;
}

export interface InformasiNote {
  id: string;
  at: number;
  text: string;
}
