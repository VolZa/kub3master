export const SheetKey = {
  CATALOG: 'CATALOG',
  MATERIAL_BATCHES: 'MATERIAL_BATCHES',
  MATERIALS: 'MATERIALS',
  PLACEMENT: 'PLACEMENT',
  SHIFT_PLANS: 'SHIFT_PLANS',
  SHIFT_PLAN_ITEMS: 'SHIFT_PLAN_ITEMS',
  PRODUCTION: 'PRODUCTION',
} as const;

export type SheetKey = (typeof SheetKey)[keyof typeof SheetKey];
