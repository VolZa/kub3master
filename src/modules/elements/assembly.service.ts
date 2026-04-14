import { ElementRepository } from './element.repository';
import { ElementShort } from './element.model';
import { buildAssemblyRow } from './element.mapper';
import { generateIdByType } from '../../utils/id';
import { addElementToCache } from '../../services/cache.service';

import { getSheetByNameSafe } from '../../utils/sheets';

export function getOrCreateAssembly(
  code: string,
  repo: ElementRepository,
): ElementShort {
  // 🔍 1. шукаємо
  const existing = repo.findByCode(code);

  if (existing) {
    const short: ElementShort = {
      id: existing.id,
      code: existing.code,
      baseUnit: existing.baseUnit,
    };

    addElementToCache(short);

    return short;
  }

  // 🆕 2. створюємо
  const id = generateIdByType('assembly');

  const row = buildAssemblyRow(id, code);

  repo.insert(row);

  // 🔁 3. формуємо domain → short
  const short: ElementShort = {
    id,
    code,
    baseUnit: row.BaseUnit,
  };

  addElementToCache(short);

  return short;
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

    const weight = element.weightPerUnit ?? 0;

    total += qty * weight;
  }

  return total;
}
