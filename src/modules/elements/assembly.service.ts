import { ElementRepository } from './element.repository';
import { ElementShort } from './element.model';
import { buildAssemblyRow } from './element.mapper';
import { generateIdByType } from '../../utils/id';
import { addElementToCache } from '../../services/cache.service';

export function getOrCreateAssembly(
  code: string,
  repo: ElementRepository,
): ElementShort {
  // 🔍 1. шукаємо
  const existing = repo.findByCode(code);

  if (existing) {
    const short: ElementShort = {
      id: existing.id,
      code: existing.code,
      baseUnit: existing.baseUnit,
    };

    addElementToCache(short);

    return short;
  }

  // 🆕 2. створюємо
  const id = generateIdByType('assembly');

  const row = buildAssemblyRow(id, code);

  repo.insert(row);

  // 🔁 3. формуємо domain → short
  const short: ElementShort = {
    id,
    code,
    baseUnit: row.BaseUnit,
  };

  addElementToCache(short);

  return short;
}
