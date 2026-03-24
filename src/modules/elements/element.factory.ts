import { ParsedSpec } from '../bom/bom.parser';
import { buildRebar } from './builders/rebar.builder';
import { buildAngle } from './builders/angle.builder';
import { buildPlate } from './builders/plate.builder';

import { findElementByCode, insertElementRow } from './element.repository';
import { generateId } from '../../services/id.service';
import { buildElementRow } from './element.mapper';

export function getOrCreateElement(parsed: ParsedSpec) {
  if (!parsed.detected) {
    throw new Error('Spec not detected');
  }

  // 🔥 1. Визначаємо builder
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
      throw new Error('Unknown element kind');
  }

  // 🔥 2. Шукаємо
  const existing = findElementByCode(built.code);

  if (existing) return existing;

  // 🔥 3. Створюємо
  const id = generateId(built.type);

  const row = buildElementRow(built, id);

  insertElementRow(row);

  return {
    id,
    code: built.code,
    baseUnit: built.baseUnit, // 🔥 додали
  };
}
