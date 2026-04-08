import { ParsedSpec } from '../bom/model/parsed-spec.model';
import { ElementRepository } from './element.repository';
import { ElementShort, ElementFull } from './element.model';
import { buildByKind } from './builders/builder.dispatcher';
import { buildElementRow } from './element.mapper';
import { generateIdByType } from '../../utils/id';
import {
  addElementToCache,
  getElementFromCache,
} from '../../services/cache.service';
import { toShort } from './element.mapper';

export function getOrCreateElement(
  parsed: ParsedSpec,
  repo: ElementRepository,
): ElementShort {
  console.log('🔥 FACTORY CALLED');
  console.log('🧩 parsed FULL:', JSON.stringify(parsed));
  // 🔥 1. build (сам кине помилку якщо unknown)
  const built = buildByKind(parsed);

  // 🔥 2. cache FIRST
  const cached = getElementFromCache(built.code);
  if (cached) return cached;

  // 🔍 3. repository
  const existing = repo.findByCode(built.code);
  console.log('🔍 findByCode:', built.code, existing);

  if (existing) {
    const short = toShort(existing);

    addElementToCache(short);

    return short;
  }

  // 🆕 4. create
  const id = generateIdByType(built.type);

  const row = buildElementRow(built, id);
  console.log('💾 INSERT ELEMENT:', built.code);

  repo.insert(row);

  // 🔥 5. нормалізований short
  const short: ElementShort = {
    id,
    code: built.code,
    baseUnit: built.baseUnit ?? 'шт', // safeguard
  };

  addElementToCache(short);

  return short;
}

// export function getOrCreateElement(
//   parsed: ParsedSpec,
//   repo: ElementRepository,
// ): ElementShort {
//   if (parsed.kind === 'unknown') {
//     throw new Error('Spec not recognized');
//   }

//   const built = buildByKind(parsed);

//   // 🔥 cache
//   const cached = getElementFromCache(built.code);
//   if (cached) return cached;

//   // 🔍 repo
//   const existing = repo.findByCode(built.code);

//   if (existing) {
//     const short = toShort(existing);

//     addElementToCache(short);

//     return short;
//   }

//   // 🆕 create
//   const id = generateIdByType(built.type);

//   const row = buildElementRow(built, id);

//   repo.insert(row);

//   const short = toShort({
//     id,
//     code: built.code,
//     baseUnit: built.baseUnit,
//   });

//   addElementToCache(short);

//   return short;
// }

// export function getOrCreateElement(
//   parsed: ParsedSpec,
//   repo: ElementRepository,
// ): ElementShort {
//   if (parsed.kind === 'unknown') {
//     throw new Error('Spec not recognized');
//   }

//   // 🔥 1. build (типізовано)
//   const built = buildByKind(parsed);

//   // 🔥 2. cache FIRST (дуже важливо)
//   const cached = getElementCache(built.code);
//   if (cached) return cached;

//   // 🔍 3. repository
//   const existing = repo.findByCode(built.code);

//   if (existing) {
//     const short = toShort(existing);

//     addElementToCache(short);

//     return short;
//   }

//   // 🆕 4. create
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

// import { ParsedSpec } from '../bom/model/parsed-spec.model';

// import { buildRebar } from './builders/rebar.builder';
// import { buildAngle } from './builders/angle.builder';
// import { buildPlate } from './builders/plate.builder';
// import { ElementRepository } from './element.repository';
// import { generateIdByType } from '../../utils/id';
// import { buildElementRow } from './element.mapper';
// import { ElementShort } from './element.model';
// import { addElementToCache } from '../../services/cache.service';

// export function getOrCreateElement(
//   parsed: ParsedSpec,
//   repo: ElementRepository,
// ): ElementShort {
//   if (parsed.kind === 'unknown') {
//     throw new Error('Spec not recognized');
//   }

//   let built;

//   switch (parsed.kind) {
//     case 'rebar':
//       built = buildRebar(parsed);
//       break;

//     case 'angle':
//       built = buildAngle(parsed);
//       break;

//     case 'plate':
//       built = buildPlate(parsed);
//       break;

//     default:
//       throw new Error(`Builder not implemented: ${parsed.kind}`);
//   }

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

//   const element: ElementShort = {
//     id,
//     code: built.code,
//     baseUnit: built.baseUnit,
//   };

//   addElementToCache(element); // 🔥 ОБОВ'ЯЗКОВО

//   return element;
// }

// import { ParsedSpec } from '../bom/model/parsed-spec.model';
// import { buildRebar } from './builders/rebar.builder';
// import { buildAngle } from './builders/angle.builder';
// import { buildPlate } from './builders/plate.builder';
// import { ElementRepository } from './element.repository';
// import { generateId } from '../../services/id.service';
// import { buildElementRow } from './element.mapper';

// export function getOrCreateElement(
//   parsed: ParsedSpec,
//   repo: ElementRepository,
// ) {
//   if (parsed.kind === 'unknown') {
//     throw new Error('Spec not recognized');
//   }

//   let built;

//   switch (parsed.kind) {
//     case 'rebar':
//       built = buildRebar(parsed);
//       break;

//     case 'angle':
//       built = buildAngle(parsed);
//       break;

//     case 'plate':
//       built = buildPlate(parsed);
//       break;

//     default:
//       throw new Error(`Builder not implemented for kind: ${parsed.kind}`);
//   }

//   // 🔍 тепер через repo
//   const existing = repo.findByCode(built.code);

//   if (existing) return existing;

//   // 🆕 створення
//   const id = generateId(built.type);

//   const row = buildElementRow(built, id);

//   repo.insert(row);

//   return {
//     id,
//     code: built.code,
//     baseUnit: built.baseUnit,
//   };
// }

// // import { ParsedSpec } from '../bom/model/parsed-spec.model';
// // import { buildRebar } from './builders/rebar.builder';
// // import { buildAngle } from './builders/angle.builder';
// // import { buildPlate } from './builders/plate.builder';

// // import { findElementByCode, insertElementRow } from './element.repository';
// // import { generateId } from '../../services/id.service';
// // import { buildElementRow } from './element.mapper';

// // export function getOrCreateElement(parsed: ParsedSpec) {
// //   // ❌ detected більше не потрібен
// //   if (parsed.kind === 'unknown') {
// //     throw new Error('Spec not recognized');
// //   }

// //   let built;

// //   // 🔥 типобезпечний switch
// //   switch (parsed.kind) {
// //     case 'rebar':
// //       built = buildRebar(parsed);
// //       break;

// //     case 'angle':
// //       built = buildAngle(parsed);
// //       break;

// //     case 'plate':
// //       built = buildPlate(parsed);
// //       break;

// //     default:
// //       throw new Error(`Builder not implemented for kind: ${parsed.kind}`);
// //   }

// //   // 🔍 пошук
// //   const existing = findElementByCode(built.code);

// //   if (existing) return existing;

// //   // 🆕 створення
// //   const id = generateId(built.type);

// //   const row = buildElementRow(built, id);

// //   insertElementRow(row);

// //   return {
// //     id,
// //     code: built.code,
// //     baseUnit: built.baseUnit,
// //   };
// // }
