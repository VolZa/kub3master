import { ElementRepository } from './element.repository';
import { addElementToCache } from '../../services/cache.service';
import { generateId } from '../../services/id.service';
import { ElementCacheItem } from './element.model';
import { buildAssemblyRow } from './element.mapper';

/**
 * Отримати або створити вузол (assembly)
 */
export function getOrCreateAssembly(
  code: string,
  repo: ElementRepository,
): ElementCacheItem {
  let element = repo.findByCode(code);

  if (element) return element;

  const id = generateId('assembly');

  const row = buildAssemblyRow(id, code);

  repo.insert(row);

  element = { id, code, baseUnit: 'шт' };

  addElementToCache(element);

  return element;
}
