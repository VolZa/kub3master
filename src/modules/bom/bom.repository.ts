// modules/bom/bom.repository.ts
import { getSheetByNameSafe } from '../../utils/sheets';

export function insertBOMRows(rows: any[][]) {
  console.log('🔥 BUILD BOM CALLED');
  if (!rows.length) return;

  const sheet = getSheetByNameSafe('01_BOM');

  const startRow = sheet.getLastRow() + 1;

  sheet.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);
}

export function deleteBOMByParentId(parentId: string) {
  const sheet = getSheetByNameSafe('01_BOM');
  const data = sheet.getDataRange().getValues();

  if (data.length <= 1) return;

  const rowsToKeep = [data[0]]; // header

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) !== String(parentId)) {
      rowsToKeep.push(data[i]);
    }
  }

  sheet.clearContents();
  sheet
    .getRange(1, 1, rowsToKeep.length, rowsToKeep[0].length)
    .setValues(rowsToKeep);
}

export function deleteBOMTree(parentId: string) {
  const sheet = getSheetByNameSafe('01_BOM');
  const data = sheet.getDataRange().getValues();

  if (data.length <= 1) return;

  const header = data[0];
  const rows = data.slice(1);

  // 🔥 будуємо граф parent → children
  const childrenMap = new Map<string, string[]>();

  for (const row of rows) {
    const parent = String(row[0]);
    const child = String(row[1]);

    if (!childrenMap.has(parent)) {
      childrenMap.set(parent, []);
    }

    childrenMap.get(parent)!.push(child);
  }

  // 🔥 збираємо всі вузли для видалення
  const toDelete = new Set<string>();

  function collect(id: string) {
    if (toDelete.has(id)) return;

    toDelete.add(id);

    const children = childrenMap.get(id) || [];

    for (const child of children) {
      collect(child);
    }
  }

  collect(String(parentId));

  // 🔥 фільтруємо рядки
  const result = [header];

  for (const row of rows) {
    const parent = String(row[0]);

    if (!toDelete.has(parent)) {
      result.push(row);
    }
  }

  // 🔥 перезапис
  sheet.clearContents();
  sheet.getRange(1, 1, result.length, result[0].length).setValues(result);
}
