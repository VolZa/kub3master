import { BOMItem } from './model/bom.model';
export interface RecipeSource {
  getRecipe(element: string): BOMItem[];
}
