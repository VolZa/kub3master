import { ParsedSpec } from '../../bom/model/parsed-spec.model';
import { BuiltElement } from '../element.builder';
import { ELEMENT_TYPES } from '../../../config/config';

export function buildRebar(parsed: ParsedSpec): BuiltElement {
  if (parsed.kind !== 'rebar') {
    throw new Error('Invalid spec for rebar builder');
  }

  const { diameter, className, length } = parsed;

  // 🔥 code (чистий)
  const code = ['R', diameter, className ?? '', length ? `L${length}` : '']
    .filter(Boolean)
    .join('_');

  // 🔥 name (людський)
  const nameParts = [`Арматура Ø${diameter}`];

  if (className) nameParts.push(className);
  if (length) nameParts.push(`L=${length}`);

  const name = nameParts.join(' ');

  return {
    code,
    name,
    type: ELEMENT_TYPES.PART, // ✔ строго типізовано
    category: 'rebar',
    baseUnit: 'шт', // 🔥 ВАЖЛИВО
    className,

    diameter,
    length,
  };
}
// import { ELEMENT_TYPES } from '../../../config/config';
// import { ParsedSpec } from '../../bom/model/parsed-spec.model';

// export function buildRebar(parsed: ParsedSpec) {
//   if (parsed.kind !== 'rebar') {
//     throw new Error('Invalid spec for rebar builder');
//   }

//   const code = `${parsed.diameter}_${parsed.className ?? ''}_${parsed.length ?? ''}`;

//   return {
//     code,
//     name: `Арматура Ø${parsed.diameter} ${parsed.className ?? ''} L=${parsed.length ?? ''}`,
//     type: ELEMENT_TYPES.PART,
//     category: 'metal',
//     baseUnit: 'kg',

//     diameter: parsed.diameter,
//     length: parsed.length,
//   };
// }
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
