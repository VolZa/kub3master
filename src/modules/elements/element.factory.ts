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
import { BuiltElement, BuiltElementExtended } from './element.builder';

import { MaterialRepository } from '../../domain/materials/material.repository';
import { MaterialBatchRepository } from '../../domain/materials/material-batch.repository';
import { CatalogHelper } from '../catalog/catalog.helper';
import { MaterialResolver } from 'domain/materials/material.resolver';

export function getOrCreateElementFromBuilt(
  built: BuiltElement,
  elementRepo: ElementRepository,
  catalogHelper: CatalogHelper,
  materialRepo: MaterialRepository,
  projectDocumentID?: string,
  // materialBatchRepo: MaterialBatchRepository,
): ElementFull {
  console.log('getOrCreateElementFromBuilt with built:', built);
  // 🔹 1. вже існує?
  let existing = elementRepo.findByCode(built.code, projectDocumentID);
  if (existing) return existing;

  // 🔥 2. Catalog через helper
  const catalog = catalogHelper.get(built.prefixName);

  const catalogType = catalog.type;
  const category = catalog.category;
  const profileType = catalog.profileType || '';
  console.log(
    'getOrCreateElementFromBuilt 🔥 catalogType:',
    catalogType,
    'category:',
    category,
    'profileType:',
    profileType,
  );
  // 🔥 визначення типу
  let type = catalogType;
  if (catalogType === 'material' && built.length !== undefined) {
    type = 'part';
  }

  // 🔥 material
  let material;

  if (type === 'material') {
    material = materialRepo.findByCode(built.code);
  }

  if (type === 'part') {
    const resolver = new MaterialResolver(materialRepo);

    material = resolver.resolve(built);
    console.log('Resolved material:', material, 'for', built.code);
  }

  // 🔥 base unit
  const baseUnit = type === 'material' ? material?.baseUnit || 'кг' : 'шт';
  // 🔹 5. ID
  const id = generateIdByType(type);

  // 🔥 6. створення
  if (!material) {
    throw new Error(`Material not found for element: ${built.code}`);
  }

  const row: ElementRow = {
    ID: id,
    Code: built.code,
    PrefixName: built.prefixName,
    Name: built.name,

    Type: type,
    ProjectDocumentID: projectDocumentID,
    // type === 'assembly' || type === 'product'
    //   ? built.projectDocumentID
    //   : undefined,
    ParentMaterialID: type === 'part' ? material.id : undefined,
    Category: category,
    ProfileType: profileType,
    BaseUnit: baseUnit,

    // ParentMaterialID: material?.id || '',
    // ParentMaterialID: material.id,

    Diameter: built.diameter,
    Class: built.className,
    Length: built.length,

    Width: built.width,
    Height: built.height,
    Thickness: built.thickness,

    IsActive: true,
    Comment: '',
    CreatedAt: new Date(),
  };
  console.log('FINAL CODE BEFORE INSERT:', built.code);
  elementRepo.insert(row);

  const created = elementRepo.findByCode(built.code, projectDocumentID);

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
