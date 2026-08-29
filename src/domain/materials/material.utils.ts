// src\domain\materials\material.utils.ts
import { MaterialCategory } from '../../config/config';

const UNIT_BY_CATEGORY: Record<MaterialCategory, string> = {
  rebar: 'кг',
  wire: 'кг',
  plate: 'кг',
  angle: 'кг',
  pipe: 'кг',
  beam: 'кг',
  channel: 'кг',
  concrete_mix: 'м3',
  cement: 'кг',
};

export function getMaterialUnit(category: MaterialCategory): string {
  return UNIT_BY_CATEGORY[category];
}
