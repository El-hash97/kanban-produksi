export type ProductCode = '2TR' | '1TR' | 'KAI' | 'CRANK';

export type BreakType =
  | 'DANDORI' | 'WAKOM1' | 'WAKOM2'
  | 'ISTIRAHAT1' | 'ISTIRAHAT' | 'MAGHRIB' | 'CUSTOM';

export interface Range {
  startMin: number;
  endMin: number;
}

export interface Break extends Range {
  id: string;
  type: BreakType;
  label: string;
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
}

export interface Product {
  code: ProductCode;
  label: string;
  color: string;
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
}

export interface LotRequest {
  productCode: ProductCode;
  count: number;
}
