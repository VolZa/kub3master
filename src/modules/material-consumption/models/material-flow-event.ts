// src/modules/material-consumption/models/material-flow-event.ts

import { CalculationContext } from './calculation-context';
import { MaterialFlowOriginType } from './material-flow-origin';
import { MaterialUnit } from './material-unit';

/**
 * Окрема подія руху матеріалу,
 * сформована MaterialConsumptionEngine.
 */
export interface MaterialFlowEvent {
  context: CalculationContext;

  originType: MaterialFlowOriginType;
  originId: string;

  productId: string;
  materialId: string;

  quantity: number;
  unit: MaterialUnit;
}
