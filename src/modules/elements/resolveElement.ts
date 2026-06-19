import { ElementRepository } from './element.repository';
import { ElementShort } from './element.model';
import { getOrCreatePart } from '../../domain/parts/part.service';
import { getOrCreateMaterialFromPart } from '../../domain/materials/material.service';
import { getOrCreateAssembly } from './assembly.service';
import { buildByKind } from './builders/builder.dispatcher';
import { ParsedSpec } from '../bom/model/parsed-spec.model';
import { ICatalogRepository } from '../../modules/catalog/catalog.repository.interface';
import { MaterialRepository } from '../../domain/materials/material.repository';
import { extractPrefixFromSpec } from '../bom/parsers/prefix.resolver';

import { getOrCreateElementFromBuilt } from './element.factory';
import { MaterialBatchRepository } from '../../domain/materials/material-batch.repository';
import { CatalogHelper } from '../catalog/catalog.helper';

export function resolveElement(
  parsed: ParsedSpec,
  repo: ElementRepository,
  catalogHelper: CatalogHelper, // 🔥 зміна
  materialRepo: MaterialRepository,
  materialBatchRepo: MaterialBatchRepository,
): ElementShort {
  // 🔹 1. prefix
  const prefix = extractPrefixFromSpec(parsed);

  // 🔹 2. геометрія
  const built = buildByKind(parsed);

  // 🔹 3. через factory
  const element = getOrCreateElementFromBuilt(
    {
      ...built,
      prefixName: prefix, // 🔥 ключ до Catalog
    },
    repo,
    catalogHelper, // 🔥 замість repo
    materialRepo,
    // materialBatchRepo,
  );

  // 🔹 4. short
  return {
    id: element.id,
    code: element.code,
    baseUnit: element.baseUnit,
    type: element.type,
  };
}
// export function resolveElement(
//   parsed: ParsedSpec,
//   repo: ElementRepository,
//   catalogRepo: ICatalogRepository,
//   materialRepo: MaterialRepository,
//   materialBatchRepo: MaterialBatchRepository,
// ): ElementShort {
//   // 🔹 1. визначаємо prefix
//   const prefix = extractPrefixFromSpec(parsed);

//   // 🔹 2. Catalog вирішує тип
//   const catalog = catalogRepo.requireByCode(prefix);

//   // 🔹 3. будуємо геометрію (БЕЗ type)
//   const built = buildByKind(parsed);

//   // 🔹 4. створюємо через єдиний pipeline
//   const element = getOrCreateElementFromBuilt(
//     {
//       ...built,
//       prefixName: prefix,
//       // type: catalog.type, // 🔥 тепер з Catalog
//     },
//     repo,
//     catalogRepo,
//     materialRepo,
//     materialBatchRepo,
//   );

//   return {
//     id: element.id,
//     code: element.code,
//     baseUnit: element.baseUnit,
//     type: element.type,
//   };
// }
// export function resolveElement(
//   parsed: ParsedSpec,
//   repo: ElementRepository,
// ): ElementShort {
//   const built = buildByKind(parsed);

//   if (built.type === 'part') {
//     return getOrCreatePart(built, repo);
//   }

//   if (built.type === 'material') {
//     return getOrCreateMaterialFromPart(built, repo);
//   }

//   if (built.type === 'assembly') {
//     return getOrCreateAssembly(built.code, repo);
//   }

//   throw new Error('Unsupported type: ' + built.type);
// }
