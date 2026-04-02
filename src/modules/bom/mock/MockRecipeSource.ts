import { RecipeSource } from '../RecipeSource';
import { BOMItem } from '../model/bom.model';

export class MockRecipeSource implements RecipeSource {
  private data: Record<string, BOMItem[]> = {
    PLATE_1: [
      { element: 'PLATE_1', material: 'CONCRETE_M300', quantity: 1.2 },
      { element: 'PLATE_1', material: 'REBAR_A500', quantity: 12 },
    ],
    PLATE_2: [
      { element: 'PLATE_2', material: 'CONCRETE_M300', quantity: 1.5 },
      { element: 'PLATE_2', material: 'REBAR_A500', quantity: 15 },
    ],
  };

  getRecipe(element: string): BOMItem[] {
    const recipe = this.data[element];

    if (!recipe) {
      throw new Error(
        `No recipe for element: ${element}. Available: ${Object.keys(this.data).join(', ')}`,
      );
    }

    return recipe;
  }
}

// import { RecipeSource } from '../RecipeSource';
// import { BOMItem } from '../bom.model';

// ===== Mock DB (тимчасово для debug) =====

// Це заміна Google Sheets
// const ELEMENT_RECIPES: Record<string, BOMItem[]> = {
//   PLATE_1: [
//     { element: 'PLATE_1', material: 'CONCRETE_M300', quantity: 1.2 },
//     { element: 'PLATE_1', material: 'REBAR_A500', quantity: 12 },
//   ],
//   PLATE_2: [
//     { element: 'PLATE_2', material: 'CONCRETE_M300', quantity: 1.5 },
//     { element: 'PLATE_2', material: 'REBAR_A500', quantity: 15 },
//   ],
// };

// export class MockRecipeSource implements RecipeSource {
//   private data: Record<string, BOMItem[]> = {
//     PLATE_1: [
//       { element: 'PLATE_1', material: 'CONCRETE_M300', quantity: 1.2 },
//       { element: 'PLATE_1', material: 'REBAR_A500', quantity: 12 },
//     ],
//   };

//   getRecipe(element: string): BOMItem[] {
//     const recipe = this.data[element];

//     if (!recipe) {
//       throw new Error(`No recipe for element: ${element}`);
//     }

//     return recipe;
//   }
// }
