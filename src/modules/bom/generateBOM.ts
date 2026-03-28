// ===== Types =====

export type BOMInput = {
  houseId: string;
  elements: string[];
};

export type BOMItem = {
  element: string;
  material: string;
  quantity: number;
};

export type BOMResult = {
  items: BOMItem[];
};

// ===== Mock DB (тимчасово для debug) =====

// Це заміна Google Sheets
const ELEMENT_RECIPES: Record<string, BOMItem[]> = {
  PLATE_1: [
    { element: 'PLATE_1', material: 'CONCRETE_M300', quantity: 1.2 },
    { element: 'PLATE_1', material: 'REBAR_A500', quantity: 12 },
  ],
  PLATE_2: [
    { element: 'PLATE_2', material: 'CONCRETE_M300', quantity: 1.5 },
    { element: 'PLATE_2', material: 'REBAR_A500', quantity: 15 },
  ],
};

// ===== Core Logic =====

export function generateBOM(input: BOMInput): BOMResult {
  const result: BOMItem[] = [];

  for (const element of input.elements) {
    const recipe = ELEMENT_RECIPES[element];

    if (!recipe) {
      throw new Error(`No recipe for element: ${element}`);
    }

    for (const item of recipe) {
      result.push({
        ...item,
      });
    }
  }

  return {
    items: aggregate(result),
  };
}

// ===== Helpers =====

function aggregate(items: BOMItem[]): BOMItem[] {
  const map = new Map<string, BOMItem>();

  for (const item of items) {
    const key = item.material;

    if (!map.has(key)) {
      map.set(key, { ...item });
    } else {
      const existing = map.get(key)!;
      existing.quantity += item.quantity;
    }
  }

  return Array.from(map.values());
}
