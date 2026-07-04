export const SheetKey = {
  CATALOG: 'CATALOG',
  MATERIAL_BATCHES: 'MATERIAL_BATCHES',
  MATERIALS: 'MATERIALS',
} as const;

export type SheetKey = (typeof SheetKey)[keyof typeof SheetKey];
