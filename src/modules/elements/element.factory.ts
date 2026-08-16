// src\modules\elements\element.factory.ts

import { ParsedSpec } from '../bom/model/parsed-spec.model';
import { ElementRepository } from './element.repository';
import { ElementShort, ElementFull, ElementRow } from './element.model';
import { buildByKind } from './builders/builder.dispatcher';
import { generateIdByType } from '../../utils/id';
import {
  addElementToCache,
  getElementFromCache,
} from '../../services/cache.service';
import { toShort } from './element.mapper';
import {
  BuiltElement,
  BuiltElementExtended,
} from '../../domain/elements/built-element.model';

import { MaterialRepository } from '../../domain/materials/material.repository';
import { MaterialBatchRepository } from '../../domain/materials/material-batch.repository';
import { CatalogHelper } from '../catalog/catalog.helper';
import { MaterialResolver } from 'domain/materials/material.resolver';
import { resolveElementType } from './element-type.resolver';

export function getOrCreateElementFromBuilt(
  built: BuiltElement,
  elementRepo: ElementRepository,
  catalogHelper: CatalogHelper,
  materialRepo: MaterialRepository,
  projectDocumentID?: string,
): ElementFull {
  console.log('getOrCreateElementFromBuilt with built:', built);

  // 🔹 1. Перевірка існування
  const existing = elementRepo.findByCode(built.code, projectDocumentID);
  if (existing) {
    return existing;
  }

  // 🔹 2. Отримуємо шаблон
  const template = catalogHelper.resolveTemplate(built.prefixName);

  console.log('Resolved template:', template);

  // 🔹 3. Визначаємо кінцевий тип елемента
  const type = resolveElementType(template, built.length);

  console.log('Resolved element type:', type);

  // 🔹 4. Пошук матеріалу
  let material;

  switch (type) {
    case 'material':
      material = materialRepo.findByCode(built.code);
      break;

    case 'part': {
      const resolver = new MaterialResolver(materialRepo);
      material = resolver.resolve(built);
      console.log('Resolved material:', material, 'for', built.code);
      break;
    }
  }

  // 🔹 5. Базова одиниця виміру
  const baseUnit = type === 'material' ? (material?.baseUnit ?? 'кг') : 'шт';

  // 🔹 6. Генеруємо ID
  const id = generateIdByType(type);

  // 🔹 7. Для material/part матеріал обов'язковий
  if ((type === 'material' || type === 'part') && !material) {
    throw new Error(`Material not found for element: ${built.code}`);
  }

  // 🔹 8. Власник елемента
  const ownerProjectDocumentID =
    type === 'assembly' || type === 'product' ? projectDocumentID : '';

  // 🔹 9. Створення рядка
  const row: ElementRow = {
    ID: id,
    Code: built.code,

    PrefixName: built.prefixName,
    Name: built.name,

    Type: type,
    ProjectDocumentID: ownerProjectDocumentID,

    ParentMaterialID: type === 'part' ? material?.id : undefined,

    Category: template.category,
    ProfileType: template.profileType ?? '',

    BaseUnit: baseUnit,

    Diameter: built.diameter,
    Class: built.className,

    Width: built.width,
    Height: built.height,
    Length: built.length,
    Thickness: built.thickness,

    IsActive: true,
    Comment: '',
    CreatedAt: new Date(),
  };

  console.log('FINAL CODE BEFORE INSERT:', built.code);

  elementRepo.insert(row);

  const created = elementRepo.findByCode(built.code, ownerProjectDocumentID);

  if (!created) {
    throw new Error(`Failed to create element: ${built.code}`);
  }

  return created;
}

export function getOrCreateElement(
  parsed: ParsedSpec,
  repo: ElementRepository,
  catalogHelper: CatalogHelper,
  materialRepo: MaterialRepository,
  // materialBatchRepo: MaterialBatchRepository,
  projectDocumentID?: string,
): ElementShort {
  // 🔹 1. build
  const built = buildByKind(parsed);

  // 🔹 2. cache key
  const type = catalogHelper.getType(built.prefixName);
  const cacheKey = `${type}:${built.code}`;

  const cached = getElementFromCache(cacheKey);
  if (cached) return cached;

  // 🔹 3. існує?
  const existing = repo.findByCode(built.code, projectDocumentID);
  if (existing) {
    const short = toShort(existing);
    addElementToCache(short);
    return short;
  }

  // 🔥 4. головне — factory
  const element = getOrCreateElementFromBuilt(
    built,
    repo,
    catalogHelper,
    materialRepo,
    projectDocumentID,
    // materialBatchRepo,
  );

  const short: ElementShort = {
    id: element.id,
    code: element.code,
    projectDocumentID: element.projectDocumentID,
    baseUnit: element.baseUnit,
    type: element.type,
  };

  addElementToCache(short);

  return short;
}
