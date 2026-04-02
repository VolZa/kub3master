import { ParsedSpec } from '../../bom/model/parsed-spec.model';

export function buildRebar(parsed: ParsedSpec) {
  if (parsed.kind !== 'rebar') {
    throw new Error('Invalid spec for rebar builder');
  }

  const code = `${parsed.diameter}_${parsed.className ?? ''}_${parsed.length ?? ''}`;

  return {
    code,
    name: `Арматура Ø${parsed.diameter} ${parsed.className ?? ''} L=${parsed.length ?? ''}`,
    type: 'REBAR',
    category: 'metal',
    baseUnit: 'kg',

    diameter: parsed.diameter,
    length: parsed.length,
  };
}
// export function buildRebar(parsed: ParsedSpec) {
//   const code = `R_${parsed.diameter}_${parsed.class}_${parsed.length}`;

//   return {
//     code,
//     name: `Арматура Ø${parsed.diameter} ${parsed.class} L=${parsed.length}`,
//     type: 'part',
//     category: 'rebar',
//     baseUnit: 'шт', // 🔥 поки так
//   };
// }
