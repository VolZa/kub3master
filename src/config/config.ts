export const STEEL_DENSITY = 7850;

export const ELEMENT_TYPES = {
  PRODUCT: 'product',
  ASSEMBLY: 'assembly',
  MATERIAL: 'material',
  PART: 'part',
} as const;

export const ID_RANGES: Record<ElementType, IdRange> = {
  product: [1000, 1999],
  assembly: [2000, 2999],
  material: [3000, 3999],
  part: [4000, 9999],
};

export type ElementType = (typeof ELEMENT_TYPES)[keyof typeof ELEMENT_TYPES];

export type IdRange = [number, number];
