import { findElementByCode, insertElementRow } from './element.repository';
import { addElementToCache } from '../../services/cache.service';
import { generateId } from '../../services/id.service';
import { ElementCacheItem } from './element.model';
import { buildAssemblyRow } from './element.mapper';
/**
 * Отримати або створити вузол (assembly)
 */
// export function getOrCreateAssembly(code: string) {
//   let element = findElementByCode(code);

//   if (element) return element;

//   const id = generateId();

//   const name = `Вузол ${code}`;

//   insertElementRow([
//     id,
//     code,
//     name,
//     'assembly', // type
//     'assembly', // category
//     'шт',
//     new Date(),
//   ]);

//   element = { id, code, baseUnit: 'шт' };

//   // 🔥 оновлюємо cache
//   addElementToCache(element);

//   return element;
// }

export function getOrCreateAssembly(code: string): ElementCacheItem {
  let element = findElementByCode(code);

  if (element) return element;

  const id = generateId('assembly');

  const row = buildAssemblyRow(id, code);

  insertElementRow(row);

  element = { id, code, baseUnit: 'шт' };

  addElementToCache(element);

  return element;
}
