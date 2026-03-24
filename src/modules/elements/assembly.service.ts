import { findElementByCode, insertElement } from './element.repository';
import { addElementToCache } from '../../services/cache.service';
import { generateId } from '../../utils/id';

/**
 * Отримати або створити вузол (assembly)
 */
export function getOrCreateAssembly(code: string) {
  let element = findElementByCode(code);

  if (element) return element;

  const id = generateId();

  const name = `Вузол ${code}`;

  insertElement([
    id,
    code,
    name,
    'assembly', // type
    'assembly', // category
    'шт',
    new Date(),
  ]);

  element = { id, code, unit: 'шт' };

  // 🔥 оновлюємо cache
  addElementToCache(element);

  return element;
}
