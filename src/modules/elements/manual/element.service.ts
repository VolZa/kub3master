import { ParsedSpec } from '../../bom/model/parsed-spec.model';
import { ElementRepository } from '../element.repository';
import { generateId } from '../../../services/id.service';
import { buildElementRow } from '../element.mapper';
import { buildElementCode, buildElementName } from '../element.builder';
import { CreateElementDto, ElementShort } from '../element.model';
import { addElementToCache } from '../../../services/cache.service';
// export function getOrCreateElementFromParsed(
//   parsed: ParsedSpec,
//   repo: ElementRepository,
// ) {
//   if (parsed.kind === 'unknown') {
//     throw new Error('Spec not recognized');
//   }

//   const code = buildElementCode(parsed);

//   const existing = repo.findByCode(code);
//   if (existing) return existing;

//   const name = buildElementName(parsed);

//   const id = generateId('assembly');

//   const row = buildElementRow(
//     {
//       code,
//       name,
//       type: 'part',
//       category: parsed.kind, // 🔥 краще ніж 'rebar'
//       baseUnit: 'шт',
//     },
//     id,
//   );

//   repo.insert(row);

//   return { id, code, baseUnit: 'шт' };
// }

export function createElement(
  data: CreateElementDto,
  repo: ElementRepository,
): ElementShort {
  const id = generateId('assembly');

  const row = buildElementRow(data, id);

  repo.insert(row);

  const element: ElementShort = {
    id,
    code: data.code,
    baseUnit: data.baseUnit,
  };

  addElementToCache(element);

  return element;
}
