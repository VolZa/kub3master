import { BuiltElement } from '../element.builder';
import { ELEMENT_TYPES } from '../../../config/config';

export function buildConcrete(parsed: {
  kind: 'concrete';
  className: string;
}): BuiltElement {
  return {
    type: ELEMENT_TYPES.MATERIAL,
    code: `C_${parsed.className}`,
    name: `Бетон ${parsed.className}`,
    baseUnit: 'л',
    category: 'concrete',
  };
}
