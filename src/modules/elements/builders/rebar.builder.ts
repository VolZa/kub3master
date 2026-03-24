import { ParsedSpec } from '../../bom/bom.parser';

export function buildRebar(parsed: ParsedSpec) {
  const code = `R_${parsed.diameter}_${parsed.class}_${parsed.length}`;

  return {
    code,
    name: `Арматура Ø${parsed.diameter} ${parsed.class} L=${parsed.length}`,
    type: 'part',
    category: 'rebar',
    baseUnit: 'шт', // 🔥 поки так
  };
}
