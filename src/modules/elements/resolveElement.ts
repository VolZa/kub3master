import { ElementRepository } from './element.repository';
import { ElementShort } from './element.model';
// import { getOrCreatePart } from '../../domain/parts/part.service';
// import { getOrCreateMaterialFromPart } from '../../domain/materials/material.service';
// import { getOrCreateAssembly } from './assembly.service';
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
