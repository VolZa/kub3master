import { MaterialCategory } from '../../config/config';

const UNIT_BY_CATEGORY: Record<MaterialCategory, string> = {
  rebar: 'кг',
  wire: 'кг',
  steel: 'кг',
  concrete_mix: 'л',
  cement: 'кг',
  other: 'кг',
};

export function getMaterialUnit(category: MaterialCategory): string {
  return UNIT_BY_CATEGORY[category];
}
