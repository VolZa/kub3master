// modules/bom/bom.repository.ts
// import { getSheetByNameSafe } from '../../utils/sheets';

// export function insertBOMRows(rows: any[][]) {
//   const sheet = getSheetByNameSafe('01_BOM');

//   // if (!rows.length) return;

//   // const lastRow = sheet.getLastRow();

//   // // 🔥 беремо тільки A–E
//   // const data = rows.map((r) => [
//   //   r[0], // ParentID
//   //   r[1], // ChildID
//   //   r[2], // Qty
//   //   r[3], // Unit
//   //   r[4], // CreatedAt
//   // ]);

//   // sheet.getRange(lastRow + 1, 1, data.length, 5).setValues(data);

//   const data = sheet.getDataRange().getValues();
//   console.log('📊 EXISTING DATA:', JSON.stringify(data, null, 2));
//   const headers = data[0];
//   const map: Record<string, number> = {};
//   headers.forEach((h, i) => (map[h] = i));

//   // 🔥 будуємо map існуючих
//   const existingMap = new Map<string, number>();

//   for (let i = 1; i < data.length; i++) {
//     const parentId = data[i][map['ParentID']];
//     const childId = data[i][map['ChildID']];

//     const key = `${parentId}_${childId}`;
//     console.log('EXISTING KEY:', key);
//     existingMap.set(key, i); // рядок в таблиці
//   }

//   for (const row of rows) {
//     const parentId = row[0];
//     const childId = row[1];
//     const qty = row[2];

//     const key = `${parentId}_${childId}`;
//     console.log('NEW KEY:', key);
//     if (existingMap.has(key)) {
//       console.log('✅ MATCH FOUND:', key);
//       // 🔥 UPDATE
//       const rowIndex = existingMap.get(key)! + 1;

//       const currentQty = sheet.getRange(rowIndex, map['Qty'] + 1).getValue();

//       sheet
//         .getRange(rowIndex, map['Qty'] + 1)
//         .setValue(Number(currentQty) + Number(qty));
//     } else {
//       console.log('❌ NO MATCH:', key);
//       // 🔥 INSERT
//       sheet.appendRow(row);
//     }
//   }
// }

import { getSheetByNameSafe } from '../../utils/sheets';
import { insertRows } from '../../utils/sheets.utils';

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
  const updates: { rowIndex: number; newQty: number }[] = [];

  for (const r of rows) {
    const parentId = r[0];
    const childId = r[1];
    const qty = Number(r[2]);

    const key = `${String(parentId)}_${String(childId)}`;

    if (existingMap.has(key)) {
      // 🔥 UPDATE (накопичення Qty)
      const rowIndex = existingMap.get(key)!;

      const currentQty = Number(
        sheet.getRange(rowIndex, 3).getValue(), // колонка C = Qty
      );

      updates.push({
        rowIndex,
        newQty: currentQty + qty,
      });
    } else {
      // 🔥 INSERT тільки A–E
      rowsToInsert.push([
        parentId,
        childId,
        qty,
        r[3], // Unit
        r[4], // CreatedAt
      ]);
    }
  }

  // 🔥 1. UPDATE батчем
  updates.forEach((u) => {
    sheet.getRange(u.rowIndex, 3).setValue(u.newQty);
  });

  // 🔥 2. INSERT батчем (дуже важливо)
  console.log('ROWS TO INSERT:', JSON.stringify(rowsToInsert, null, 2));
  console.log('UPDATES:', updates.length);
  // if (rowsToInsert.length) {
  // const startRow = sheet.getLastRow() + 1;

  // sheet.getRange(startRow, 1, rowsToInsert.length, 5).setValues(rowsToInsert);

  // }
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

// export function deleteBOMTree(parentId: string) {
//   const sheet = getSheetByNameSafe('01_BOM');
//   const data = sheet.getDataRange().getValues();

//   if (data.length <= 1) return;

//   const header = data[0];
//   const rows = data.slice(1);

//   // 🔥 будуємо граф parent → children
//   const childrenMap = new Map<string, string[]>();

//   for (const row of rows) {
//     const parent = String(row[0]);
//     const child = String(row[1]);

//     if (!childrenMap.has(parent)) {
//       childrenMap.set(parent, []);
//     }

//     childrenMap.get(parent)!.push(child);
//   }

//   // 🔥 збираємо всі вузли для видалення
//   const toDelete = new Set<string>();

//   function collect(id: string) {
//     if (toDelete.has(id)) return;

//     toDelete.add(id);

//     const children = childrenMap.get(id) || [];

//     for (const child of children) {
//       collect(child);
//     }
//   }

//   collect(String(parentId));

//   // 🔥 фільтруємо рядки
//   const result = [header];

//   for (const row of rows) {
//     const parent = String(row[0]);

//     if (!toDelete.has(parent)) {
//       result.push(row);
//     }
//   }

//   // 🔥 перезапис
//   sheet.clearContents();
//   sheet.getRange(1, 1, result.length, result[0].length).setValues(result);
// }
export function deleteBOMTree(parentId: string) {
  const sheet = getSheetByNameSafe('01_BOM');

  const data = sheet.getDataRange().getValues();

  const headers = data[0];
  const parentIdx = headers.indexOf('ParentID');

  const filtered = data.filter((row, i) => {
    if (i === 0) return true;
    return String(row[parentIdx]) !== String(parentId);
  });

  sheet.clearContents();
  sheet.getRange(1, 1, filtered.length, filtered[0].length).setValues(filtered);
}
