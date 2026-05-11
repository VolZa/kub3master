import { MaterialCategory } from './material.model';

const UNIT_BY_CATEGORY: Record<MaterialCategory, string> = {
  rebar: 'кг',
  steel: 'кг',
  concrete: 'л',
  other: 'кг',
};

export function getMaterialUnit(category: MaterialCategory): string {
  return UNIT_BY_CATEGORY[category];
}
