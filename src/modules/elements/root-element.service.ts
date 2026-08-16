// src\modules\elements\root-element.service.ts

import { ElementRepository } from './element.repository';
import { ElementShort, ElementFull } from './element.model';
import { buildAssemblyRow } from './element.mapper';
import { generateIdByType } from '../../utils/id';
import { addElementToCache } from '../../services/cache.service';

import { getSheetByNameSafe } from '../../utils/sheets';
import { ELEMENT_TYPES } from '../../config/config';
import { CatalogHelper } from 'modules/catalog/catalog.helper';
import { resolveElementType } from './element-type.resolver';

export function getOrCreateAssembly(
  code: string,
  projectDocumentID: string,
  repo: ElementRepository,
): ElementShort {
  // 🔍 1. шукаємо
  const existing = repo.findByCode(code, projectDocumentID);

  if (existing) {
    const short: ElementShort = {
      id: existing.id,
      code: existing.code,
      baseUnit: existing.baseUnit,
      type: existing.type, // 🔥
    };

    addElementToCache(short);

    return short;
  }

  // 🆕 2. створюємо
  const id = generateIdByType('assembly');

  const row = buildAssemblyRow(id, code);
  console.log('getOrCreateAssembly - Creating new assembly row:', row);
  repo.insert(row);

  // 🔁 3. формуємо domain → short
  const short: ElementShort = {
    id,
    code,
    baseUnit: row.BaseUnit,
    type: 'assembly', // 🔥
  };

  addElementToCache(short);

  return short;
}

export function getOrCreateRootElement(
  code: string,
  projectDocumentID: string,
  prefixName: string,
  name: string,
  repo: ElementRepository,
  catalogHelper: CatalogHelper,
): ElementFull {
  // 🔹 1. Вже існує?
  const existing = repo.findByCode(code, projectDocumentID);

  if (existing) {
    return existing;
  }

  // 🔹 2. Визначаємо шаблон
  const template = catalogHelper.resolveTemplate(prefixName);

  // 🔹 3. Визначаємо тип
  const type = resolveElementType(template);

  // 🔹 4. Генеруємо ID
  const id = generateIdByType(type);

  // 🔹 5. Створюємо елемент
  repo.insert({
    ID: id,
    Code: code,

    ProjectDocumentID: projectDocumentID,

    PrefixName: prefixName,
    Name: name || code,

    Type: type,

    Category: template.category,
    ProfileType: template.profileType ?? '',

    BaseUnit: 'шт',

    IsActive: true,
    Comment: '',
    CreatedAt: new Date(),
  });

  const created = repo.findById(id);

  if (!created) {
    throw new Error(`Failed to create ${type}: ${code}`);
  }

  return created;
}

export function calcAssemblyWeight(
  assemblyId: string,
  repo: ElementRepository,
): number {
  const sheet = getSheetByNameSafe('01_BOM');
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  const parentIdx = headers.indexOf('ParentID');
  const childIdx = headers.indexOf('ChildID');
  const qtyIdx = headers.indexOf('Qty');

  let total = 0;

  for (let i = 1; i < data.length; i++) {
    const parentId = String(data[i][parentIdx]);

    if (parentId !== assemblyId) continue;

    const childId = String(data[i][childIdx]);
    const qty = Number(data[i][qtyIdx] || 0);

    // 🔥 беремо element
    const element = repo.findById(childId);

    if (!element) continue;

    // TODO: calculate assembly weight from BOM/material batches after removing element-level Weight.
    const weight = 0;

    total += qty * weight;
  }

  return total;
}
