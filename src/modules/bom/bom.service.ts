import { parseSpec } from './parsers/parseSpec';
import { getOrCreateElement } from '../elements/element.factory';
import { getOrCreateAssembly } from '../elements/assembly.service';
import { insertBOMRows } from './bom.repository';
import { mapElementToBOMItem } from './bom.mapper';
import { ElementShort } from '../elements/element.model';
import {
  ElementRepository,
  GoogleSheetsElementRepository,
} from '../elements/element.repository';
import { MockElementRepository } from '../elements/mock/mock.element.repository';
/**
 * Будує один рядок BOM
 */
//1--------------------------------------------------
function buildBOMRow(
  parentId: string,
  line: string,
  now: Date,
  repo: ElementRepository,
): any[] {
  const { spec, qty } = extractSpecAndQty(line);

  const parsed = parseSpec(spec);

  // ✅ нова перевірка
  if (parsed.kind === 'unknown') {
    throw new Error('Не розпізнано: ' + line);
  }

  // ✅ передаємо repo
  const child: ElementShort = getOrCreateElement(parsed, repo);

  const bomItem = mapElementToBOMItem(child);

  return [parentId, child.id, qty, bomItem.unit, now];
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
  const now = new Date();

  const rawRows: any[][] = [];
  const errors: string[] = [];

  for (const line of lines) {
    try {
      const row = buildBOMRow(parentId, line, now, repo);
      console.log('✅ ROW:', row);
      rawRows.push(row);
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

//1--------------------------------------------------
// function buildBOMRow(parentId: string, line: string, now: Date): any[] {
//   const { spec, qty } = extractSpecAndQty(line);

//   const parsed = parseSpec(spec);

//   if (!parsed.detected) {
//     throw new Error('Не розпізнано: ' + line);
//   }

//   const child = getOrCreateElement(parsed);

//   return [
//     parentId,
//     child.id,
//     qty,
//     child.unit, // 🔥 головна зміна
//     now,
//   ];
// }

// function buildBOMRow(parentId: string, line: string, now: Date): any[] {
//   const { spec, qty } = extractSpecAndQty(line);
//   const parsed = parseSpec(spec);

//   if (!parsed.detected) {
//     throw new Error('Не розпізнано: ' + line);
//   }

//   const child: ElementShort = getOrCreateElement(parsed);

//   // 🔥 новий крок
//   const bomItem = mapElementToBOMItem(child);

//   return [
//     parentId,
//     child.id,
//     qty,
//     bomItem.unit, // ✅ через mapper
//     now,
//   ];
// }
//--------------------------------------------------

//2--------------------------------------------------
// export function buildBOMFromText(
//   parentCode: string,
//   text: string,
//   repo: ElementRepository,
// ) {
//   console.log('🔥 START buildBOMFromText');

//   const lines = text
//     .split('\n')
//     .map((l) => l.trim())
//     .filter(Boolean);

//   console.log('LINES:', lines);
//   return 'STOP 1';

//   const rawRows: any[][] = [];
//   const errors: string[] = [];

//   const parent = getOrCreateAssembly(parentCode, repo);
//   const now = new Date();

//   for (let line of lines) {
//     try {
//       const row = buildBOMRow(parent.id, line, now, repo);

//       rawRows.push(row);
//     } catch (e) {
//       errors.push(line);
//     }
//   }

//   // 🔥 АГРЕГАЦІЯ
//   const aggregatedRows = aggregateBOMRows(rawRows);

//   // 🔥 batch insert
//   insertBOMRows(aggregatedRows);

//   return {
//     added: aggregatedRows.length,
//     sourceLines: rawRows.length,
//     errors,
//     errorCount: errors.length,
//   };
// }
//=--------------------------------------------------

// export function buildBOMFromText(data: Input) {
//   console.log('🔥 START buildBOMFromText');
//   console.log('INPUT:', JSON.stringify(data));

//   const lines = data.specification
//     .split('\n')
//     .map((l) => l.trim())
//     .filter(Boolean);

//   console.log('LINES:', lines);

//   // 🔥 НОВИЙ КОД
//   const parsed = lines.map((line) => {
//     const { spec, qty } = extractSpecAndQty(line);

//     return { spec, qty };
//   });

//   console.log('PARSED:', JSON.stringify(parsed, null, 2));

//   // 🔥 КРОК 3
//   const rawRows: any[][] = [];

//   for (const item of parsed) {
//     console.log('PROCESS ITEM:', item);

//     // 🔹 тут тимчасово mock
//     // const parentId = 1000; // поки заглушка
//     // const childId = Math.floor(Math.random() * 10000); // fake ID

//     const child: ElementShort = getOrCreateElement(parsed);
//     rawRows.push([parentId, childId, item.qty]);
//   }

//   console.log('RAW ROWS:', JSON.stringify(rawRows, null, 2));

//   const aggregated = aggregateBOMRows(rawRows);

//   console.log('AGGREGATED:', JSON.stringify(aggregated, null, 2));

//   return 'STOP 4';
// }
