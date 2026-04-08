// import { ParsedSpec } from '../../bom/model/parsed-spec.model';
// import { ElementRepository } from '../element.repository';
// import { generateId } from '../../../services/id.service';
// import { buildElementRow } from '../element.mapper';
// import { buildElementCode, buildElementName } from '../element.builder';
// import { CreateElementDto, ElementShort } from '../element.model';
// import { addElementToCache } from '../../../services/cache.service';

// export function createElement(
//   data: CreateElementDto,
//   repo: ElementRepository,
// ): ElementShort {
//   const id = generateId('assembly');

//   const row = buildElementRow(data, id);

//   repo.insert(row);

//   const element: ElementShort = {
//     id,
//     code: data.code,
//     baseUnit: data.baseUnit,
//   };

//   addElementToCache(element);

//   return element;
// }
