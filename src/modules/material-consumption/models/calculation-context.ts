// src/modules/material-consumption/models/calculation-context.ts

/**
 * Контекст, у якому виконується розрахунок Material Flow.
 */
export const CALCULATION_CONTEXTS = {
  PLANNING: 'PLANNING',
  PRODUCTION: 'PRODUCTION',
  ESTIMATION: 'ESTIMATION',
  SIMULATION: 'SIMULATION',
} as const;

export type CalculationContext =
  (typeof CALCULATION_CONTEXTS)[keyof typeof CALCULATION_CONTEXTS];
