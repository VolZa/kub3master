import { ElementShort } from '../../modules/elements/element.model';
import { ElementRepository } from '../../modules/elements/element.repository';
import { ELEMENT_TYPES } from '../../config/config';
import {
  addElementToCache,
  getElementFromCache,
} from '../../services/cache.service';
import { generateIdByType } from '../../utils/id';
import { BuiltElement } from '../../modules/elements/element.builder';
import { toShort } from '../../modules/elements/element.mapper';
import { MaterialRepository } from './material.repository';
import { getMaterialUnit } from './material.utils';
import { Material } from './material.model';
import { ICatalogRepository } from '../../modules/catalog/catalog.repository.interface';
import {
  getCatalogByPrefix,
  getCategoryByPrefix,
} from '../../modules/catalog/utils/catalog.util';
import { CatalogHelper } from '../../modules/catalog/catalog.helper';

export function getOrCreateMaterialFromPart(
  part: BuiltElement,
  repo: ElementRepository,
  catalogHelper: CatalogHelper,
): ElementShort {
  // 🔥 1. отримуємо дані з Catalog
  const type = catalogHelper.getType(part.prefixName);
  if (type !== 'material') {
    throw new Error(`Expected material type for ${part.prefixName}`);
  }
  const category = catalogHelper.getCategory(part.prefixName);
  const profileType = catalogHelper.getProfileType(part.prefixName);

  // 🔥 2. формуємо код матеріалу (БЕЗ довжини)
  const codeParts: string[] = [];

  // 👉 база — category або profile
  codeParts.push(category.toUpperCase());

  if (part.diameter) codeParts.push(String(part.diameter));
  if (part.width) codeParts.push(String(part.width));
  if (part.thickness) codeParts.push(String(part.thickness));
  if (part.className) codeParts.push(part.className);

  const code = codeParts.join('_');

  // 🔹 cache
  const cached = getElementFromCache(code);
  if (cached) return cached;

  // 🔹 існує?
  const existing = repo.findByCode(code);
  if (existing) {
    const short = toShort(existing);
    addElementToCache(short);
    return short;
  }

  // 🔥 3. створення
  const id = generateIdByType(type);

  const row = {
    ID: id,
    Code: code,
    PrefixName: part.prefixName,
    Name: buildMaterialName(part, catalogHelper),

    Type: type, // 🔥 через helper
    Category: category, // 🔥 через helper
    ProfileType: profileType || '',

    BaseUnit: 'кг', // 👉 тимчасово (потім через 05_Materials)
    Density: 7850,

    CreatedAt: new Date(),
  };

  repo.insert(row);

  const short: ElementShort = {
    id,
    code,
    baseUnit: row.BaseUnit,
    type: row.Type,
  };

  addElementToCache(short);

  return short;
}
// export function getOrCreateMaterialFromPart(
//   part: BuiltElement,
//   repo: ElementRepository,
//   catalogHelper: CatalogHelper,
// ): ElementShort {

//   // 🔥 1. беремо catalog
//   const catalog = catalogHelper.get(part.prefixName);

//   const category = catalog.category;
//   const type = catalog.type;

//   // 🔥 2. формуємо код
//   const codeParts: string[] = [];

//   // 👉 можна додати category або profileType (залежить від стратегії)
//   codeParts.push(category.toUpperCase());

//   if (part.diameter) codeParts.push(String(part.diameter));
//   if (part.width) codeParts.push(String(part.width));
//   if (part.thickness) codeParts.push(String(part.thickness));
//   if (part.className) codeParts.push(part.className);

//   const code = codeParts.join('_');

//  // 🔹 cache
//   const cached = getElementFromCache(code);
//   if (cached) return cached;

//   // 🔹 існує?
//   const existing = repo.findByCode(code);
//   if (existing) {
//     const short = toShort(existing);
//     addElementToCache(short);
//     return short;
//   }

// // 🔥 3. створення
//   const id = generateIdByType(type);

//    const row = {
//     ID: id,
//     Code: code,
//     PrefixName: part.prefixName,
//     Name: buildMaterialName(part),

//     Type: type,              // 🔥 через catalog
//     Category: category,      // 🔥 через catalog
//     BaseUnit: 'кг',          // 👉 поки ок
//     Density: 7850,           // 👉 потім винесеш у Materials

//     CreatedAt: new Date(),
//   };

//   repo.insert(row);

//   const short = {
//     id,
//     code,
//     baseUnit: row.BaseUnit,
//     type: row.Type,
//   };

//   addElementToCache(short);

//   return short;
// }

function buildMaterialName(
  part: BuiltElement,
  catalogHelper: CatalogHelper,
): string {
  const category = catalogHelper.getCategory(part.prefixName);

  switch (category) {
    case 'rebar':
      return `Арматура Ø${part.diameter} ${part.className ?? ''}`;

    case 'pipe':
      return `Труба Ø${part.diameter} t=${part.thickness}`;

    case 'plate':
      return `Полоса ${part.width}x${part.thickness}`;

    default:
      return part.name;
  }
}

export function findMaterialForPart(
  part: BuiltElement,
  materialRepo: MaterialRepository,
  catalogHelper: CatalogHelper,
): Material {
  const category = catalogHelper.getCategory(part.prefixName);
  if (category !== 'rebar') {
    throw new Error('Material lookup not implemented for: ' + category);
  }

  const material = materialRepo.findRebar(part.diameter!, part.className!);

  if (!material) {
    throw new Error(
      `❌ Material not found: Ø${part.diameter} ${part.className}`,
    );
  }

  return material;
}
// export function getOrCreateMaterialFromPart(
//   part: BuiltElement,
//   repo: ElementRepository,
// ): ElementShort {

//   // 🔒 поки тільки арматура
//   if (part.category !== 'rebar') {
//     throw new Error('Material builder not implemented for: ' + part.category);
//   }

//   if (!part.diameter) {
//     throw new Error('Rebar diameter is required');
//   }

//   const code = ['R', part.diameter, part.className].filter(Boolean).join('_');

//   // 🔥 CACHE
//   const cached = getElementFromCache(code);
//   if (cached) return cached;

//   // 🔍 REPO
//   const existing = repo.findByCode(code);
//   if (existing) {
//     const short: ElementShort = {
//       id: existing.id,
//       code: existing.code,
//       baseUnit: existing.baseUnit,
//       type: existing.type,
//     };

//     addElementToCache(short);
//     return short;
//   }

//   // 🆕 CREATE
//   const id = generateIdByType(ELEMENT_TYPES.MATERIAL);

//   const baseUnit = getMaterialUnit(part.category);

//   repo.insert({
//     ID: id,
//     Code: code,
//     Name: `Арматура Ø${part.diameter} ${part.className ?? ''}`,
//     Type: ELEMENT_TYPES.MATERIAL,
//     Category: part.category,
//     BaseUnit: baseUnit,

//     Diameter: part.diameter,
//     Class: part.className,
//     WeightPerUnit: calcRebarWeightPerMeter(part.diameter),
//     Density: 7850,

//     CreatedAt: new Date(),
//   });

//   const short: ElementShort = {
//     id,
//     code,
//     baseUnit,
//     type: ELEMENT_TYPES.MATERIAL,
//   };

//   addElementToCache(short);

//   return short;
// }
