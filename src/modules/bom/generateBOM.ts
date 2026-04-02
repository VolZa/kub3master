import { RecipeSource } from './RecipeSource';
import { BOMItem, BOMInput, BOMResult } from './model/bom.model';

// ===== Core Logic =====

export function generateBOM(input: BOMInput, source: RecipeSource): BOMResult {
  const result: BOMItem[] = [];

  for (const element of input.elements) {
    const recipe = source.getRecipe(element);

    for (const item of recipe) {
      result.push(item); // ← спростили
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
    const existing = map.get(item.material);

    if (existing) {
      existing.quantity += item.quantity;
    } else {
      map.set(item.material, { ...item });
    }
  }

  return Array.from(map.values());
}
