import { ParsedSpec } from '../../bom/bom.parser';

export function buildPlate(parsed: ParsedSpec) {
  return {
    code: `P_${parsed.width}_${parsed.thickness}_${parsed.length}`,
    name: `Полоса ${parsed.width}x${parsed.thickness} L=${parsed.length}`,
    type: 'part',
    category: 'plate',
    baseUnit: 'шт',
  };
}
