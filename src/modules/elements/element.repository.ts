import { getSheetByNameSafe } from '../../utils/sheets';
import { ElementFull, ElementRow } from './element.model';
import {
  mapSheetRowToElementRow,
  mapElementRowToDomain,
  mapElementToRow,
} from './element.mapper';

export interface ElementRepository {
  findByCode(code: string): ElementFull | null;
  insert(row: ElementRow): void;
}

export class GoogleSheetsElementRepository implements ElementRepository {
  private SHEET_NAME = '00_Elements';

  insert(row: ElementRow): void {
    const sheet = getSheetByNameSafe(this.SHEET_NAME);

    sheet.appendRow([
      row.ID,
      row.Code,
      row.Name,
      row.Type,
      row.Category,
      row.BaseUnit,
      row.ProfileType || '',
      row.ParentMaterialID || '',
      row.Diameter || '',
      row.Class || '',
      row.Width || '',
      row.Length || '',
      row.Thickness || '',
      row.IsActive ?? true,
      row.ParentType || '',
      row.WeightPerUnit || '',
      row.Density || '',
      row.Comment || '',
      row.CreatedAt || new Date(),
    ]);
    console.log('📥 INSERT ROW TO SHEET:', row);
  }

  findByCode(code: string): ElementFull | null {
    console.log('🔎 SEARCH IN SHEET:', code);
    const sheet = getSheetByNameSafe(this.SHEET_NAME);

    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const map = this.buildHeaderMap(headers);

    for (let i = 1; i < data.length; i++) {
      const rowArray = data[i];
      const row = mapSheetRowToElementRow(rowArray, map);

      if (row.Code === code) {
        return mapElementRowToDomain(row);
      }
    }

    return null;
  }

  private buildHeaderMap(headers: string[]): Record<string, number> {
    const map: Record<string, number> = {};
    headers.forEach((h, i) => (map[h] = i));
    return map;
  }
}
//
// export class GoogleSheetsElementRepository {
//   private SHEET_NAME = '00_Elements';

//   // 🔹 insert (типобезпечний)
//   insert(row: ElementRow): void {
//     const sheet = getSheetByNameSafe(this.SHEET_NAME);

//     sheet.appendRow([
//       row.ID,
//       row.Code,
//       row.Name,
//       row.Type,
//       row.Category,
//       row.BaseUnit,
//       row.ProfileType || '',
//       row.ParentMaterialID || '',
//       row.Diameter || '',
//       row.Class || '',
//       row.Width || '',
//       row.Length || '',
//       row.Thickness || '',
//       row.IsActive ?? true,
//       row.ParentType || '',
//       row.WeightPerUnit || '',
//       row.Density || '',
//       row.Comment || '',
//       row.CreatedAt || new Date(),
//     ]);
//   }

//   // 🔹 findByCode → повертає domain модель
//   findByCode(code: string): ElementFull | null {
//     const sheet = getSheetByNameSafe(this.SHEET_NAME);

//     const data = sheet.getDataRange().getValues();
//     const headers = data[0];

//     const map = this.buildHeaderMap(headers);

//     for (let i = 1; i < data.length; i++) {
//       const rowArray = data[i];

//       const row: ElementRow = mapSheetRowToElementRow(rowArray, map);

//       if (row.Code === code) {
//         return mapElementRowToDomain(row);
//       }
//     }

//     return null;
//   }

//   // 🔹 save → працює з domain
//   save(element: ElementFull): ElementFull {
//     const sheet = getSheetByNameSafe(this.SHEET_NAME);

//     const id = String(sheet.getLastRow() + 1);

//     const row: ElementRow = mapElementToRow({
//       ...element,
//       id,
//     });

//     this.insert(row);

//     return {
//       ...element,
//       id,
//     };
//   }

//   // 🔹 helper
//   private buildHeaderMap(headers: string[]): Record<string, number> {
//     const map: Record<string, number> = {};

//     headers.forEach((h, i) => {
//       map[h] = i;
//     });

//     return map;
//   }
// }

// export function getOrCreateElement(
//   parsed: ParsedSpec,
//   repo: ElementRepository,
// ) {
//   if (parsed.kind === 'unknown') {
//     throw new Error('Spec not recognized');
//   }

//   let built;

//   switch (parsed.kind) {
//     case 'rebar':
//       built = buildRebar(parsed);
//       break;

//     case 'angle':
//       built = buildAngle(parsed);
//       break;

//     case 'plate':
//       built = buildPlate(parsed);
//       break;

//     default:
//       throw new Error(`Builder not implemented for kind: ${parsed.kind}`);
//   }

//   // 🔍 шукаємо
//   const existing = repo.findByCode(built.code);

//   if (existing) return existing;

//   // 🆕 створюємо
//   const id = generateId(built.type);

//   const row = buildElementRow(built, id);

//   repo.insert(row);

//   return {
//     id,
//     code: built.code,
//     baseUnit: built.baseUnit,
//   };
// }
