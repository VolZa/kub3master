import { getSheetByNameSafe } from '../../utils/sheets';
import { forceText, insertRows } from '../../utils/sheets.utils';

export function insertBOMRows(rows: any[][]) {
  console.log('INPUT ROWS:', JSON.stringify(rows, null, 2));
  const sheet = getSheetByNameSafe('01_BOM');

  if (!rows.length) return;

  // 🔥 читаємо тільки потрібні колонки A:B:C
  const lastRow = sheet.getLastRow();

  const existing =
    lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, 3).getValues() : [];

  // 🔥 будуємо map (ParentID_ChildID → rowIndex)
  const existingMap = new Map<string, number>();

  existing.forEach((r, i) => {
    // const key = `${r[0]}_${r[1]}`;
    const key = `${String(r[0])}_${String(r[1])}`;
    existingMap.set(key, i + 2); // реальний рядок у sheet
  });

  const rowsToInsert: any[][] = [];
  const updates: {
    rowIndex: number;
    newQty: number;
    parentCode: string;
    childCode: string;
  }[] = [];

  for (const r of rows) {
    const parentId = r[0];
    const childId = r[1];
    const qty = Number(r[2]);
    const parentCode = String(r[5] ?? '');
    const childCode = String(r[6] ?? '');

    const key = `${String(parentId)}_${String(childId)}`;

    if (existingMap.has(key)) {
      // 🔥 UPDATE (накопичення Qty)
      const rowIndex = existingMap.get(key)!;

      const currentQty = Number(
        sheet.getRange(rowIndex, 3).getValue(), // колонка C = Qty
      );

      updates.push({
        rowIndex,
        newQty: qty,
        parentCode,
        childCode,
      });
    } else {
      // 🔥 INSERT тільки A–E
      rowsToInsert.push([
        forceText(parentId),
        forceText(childId),
        qty,
        r[3], // Unit
        r[4], // CreatedAt
        parentCode,
        childCode,
      ]);
    }
  }

  // 🔥 1. UPDATE батчем
  updates.forEach((u) => {
    sheet.getRange(u.rowIndex, 3).setValue(u.newQty);
    sheet.getRange(u.rowIndex, 6, 1, 2).setValues([[u.parentCode, u.childCode]]);
  });

  // 🔥 2. INSERT батчем (дуже важливо)
  console.log('ROWS TO INSERT:', JSON.stringify(rowsToInsert, null, 2));
  console.log('UPDATES:', updates.length);

  if (rowsToInsert.length) {
    insertRows(sheet, rowsToInsert);
  }
  console.log(`✔ INSERTED: ${rowsToInsert.length}, UPDATED: ${updates.length}`);
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

  const headers = data[0];
  const parentIdx = headers.indexOf('ParentID');
  const childIdx = headers.indexOf('ChildID');

  const childrenByParent = new Map<string, string[]>();

  for (let i = 1; i < data.length; i++) {
    const parent = String(data[i][parentIdx]);
    const child = String(data[i][childIdx]);
    const children = childrenByParent.get(parent) ?? [];

    children.push(child);
    childrenByParent.set(parent, children);
  }

  const parentsToDelete = new Set<string>();

  function collect(id: string) {
    if (parentsToDelete.has(id)) return;

    parentsToDelete.add(id);

    for (const child of childrenByParent.get(id) ?? []) {
      collect(child);
    }
  }

  collect(String(parentId));

  const filtered = data.filter((row, i) => {
    if (i === 0) return true;
    return !parentsToDelete.has(String(row[parentIdx]));
  });

  sheet.clearContents();
  sheet.getRange(1, 1, filtered.length, filtered[0].length).setValues(filtered);
}
