import { ElementRepository } from '../../modules/elements/element.repository';
import { ElementShort } from '../../modules/elements/element.model';
// import { ELEMENT_TYPES } from '../../config/config';
import { generateIdByType } from '../../utils/id';
import {
  addElementToCache,
  // getElementFromCache,
} from '../../services/cache.service';
import { BuiltElement } from '../../modules/elements/element.builder';
import { buildElementRow } from '../../modules/elements/element.mapper';

export function getOrCreatePart(
  built: BuiltElement,
  repo: ElementRepository,
): ElementShort {
  // 🔥 0. захист
  if (built.type !== 'part') {
    throw new Error(`getOrCreatePart: invalid type ${built.type}`);
  }

  // 🔥 1. repository
  const existing = repo.findByCode(built.code);

  if (existing) {
    const short: ElementShort = {
      id: existing.id,
      code: existing.code,
      baseUnit: existing.baseUnit,
      type: existing.type, // 🔥 обов'язково
    };

    addElementToCache(short); // ✅ важливо

    return short;
  }

  // 🔥 2. create
  const id = generateIdByType('part');

  const row = buildElementRow(built, id);

  repo.insert(row);

  const short: ElementShort = {
    id,
    code: built.code,
    baseUnit: built.baseUnit,
    type: built.type,
  };

  // 🔥 3. cache
  addElementToCache(short);

  return short;
}

// function buildPartKey(part: ParsedPart): string {
//   return `${part.diameter}_${part.class}_${part.length}`;
// }

// export function getOrCreatePart(
//   built: BuiltElement,
//   repo: ElementRepository,
// ): ElementShort {
//   const existing = repo.findByCode(built.code);

//   if (existing) {
//     return {
//       id: existing.id,
//       code: existing.code,
//       baseUnit: existing.baseUnit,
//     };
//   }

//   const id = generateIdByType(built.type);

//   const row = buildElementRow(built, id);

//   repo.insert(row);

//   const short: ElementShort = {
//     id,
//     code: built.code,
//     baseUnit: built.baseUnit,
//   };

//   addElementToCache(short);

//   return short;
// }
// export function getOrCreatePart(
//   part: ParsedPart,
//   repo: ElementRepository,
// ): ElementShort {
//   const key = buildPartKey(part);

//   // 🔥 CACHE
//   const cached = getElementFromCache(key);
//   if (cached) return cached;

//   // 🔍 REPO
//   const existing = repo.findPart(part);
//   if (existing) {
//     const short = {
//       id: existing.id,
//       code: existing.code,
//       baseUnit: existing.baseUnit,
//       type: existing.type,
//     };

//     addElementToCache(key, short);
//     return short;
//   }

//   // 🆕 CREATE
//   const id = generateIdByType(ELEMENT_TYPES.PART);

//   repo.insert({
//     ID: id,
//     Code: part.code,
//     Name: part.name,
//     Type: ELEMENT_TYPES.PART,
//     Category: part.category ?? '',
//     BaseUnit: part.baseUnit ?? 'шт',

//     ProfileType: part.profileType,
//     Diameter: part.diameter,
//     Class: part.class,
//     Length: part.length,
//     WeightPerUnit: part.weightPerUnit,

//     CreatedAt: new Date(),
//   });

//   const short: ElementShort = {
//     id,
//     code: part.code,
//     baseUnit: part.baseUnit ?? 'шт',
//     type: ELEMENT_TYPES.PART,
//   };

//   addElementToCache(key, short);

//   return short;
// }
