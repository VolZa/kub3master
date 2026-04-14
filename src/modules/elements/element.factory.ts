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
