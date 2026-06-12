import { ParsedSpec } from '../../bom/model/parsed-spec.model';
import { BuiltElement } from '../element.builder';
import { ELEMENT_TYPES } from '../../../config/config';
import { buildName } from './name.builder';

export function buildRebar(parsed: ParsedSpec): BuiltElement {
  if (parsed.kind !== 'rebar') {
    throw new Error('Invalid spec for rebar builder');
  }

  const { diameter, className, length } = parsed;

  const code = ['R', diameter, className ?? '', length ? `L${length}` : '']
    .filter(Boolean)
    .join('_');

  const rawCode = `Ø${diameter} ${className ?? ''}`.trim();

  const name = buildName('Арматура', rawCode, {
    length,
  });

  return {
    code,
    prefixName: 'арматура', // 🔥 для Catalog
    name,
    // baseUnit: 'шт',

    // type: 'part',
    category: 'rebar', // 🔥 ДОДАТИ

    diameter,
    length,
    className,

    profileType: 'round', // 🔥 для матеріалу
  };
  // return {
  //   code,
  //   prefixName: 'арматура', // 🔥 тільки це важливо
  //   name,
  //   baseUnit: length ? 'шт' : 'кг', // 🔥 ВАЖЛИВО
  //   diameter,
  //   length,
  //   className,
  // };
}
// export function buildRebar(parsed: ParsedSpec): BuiltElement {
//   if (parsed.kind !== 'rebar') {
//     throw new Error('Invalid spec for rebar builder');
//   }

//   const { diameter, className, length } = parsed;

//   // 🔥 code (чистий)
//   const code = ['R', diameter, className ?? '', length ? `L${length}` : '']
//     .filter(Boolean)
//     .join('_');

//   // 🔥 name (людський)
//   // const nameParts = [`Арматура Ø${diameter}`];

//   // if (className) nameParts.push(className);
//   // if (length) nameParts.push(`L=${length}`);

//   //  const name = nameParts.join(' ');
//   const rawCode = `Ø${diameter} ${className ?? ''}`.trim();

//   const name = buildName('Арматура', rawCode, {
//     length,
//   });

//   return {
//     code,
//     prefixName: 'арматура', // 🔥 для Catalog
//     name,
//     type: ELEMENT_TYPES.PART, // ✔ строго типізовано
//     category: 'rebar',
//     baseUnit: 'шт', // 🔥 ВАЖЛИВО
//     profileType: 'rebar', // 🔥 для матеріалу
//     className,

//     diameter,
//     length,
//   };
// }

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
