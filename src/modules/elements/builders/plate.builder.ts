import { BuiltElement } from 'domain/elements/built-element.model';
import { ELEMENT_TYPES } from '../../../config/config';
import { ParsedSpec } from '../../bom/model/parsed-spec.model';

export function buildPlate(parsed: ParsedSpec): BuiltElement {
  if (parsed.kind !== 'plate') {
    throw new Error('Invalid spec for plate builder');
  }
  console.log('🔨 buildPlate with parsed:', parsed);
  return {
    code: `P_${parsed.width}_${parsed.thickness}_L${parsed.length}`,
    prefixName: 'полоса', // 🔥 для Catalog
    name: `Полоса ${parsed.width}x${parsed.thickness} L=${parsed.length}`,
    // type: ELEMENT_TYPES.PART,
    profileType: 'plate',
    category: 'plate',
    // baseUnit: 'шт',

    width: parsed.width,
    thickness: parsed.thickness,
    length: parsed.length,
  };
}
