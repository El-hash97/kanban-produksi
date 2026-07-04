export type ProductCode = '2TR' | '1TR' | 'KAI' | 'CRANK';

export type BreakType =
  | 'DANDORI' | 'WAKOM1' | 'WAKOM2'
  | 'ISTIRAHAT1' | 'ISTIRAHAT' | 'MAGHRIB';

export interface Range {
  startMin: number;
  endMin: number;
}

export interface Break extends Range {
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
}

export interface Product {
  code: ProductCode;
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
