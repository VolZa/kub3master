import { ElementRepository } from '../modules/elements/element.repository';
import { ELEMENT_TYPES } from '../config/config';
import { generateIdByType } from '../utils/id';
import { ElementShort } from '../modules/elements/element.model';
import { toShort } from '../modules/elements/element.mapper';

export function getOrCreateRebarPart(
  diameter: number,
  className: string,
  length: number,
  repo: ElementRepository,
): ElementShort {
  const code = `R_${diameter}_${className}, L=${length}`;

  const existing = repo.findByCode(code, undefined);
  if (existing) return toShort(existing);

  const id = generateIdByType(ELEMENT_TYPES.PART);

  repo.insert({
    ID: id,
    Code: code,
    PrefixName: 'арматура',
    Name: `Арматура Ø${diameter} ${className} L=${length}`,
    Type: ELEMENT_TYPES.PART,
    Category: 'rebar',
    BaseUnit: 'шт',

    Diameter: diameter,
    Class: className,
    Length: length,

    CreatedAt: new Date(),
  });

  return {
    id,
    code,
    baseUnit: 'шт',
    type: ELEMENT_TYPES.PART,
  };
}
