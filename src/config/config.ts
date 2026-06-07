export const STEEL_DENSITY = 7850;

// ------------------ TYPES ------------------

export const ELEMENT_TYPES = {
  PRODUCT: 'product',
  ASSEMBLY: 'assembly',
  MATERIAL: 'material',
  PART: 'part',
} as const;

export type ElementType = (typeof ELEMENT_TYPES)[keyof typeof ELEMENT_TYPES];

// ------------------ MATERIAL ------------------

export const MATERIAL_CATEGORIES = {
  REBAR: 'rebar',
  CONCRETE: 'concrete',
  STEEL: 'steel',
} as const;

export type MaterialCategory =
  (typeof MATERIAL_CATEGORIES)[keyof typeof MATERIAL_CATEGORIES];

// ------------------ PROFILE ------------------

export const PROFILE_TYPES = {
  REBAR: 'rebar',
  PLATE: 'plate',
  ANGLE: 'angle',
  CHANNEL: 'channel',
  IBEAM: 'ibeam',
  PIPE_ROUND: 'pipe_round',
  PIPE_SQUARE: 'pipe_square',
  CONCRETE: 'concrete',
} as const;

export type ProfileType = (typeof PROFILE_TYPES)[keyof typeof PROFILE_TYPES];

// ------------------ PRODUCT ------------------

export const PRODUCT_TYPES = {
  COLUMN: 'column',
  BEAM: 'beam',
  SLAB: 'slab',
  BLOCK: 'block',
} as const;

export type ProductType = (typeof PRODUCT_TYPES)[keyof typeof PRODUCT_TYPES];

// ------------------ PRODUCTION ------------------
export const PRODUCTION_TYPES = {
  BEND: 'bend',
  CUT: 'cut',
  FORM: 'form',
  MIX: 'mix',
  RAW: 'raw',
  TIE: 'tie',
  WELD: 'weld',
  // 🔥 ДОДАТИ
  PURCHASED: 'purchased',
  PRODUCED: 'produced',
} as const;

export type ProductionType =
  (typeof PRODUCTION_TYPES)[keyof typeof PRODUCTION_TYPES];
// ------------------ ID ------------------

export type IdRange = [number, number];

export const ID_RANGES: Record<ElementType, IdRange> = {
  product: [1000, 1999],
  assembly: [2000, 2999],
  material: [3000, 3999],
  part: [4000, 5999],
};
