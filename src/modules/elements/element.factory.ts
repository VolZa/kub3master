import { ParsedSpec } from '../bom/model/parsed-spec.model';
import { ElementRepository } from './element.repository';
import { ElementShort, ElementFull, ElementRow } from './element.model';
import { buildByKind } from './builders/builder.dispatcher';
// import { buildElementRow } from './element.mapper';
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
import { MaterialBatchRepository } from '../../domain/materials/material-batch.repository';
import { CatalogHelper } from '../catalog/catalog.helper';

export function getOrCreateElementFromBuilt(
  built: BuiltElement,
  elementRepo: ElementRepository,
  catalogHelper: CatalogHelper,
  materialRepo: MaterialRepository,
  materialBatchRepo: MaterialBatchRepository,
): ElementFull {
  console.log('getOrCreateElementFromBuilt with built:', built);
  // 🔹 1. вже існує?
  let existing = elementRepo.findByCode(built.code);
  if (existing) return existing;

  // 🔥 2. Catalog через helper
  const catalog = catalogHelper.get(built.prefixName);

  const catalogType = catalog.type;
  const category = catalog.category;
  const profileType = catalog.profileType || '';

  // 🔥 визначення типу
  const isPart = built.length !== undefined;
  const type = isPart ? 'part' : catalogType;

  // 🔥 material
  let material;

  if (type === 'material') {
    console.log('Шукаємо матеріал для', built.code);
    material = materialRepo.findByCode(built.code);
  }

  if (type === 'part') {
    const baseCode = built.code.split('_L')[0];
    console.log(
      'Шукаємо матеріал для',
      built.code,
      'за базовим кодом',
      baseCode,
    );

    material = materialRepo.findByCode(baseCode);

    if (!material) {
      // material = getOrCreateMaterialFromPart(built, elementRepo, catalogHelper);
      materialRepo.findBySpec({
        profileType,
        diameter: built.diameter,
        class: built.className,
        width: built.width,
        height: built.height,
        thickness: built.thickness,
      });

      if (!material) {
        throw new Error('Material not found in 05_Materials');
      }
    }
  }

  // 🔥 base unit
  const baseUnit = type === 'material' ? material?.baseUnit || 'кг' : 'шт';
  // 🔹 5. ID
  const id = generateIdByType(type);

  // 🔥 6. створення
  const row: ElementRow = {
    ID: id,
    Code: built.code,
    PrefixName: built.prefixName,
    Name: built.name,

    Type: type,
    Category: category,
    ProfileType: profileType,
    BaseUnit: baseUnit,

    ParentMaterialID: material?.id || '',

    Diameter: built.diameter,
    Class: built.className,
    Length: built.length,

    Width: built.width,
    Height: built.height,
    Thickness: built.thickness,

    IsActive: true,
    ParentType: '',
    WeightPerUnit: undefined,
    Density: undefined,
    Comment: '',
    CreatedAt: new Date(),
  };
  console.log('FINAL CODE BEFORE INSERT:', built.code);
  elementRepo.insert(row);

  const created = elementRepo.findByCode(built.code);

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
  materialBatchRepo: MaterialBatchRepository,
): ElementShort {
  // 🔹 1. build
  const built = buildByKind(parsed);

  // 🔹 2. cache key
  const type = catalogHelper.getType(built.prefixName);
  const cacheKey = `${type}:${built.code}`;

  const cached = getElementFromCache(cacheKey);
  if (cached) return cached;

  // 🔹 3. існує?
  const existing = repo.findByCode(built.code);
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
    materialBatchRepo,
  );

  const short: ElementShort = {
    id: element.id,
    code: element.code,
    baseUnit: element.baseUnit,
    type: element.type,
  };

  addElementToCache(short);

  return short;
}
