import { parseSpec } from './parsers/parseSpec';
import { getOrCreateElement } from '../elements/element.factory';
import { getOrCreateAssembly } from '../elements/assembly.service';
import { deleteBOMTree, insertBOMRows } from './bom.repository';
import { mapElementToBOMItem } from './bom.mapper';
import { ElementShort } from '../elements/element.model';
import {
  ElementRepository,
  GoogleSheetsElementRepository,
} from '../elements/element.repository';
import { MockElementRepository } from '../elements/mock/mock.element.repository';
import { getOrCreateMaterialFromPart } from '../../domain/materials/material.service';
import { buildByKind } from '../../modules/elements/builders/builder.dispatcher';
import { deleteBOMByParentId } from './bom.repository';
/* Будує один рядок BOM
 */

function buildBOMRow(
  parentId: string,
  line: string,
  now: Date,
  repo: ElementRepository,
): any[][] {
  const { spec, qty } = extractSpecAndQty(line);
  const safeQty = qty ?? 1;

  const parsed = parseSpec(spec);

  if (parsed.kind === 'unknown') {
    throw new Error('Не розпізнано: ' + line);
  }

  // 🔥 спроба знайти як assembly
  // const existingAssembly = repo.findByCode(spec);
  const existingAssembly = repo.findByCodeNormalized(spec);

  if (existingAssembly && existingAssembly.type === 'assembly') {
    return [[parentId, existingAssembly.id, safeQty, 'шт', now]];
  }

  // 🔥 1. build
  const built = buildByKind(parsed);

  // 🔥 визначаємо тип
  if (built.type === 'assembly') {
    // 🔥 але створюємо через assembly factory
    const assembly = getOrCreateAssembly(spec, repo);

    return [[parentId, assembly.id, safeQty, 'шт', now]];
  }

  // 🔥 assembly
  // if (built.type === 'assembly') {
  //   // const assembly = getOrCreateAssembly(built.code, repo);
  //   const assembly = getOrCreateAssembly(parsed.code , repo);
  //   return [[parentId, assembly.id, safeQty, 'шт', now]];
  // }

  // const element = getOrCreateElement(parsed, repo);

  // if (element.type === 'assembly') {
  //   return [[parentId, element.id, safeQty, 'шт', now]];
  // }

  // 🔥 2. qty для material
  let materialQty = safeQty;

  if (
    built.category === 'rebar' &&
    typeof built.length === 'number' &&
    typeof built.diameter === 'number'
  ) {
    materialQty = calcRebarWeight(built.length, built.diameter, safeQty);
    materialQty = Math.round(materialQty * 100) / 100; // округлення до 2 знаків
  }

  // 🔥 3. part
  const part = getOrCreateElement(parsed, repo);

  // 🔥 4. material
  const material = getOrCreateMaterialFromPart(built, repo);

  const partItem = mapElementToBOMItem(part);

  return [
    [parentId, part.id, safeQty, partItem.unit, now],
    [part.id, material.id, materialQty, 'кг', now],
  ];
}

/**
 * Масове створення BOM з тексту
 */
//2--------------------------------------------------

type Input = {
  parentCode: string;
  specification: string;
};
//було BOMService.js
// function buildBOMFromText(parentCode, specText) {
//   const lines = specText.split('\n').map(l => l.trim()).filter(Boolean);
export function buildBOMFromText(data: Input) {
  console.log('🔥 START buildBOMFromText');
  console.log('INPUT:', JSON.stringify(data));

  const lines = data.specification
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  console.log('LINES:', lines);

  const repo = new GoogleSheetsElementRepository();
  // const repo = new ElementRepository();
  // const repo = new MockElementRepository();

  const parent = getOrCreateAssembly(data.parentCode, repo);
  const parentId = parent.id;
  deleteBOMTree(parentId);
  const now = new Date();

  const rawRows: any[][] = [];
  const errors: string[] = [];

  for (const line of lines) {
    try {
      const row = buildBOMRow(parentId, line, now, repo);
      console.log('✅ ROW:', ...row);
      rawRows.push(...row);
    } catch (e) {
      console.error('ERROR LINE:', line, e);
      errors.push(line);
    }
  }

  console.log('RAW ROWS:', JSON.stringify(rawRows, null, 2));

  const aggregated = aggregateBOMRows(rawRows);

  console.log('AGGREGATED:', JSON.stringify(aggregated, null, 2));

  insertBOMRows(aggregated);

  console.log('✅ BOM INSERTED');

  return {
    added: aggregated.length,
    errors,
    errorCount: errors.length,
  };
}

function aggregateBOMRows(rows: any[][]): any[][] {
  const map = new Map<string, any[]>();

  for (const row of rows) {
    const parentId = row[0];
    const childId = row[1];
    const qty = Number(row[2]);

    const key = `${parentId}_${childId}`;

    if (map.has(key)) {
      const existing = map.get(key)!;
      existing[2] += qty; // 🔥 сумуємо qty
    } else {
      // копіюємо, щоб не мутувати оригінал
      map.set(key, [...row]);
    }
  }

  return Array.from(map.values());
}

function extractSpecAndQty(line: string): {
  spec: string;
  qty: number;
} {
  const parts = line.trim().split(/\s+/);

  if (parts.length === 0) {
    throw new Error('Empty line');
  }

  const last = parts[parts.length - 1];

  // якщо останнє значення — число → qty
  if (!isNaN(Number(last))) {
    const qty = Number(last);

    if (qty <= 0) {
      throw new Error('Qty <= 0');
    }

    parts.pop();

    return {
      spec: parts.join(' '),
      qty,
    };
  }

  // якщо qty не задано
  return {
    spec: line,
    qty: 1,
  };
}
//debug
import { debug } from '../../utils/debug';
import { calcRebarWeight } from '../../utils/rebar';

type CreateBOMInput = {
  parentCode: string;
  specification: string;
};

function _createBOM(data: CreateBOMInput): string {
  console.log('RAW SPEC:\n' + data.specification);

  const lines = data.specification.split('\n');

  const parsed = lines.map((line) => {
    const parts = line.trim().split(' ');
    return {
      name: parts.slice(0, -1).join(' '),
      qty: Number(parts[parts.length - 1]),
    };
  });

  console.log('PARSED:', JSON.stringify(parsed, null, 2));

  return `Parsed ${parsed.length} items`;
}

export const createBOM = debug('createBOM', _createBOM);
