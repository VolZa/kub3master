export const SheetKey = {
  CATALOG: 'CATALOG',
  MATERIAL_BATCHES: 'MATERIAL_BATCHES',
  MATERIALS: 'MATERIALS',
  PLACEMENT: 'PLACEMENT',
} as const;

export type SheetKey = (typeof SheetKey)[keyof typeof SheetKey];
