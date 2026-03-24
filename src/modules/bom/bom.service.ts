import { parseSpec } from './bom.parser';
import { getOrCreateElement } from '../elements/element.factory';
import { getOrCreateAssembly } from '../elements/assembly.service';
import { insertBOMRows } from './bom.repository';

/**
 * Будує один рядок BOM
 */
function buildBOMRow(parentId: string, line: string, now: Date): any[] {
  const { spec, qty } = extractSpecAndQty(line);

  const parsed = parseSpec(spec);

  if (!parsed.detected) {
    throw new Error('Не розпізнано: ' + line);
  }

  const child = getOrCreateElement(parsed);

  return [
    parentId,
    child.id,
    qty,
    child.unit, // 🔥 головна зміна
    now,
  ];
}

/**
 * Масове створення BOM з тексту
 */
export function buildBOMFromText(parentCode: string, text: string) {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const rawRows: any[][] = [];
  const errors: string[] = [];

  const parent = getOrCreateAssembly(parentCode);
  const now = new Date();

  for (let line of lines) {
    try {
      const row = buildBOMRow(parent.id, line, now);

      rawRows.push(row);
    } catch (e) {
      errors.push(line);
    }
  }

  // 🔥 АГРЕГАЦІЯ
  const aggregatedRows = aggregateBOMRows(rawRows);

  // 🔥 batch insert
  insertBOMRows(aggregatedRows);

  return {
    added: aggregatedRows.length,
    sourceLines: rawRows.length,
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
