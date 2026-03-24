// import { debug } from '../../utils/debug';

// export function _addElement(data: any): string {
//   return 'OK';
// }

// export const addElement = debug('addElement', _addElement);

import { addElementToCache } from '../../services/cache.service';
import { findElementByCode, insertElementRow } from './element.repository';
import { buildElementCode, buildElementName } from './element.builder';
import { generateId } from '../../services/id.service';
import { ElementShort, CreateElementDto } from './element.model';
import { buildElementRow } from './element.mapper';

export function getOrCreateElementFromParsed(parsed: ParsedSpec) {
  const code = buildElementCode(parsed);

  let element = findElementByCode(code);

  if (element) return element;

  const name = buildElementName(parsed);

  const id = generateId('assembly');

  insertElementRow(
    buildElementRow(
      { code, name, type: 'part', category: 'rebar', baseUnit: 'шт' },
      id,
    ),
  );

  return { id, code };
}

export function createElement(data: CreateElementDto): ElementShort {
  const id = generateId('assembly');

  insertElementRow(buildElementRow(data, id));

  //   data.name,
  //   data.type,
  //   data.category,
  //   data.baseUnit,
  //   new Date(),  // ]);

  const element: ElementShort = {
    id,
    code: data.code,
    baseUnit: data.baseUnit,
  };

  addElementToCache(element);

  return element;
}
