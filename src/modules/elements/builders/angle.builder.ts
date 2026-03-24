import { ParsedSpec } from '../../bom/bom.parser';
// export function buildAngle(parsed: ParsedSpec) {
//   const code = `A_${parsed.width}_${parsed.thickness}_${parsed.length}`;

//   const name = `Кутник ${parsed.width}x${parsed.thickness} L=${parsed.length}`;

//   return {
//     code,
//     name,
//     type: 'part',
//     category: 'angle',
//     unit: 'шт',
//   };
// }

export function buildAngle(parsed: ParsedSpec) {
  return {
    code: `A_${parsed.width}_${parsed.thickness}_${parsed.length}`,
    name: `Кутник ${parsed.width}x${parsed.thickness} L=${parsed.length}`,
    type: 'part',
    category: 'angle',
    baseUnit: 'шт', // ⚠️ потім можна м або кг
  };
}
