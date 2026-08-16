import { ParsedSpec } from '../../bom/model/parsed-spec.model';
import { BuiltElement } from '../../../domain/elements/built-element.model';
// import { ELEMENT_TYPES } from '../../../config/config';
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
}
