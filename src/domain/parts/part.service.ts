import { ElementRepository } from '../../modules/elements/element.repository';
import { ElementShort } from '../../modules/elements/element.model';
import { generateIdByType } from '../../utils/id';
import { addElementToCache } from '../../services/cache.service';
import { BuiltElement } from '../../modules/elements/element.builder';

import { CatalogHelper } from '../../modules/catalog/catalog.helper';
import { getOrCreateElementFromBuilt } from '../../modules/elements/element.factory';
import { MaterialRepository } from '../materials/material.repository';
import { MaterialBatchRepository } from '../materials/material-batch.repository';

export function getOrCreatePart(
  built: BuiltElement,
  repo: ElementRepository,
  catalogHelper: CatalogHelper,
  materialRepo: MaterialRepository,
  materialBatchRepo: MaterialBatchRepository,
): ElementShort {
  // 🔥 0. захист
  const type = catalogHelper.getType(built.prefixName);
  if (type !== 'part') {
    throw new Error(`getOrCreatePart: invalid type ${type}`);
  }

  // 🔥 1. repository
  const existing = repo.findByCode(built.code);

  if (existing) {
    const short: ElementShort = {
      id: existing.id,
      code: existing.code,
      baseUnit: existing.baseUnit,
      type: existing.type, // 🔥 обов'язково
    };

    addElementToCache(short); // ✅ важливо

    return short;
  }

  // 🔥 2. create
  const id = generateIdByType('part');

  const element = getOrCreateElementFromBuilt(
    built,
    repo,
    catalogHelper,
    materialRepo,
    materialBatchRepo,
  );

  // const row = buildElementRow(built, id);

  // repo.insert(row);

  const short: ElementShort = {
    id,
    code: built.code,
    baseUnit: 'шт',
    type: type,
  };

  // 🔥 3. cache
  addElementToCache(short);

  return short;
}
