import { ParsedSpec } from '../bom/model/parsed-spec.model';
import { ElementRepository } from './element.repository';
import { ElementShort, ElementFull } from './element.model';
import { buildByKind } from './builders/builder.dispatcher';
import { buildElementRow } from './element.mapper';
import { generateIdByType } from '../../utils/id';
import {
  addElementToCache,
  getElementFromCache,
} from '../../services/cache.service';
import { toShort } from './element.mapper';
import { BuiltElement, BuiltElementExtended } from './element.builder';
import { getOrCreateMaterialFromPart } from '../../domain/materials/material.service';
import {
  ELEMENT_TYPES,
  ElementType,
  MaterialCategory,
} from '../../config/config';
import { CatalogService } from '../catalog/catalog.service';
import { getOrCreateMaterialFromCode } from './material.service';
import { MaterialRepository } from '../../domain/materials/material.repository';
import { ICatalogRepository } from '../catalog/catalog.repository.interface';

export function getOrCreateElementFromBuilt(
  built: BuiltElement,
  repo: ElementRepository,
  catalogRepo: ICatalogRepository,
  materialRepo: MaterialRepository,
): ElementFull {
  // 🔹 1. існує?
  let el = repo.findByCode(built.code);
  if (el) return el;

  // 🔥 2. Catalog (через PrefixName)
  const catalog = catalogRepo.requireByCode(built.prefixName.toLowerCase());

  // 🔹 3. Material
  let material = materialRepo.findByCode(built.code);

  if (!material && built.code.includes('_L')) {
    const baseCode = built.code.split('_L')[0];
    material = materialRepo.findByCode(baseCode);
  }

  // 🔹 4. BaseUnit
  let baseUnit = 'шт';

  if (catalog.type === 'material') {
    baseUnit = material?.baseUnit || 'кг';
  }

  const id = generateIdByType(catalog.type);

  // 🔥 5. створення
  repo.insert({
    ID: id,
    Code: built.code,
    PrefixName: built.prefixName,
    Name: built.name,

    Type: catalog.type,
    Category: catalog.category,
    ProfileType: catalog.profileType || '',

    BaseUnit: baseUnit,
    ParentMaterialID: material?.id || '',

    Diameter: built.diameter,
    Class: built.className,
    Length: built.length,

    IsActive: true,
    CreatedAt: new Date(),
  });

  const created = repo.findByCode(built.code);

  if (!created) {
    throw new Error(`Failed to create element: ${built.code}`);
  }

  return created;
}

export function getOrCreateElement(
  parsed: ParsedSpec,
  repo: ElementRepository,
  catalogService: CatalogService,
): ElementShort {
  // 🔥 1. build raw
  const built = buildByKind(parsed);

  // 🔥 2. Catalog resolve
  const catalog = catalogService.getByCode(built.code);

  // const type = catalog?.type ?? built.type;

  const isPart = built.code.includes('_L');

  const type = isPart ? ELEMENT_TYPES.PART : ELEMENT_TYPES.MATERIAL;

  // const category = catalog?.category ?? built.category;
  // const profileType = catalog?.profileType ?? built.profileType;

  const cacheKey = `${type}:${built.code}`;

  // 🔥 3. cache
  const cached = getElementFromCache(cacheKey);
  if (cached) return cached;

  // 🔍 4. repo
  const existing = repo.findByCode(built.code);
  if (existing) {
    const short = toShort(existing);
    addElementToCache(short);
    return short;
  }
  // -------------------------
  // 🔗 MATERIAL LINK (NEW)
  // -------------------------
  let parentMaterialId: string | undefined;

  // const isPart = built.code.includes('_L');
  console.log(
    'Determining if element is part based on code:',
    built.code,
    'isPart:',
    isPart,
  );
  if (isPart) {
    const materialCode = built.code.split('_L')[0];

    const material = getOrCreateMaterialFromCode(materialCode, repo as any);

    parentMaterialId = material.id;
  }
  console.log(
    'Resolved parentMaterialId:',
    parentMaterialId,
    'for code:',
    built.code,
  );
  // 🆕 5. create
  const id = generateIdByType(type);
  const row = buildElementRow(
    {
      ...built,
      type,
      category,
      profileType,
      parentMaterialId,
    },
    id,
  );

  repo.insert(row);

  const short: ElementShort = {
    id,
    code: built.code,
    baseUnit: built.baseUnit ?? 'шт',
    type,
  };

  addElementToCache(short);

  return short;
}

// import { ParsedSpec } from '../bom/model/parsed-spec.model';
// import { ElementRepository } from './element.repository';
// import { ElementShort, ElementFull } from './element.model';
// import { buildByKind } from './builders/builder.dispatcher';
// import { buildElementRow } from './element.mapper';
// import { generateIdByType } from '../../utils/id';
// import {
//   addElementToCache,
//   getElementFromCache,
// } from '../../services/cache.service';
// import { toShort } from './element.mapper';
// import { BuiltElementExtended } from './element.builder';
// import { getOrCreateMaterialFromPart } from '../../domain/materials/material.service';
// import { ElementType, MaterialCategory } from '../../config/config';

// export function getOrCreateElement(
//   parsed: ParsedSpec,
//   repo: ElementRepository,
// ): ElementShort {
//   // 🔥 1. build
//   const built = buildByKind(parsed);

//   // 🔥 2. cache (краще через code + type)
//   const cacheKey = `${built.type}:${built.code}`;

//   const cached = getElementFromCache(cacheKey);
//   if (cached) return cached;

//   // 🔍 3. repository
//   const existing = repo.findByCode(built.code);
//   if (existing) {
//     const short = toShort(existing);
//     addElementToCache(short);
//     // addElementToCache(cacheKey, short);
//     return short;
//   }

//   // 🆕 4. create (БЕЗ domain-логіки)
//   const id = generateIdByType(built.type);

//   const row = buildElementRow(built, id);

//   repo.insert(row);

//   const short: ElementShort = {
//     id,
//     code: built.code,
//     baseUnit: built.baseUnit ?? 'шт',
//     type: built.type,
//   };

//   addElementToCache(short);

//   return short;
// }

// export function getOrCreateElementWithType(
//   code: string,
//   name: string,
//   type: ElementType,
//   categoty: MaterialCategory,
//   baseUnit: string,
//   repo: ElementRepository,
// ): ElementFull {
//   let existing = repo.findByCode(code);

//   if (existing) {
//     if (existing.type !== type) {
//       repo.updateType(existing.id, type);

//       // 🔥 перечитати після апдейту
//       const updated = repo.findById(existing.id);
//       if (!updated) throw new Error('Failed to reload element');

//       return updated;
//     }

//     return existing;
//   }

//   const id = generateIdByType(type);

//   repo.insert({
//     ID: id,
//     Code: code,
//     Name: name,
//     Type: type,
//     Category: categoty,
//     BaseUnit: baseUnit,
//     CreatedAt: new Date(),
//   });

//   // 🔥 КЛЮЧОВИЙ МОМЕНТ
//   const created = repo.findById(id);
//   if (!created) {
//     throw new Error('Failed to create element: ' + code);
//   }

//   return created;
// }
