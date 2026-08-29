// src/modules/material-consumption/models/material-unit.ts

export const MATERIAL_UNITS = {
  KG: 'кг',
  M3: 'м3',
} as const;

export type MaterialUnit = (typeof MATERIAL_UNITS)[keyof typeof MATERIAL_UNITS];

export function isMaterialUnit(
  value: string | undefined,
): value is MaterialUnit {
  return value === MATERIAL_UNITS.KG || value === MATERIAL_UNITS.M3;
}
