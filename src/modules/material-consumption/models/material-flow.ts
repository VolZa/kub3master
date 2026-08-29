// src/modules/material-consumption/models/material-flow.ts

import { MaterialFlowEvent } from './material-flow-event';

/**
 * Результат роботи MaterialConsumptionEngine.
 *
 * Містить послідовність подій Material Flow.
 */
export type MaterialFlow = MaterialFlowEvent[];
