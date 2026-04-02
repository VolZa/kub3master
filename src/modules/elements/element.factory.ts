import { ParsedSpec } from '../bom/model/parsed-spec.model';
import { buildRebar } from './builders/rebar.builder';
import { buildAngle } from './builders/angle.builder';
import { buildPlate } from './builders/plate.builder';
import { ElementRepository } from './element.repository';
import { generateId } from '../../services/id.service';
import { buildElementRow } from './element.mapper';

export function getOrCreateElement(
  parsed: ParsedSpec,
  repo: ElementRepository,
) {
  if (parsed.kind === 'unknown') {
    throw new Error('Spec not recognized');
  }

  let built;

  switch (parsed.kind) {
    case 'rebar':
      built = buildRebar(parsed);
      break;

    case 'angle':
      built = buildAngle(parsed);
      break;

    case 'plate':
      built = buildPlate(parsed);
      break;

    default:
      throw new Error(`Builder not implemented for kind: ${parsed.kind}`);
  }

  // 🔍 тепер через repo
  const existing = repo.findByCode(built.code);

  if (existing) return existing;

  // 🆕 створення
  const id = generateId(built.type);

  const row = buildElementRow(built, id);

  repo.insert(row);

  return {
    id,
    code: built.code,
    baseUnit: built.baseUnit,
  };
}

// import { ParsedSpec } from '../bom/model/parsed-spec.model';
// import { buildRebar } from './builders/rebar.builder';
// import { buildAngle } from './builders/angle.builder';
// import { buildPlate } from './builders/plate.builder';

// import { findElementByCode, insertElementRow } from './element.repository';
// import { generateId } from '../../services/id.service';
// import { buildElementRow } from './element.mapper';

// export function getOrCreateElement(parsed: ParsedSpec) {
//   // ❌ detected більше не потрібен
//   if (parsed.kind === 'unknown') {
//     throw new Error('Spec not recognized');
//   }

//   let built;

//   // 🔥 типобезпечний switch
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

//   // 🔍 пошук
//   const existing = findElementByCode(built.code);

//   if (existing) return existing;

//   // 🆕 створення
//   const id = generateId(built.type);

//   const row = buildElementRow(built, id);

//   insertElementRow(row);

//   return {
//     id,
//     code: built.code,
//     baseUnit: built.baseUnit,
//   };
// }
