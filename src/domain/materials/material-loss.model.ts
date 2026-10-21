import type { MaterialCategory } from '../../config/config';

export interface MaterialLossGroup {
  readonly code: 'REBAR' | 'ROLLED' | 'CONCRETE';
  readonly categories: readonly MaterialCategory[];
}

export interface MaterialLossNorm {
  readonly group: MaterialLossGroup['code'];
  readonly lossPercent: number;
}

export interface MaterialLossPercents {
  readonly rebar: number;
  readonly rolled: number;
  readonly concrete: number;
}

/** Reporting output, deliberately distinct from a clean MaterialRequirement. */
export interface MaterialLossResult {
  readonly stage: 'LOSSES_APPLIED';
  readonly materialId: string;
  readonly unit: string;
  readonly group: MaterialLossGroup['code'];
  readonly baseQty: number;
  readonly lossPercent: number;
  readonly lossQty: number;
  readonly totalQty: number;
}
