import { BuiltElement } from '../element.builder';
import { ELEMENT_TYPES } from '../../../config/config';
import { ParsedSpec } from '../../bom/model/parsed-spec.model';
// export function buildConcrete(parsed: {
//   kind: 'concrete';
//   className: string;
// }): BuiltElement {
//   return {
//     // type: ELEMENT_TYPES.MATERIAL,
//     code: `C_${parsed.className}`,
//     prefixName: 'Бетон', // 🔥 для Catalog
//     name: `Бетон C${parsed.className.replace('_', '/')}`,
//     category: 'concrete',
//     // baseUnit: 'м3',
//   };
// }

export function buildConcrete(parsed: ParsedSpec) {
  if (parsed.kind !== 'concrete') {
    throw new Error('Invalid spec for concrete builder');
  }

  const code = parsed.className.replace(/^C/i, 'C_').replace('/', '_');

  return {
    code, // C_20_25

    prefixName: 'бетон',

    name: `Бетон ${parsed.className}`,

    profileType: '',
    category: 'concrete_mix',

    baseUnit: 'м3',
  };
}
