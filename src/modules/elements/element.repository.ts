import { getSheetByNameSafe } from '../../utils/sheets';
import { ElementFull, ElementRow } from './element.model';
import {
  mapSheetRowToElementRow,
  mapElementRowToDomain,
  mapElementToRow,
} from './element.mapper';
import { mapRowToFull } from './element.mapper';

export interface ElementRepository {
  findById(id: string): ElementFull | null;
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

  findById(id: string): ElementFull | null {
    const sheet = getSheetByNameSafe('00_Elements');
    const data = sheet.getDataRange().getValues();

    if (!data.length) return null;

    const headers = data[0];
    const idIdx = headers.indexOf('ID');

    if (idIdx === -1) {
      throw new Error('Column ID not found in 00_Elements');
    }

    for (let i = 1; i < data.length; i++) {
      const rowId = String(data[i][idIdx]);

      if (rowId === id) {
        return mapRowToFull(data[i], headers); // ✅ без this
      }
    }

    return null;
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
