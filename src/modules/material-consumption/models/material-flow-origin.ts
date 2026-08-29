// src/modules/material-consumption/models/material-flow-origin.ts

/**
 * Походження Material Flow Event.
 */
export const MATERIAL_FLOW_ORIGINS = {
  BOM: 'BOM',
  MANUAL: 'MANUAL',
  IMPORT: 'IMPORT',
  CORRECTION: 'CORRECTION',
} as const;

export type MaterialFlowOriginType =
  (typeof MATERIAL_FLOW_ORIGINS)[keyof typeof MATERIAL_FLOW_ORIGINS];
