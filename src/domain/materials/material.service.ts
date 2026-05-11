import { ElementShort } from '../../modules/elements/element.model';
import { ElementRepository } from '../../modules/elements/element.repository';
import { ELEMENT_TYPES } from '../../config/config';
import {
  addElementToCache,
  getElementFromCache,
} from '../../services/cache.service';
import { generateIdByType } from '../../utils/id';
import { BuiltElement } from '../../modules/elements/element.builder';
import { toShort } from '../../modules/elements/element.mapper';
import { MaterialRepository } from './material.repository';
import { getMaterialUnit } from './material.utils';
import { Material } from './material.model';

export function getOrCreateMaterialFromPart(
  part: BuiltElement,
  repo: ElementRepository,
): ElementShort {
  // 🔥 код матеріалу без довжини
  const codeParts = [part.category];

  if (part.diameter) codeParts.push(String(part.diameter));
  if (part.width) codeParts.push(String(part.width));
  if (part.thickness) codeParts.push(String(part.thickness));
  if (part.className) codeParts.push(part.className);

  const code = codeParts.join('_');

  const cached = getElementFromCache(code);
  if (cached) return cached;

  const existing = repo.findByCode(code);
  if (existing) {
    const short = toShort(existing);
    addElementToCache(short);
    return short;
  }

  const id = generateIdByType(ELEMENT_TYPES.MATERIAL);

  const row = {
    ID: id,
    Code: code,
    Name: buildMaterialName(part),
    Type: ELEMENT_TYPES.MATERIAL,
    Category: part.category,
    BaseUnit: 'кг',
    Density: 7850,
    CreatedAt: new Date(),
  };

  repo.insert(row);

  const short = {
    id,
    code,
    baseUnit: 'кг',
    type: row.Type,
  };

  addElementToCache(short);

  return short;
}

function buildMaterialName(part: BuiltElement): string {
  switch (part.category) {
    case 'rebar':
      return `Арматура Ø${part.diameter} ${part.className ?? ''}`;

    case 'pipe':
      return `Труба Ø${part.diameter} t=${part.thickness}`;

    case 'plate':
      return `Полоса ${part.width}x${part.thickness}`;

    default:
      return part.name;
  }
}

export function findMaterialForPart(
  part: BuiltElement,
  materialRepo: MaterialRepository,
): Material {
  if (part.category !== 'rebar') {
    throw new Error('Material lookup not implemented for: ' + part.category);
  }

  const material = materialRepo.findRebar(part.diameter!, part.className!);

  if (!material) {
    throw new Error(
      `❌ Material not found: Ø${part.diameter} ${part.className}`,
    );
  }

  return material;
}
// export function getOrCreateMaterialFromPart(
//   part: BuiltElement,
//   repo: ElementRepository,
// ): ElementShort {

//   // 🔒 поки тільки арматура
//   if (part.category !== 'rebar') {
//     throw new Error('Material builder not implemented for: ' + part.category);
//   }

//   if (!part.diameter) {
//     throw new Error('Rebar diameter is required');
//   }

//   const code = ['R', part.diameter, part.className].filter(Boolean).join('_');

//   // 🔥 CACHE
//   const cached = getElementFromCache(code);
//   if (cached) return cached;

//   // 🔍 REPO
//   const existing = repo.findByCode(code);
//   if (existing) {
//     const short: ElementShort = {
//       id: existing.id,
//       code: existing.code,
//       baseUnit: existing.baseUnit,
//       type: existing.type,
//     };

//     addElementToCache(short);
//     return short;
//   }

//   // 🆕 CREATE
//   const id = generateIdByType(ELEMENT_TYPES.MATERIAL);

//   const baseUnit = getMaterialUnit(part.category);

//   repo.insert({
//     ID: id,
//     Code: code,
//     Name: `Арматура Ø${part.diameter} ${part.className ?? ''}`,
//     Type: ELEMENT_TYPES.MATERIAL,
//     Category: part.category,
//     BaseUnit: baseUnit,

//     Diameter: part.diameter,
//     Class: part.className,
//     WeightPerUnit: calcRebarWeightPerMeter(part.diameter),
//     Density: 7850,

//     CreatedAt: new Date(),
//   });

//   const short: ElementShort = {
//     id,
//     code,
//     baseUnit,
//     type: ELEMENT_TYPES.MATERIAL,
//   };

//   addElementToCache(short);

//   return short;
// }
