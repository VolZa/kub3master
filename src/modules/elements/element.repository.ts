import { getSheetByNameSafe } from '../../utils/sheets';
import { ElementFull, ElementRow, ParsedPart } from './element.model';
import {
  mapSheetRowToElementRow,
  mapElementRowToDomain,
  mapElementToRow,
} from './element.mapper';
import { mapRowToFull } from './element.mapper';
import { ElementType } from '../../config/config';
import { forceText } from '../../utils/sheets.utils';

export interface ElementRepository {
  findById(id: string): ElementFull | null;
  findByCode(code: string): ElementFull | null;
  findByCodeNormalized(code: string): ElementFull | null;
  insert(row: ElementRow): void;
  updateType(id: string, type: string): void;
}

export class GoogleSheetsElementRepository implements ElementRepository {
  private SHEET_NAME = '00_Elements';

  private sheet: GoogleAppsScript.Spreadsheet.Sheet;
  private headerMap: Record<string, number>;
  private rows: ElementRow[];

  constructor() {
    this.sheet = getSheetByNameSafe(this.SHEET_NAME);

    const data = this.sheet.getDataRange().getValues();

    if (!data.length) {
      this.headerMap = {};
      this.rows = [];
      return;
    }

    const [headers, ...values] = data;

    this.headerMap = this.buildHeaderMap(headers);

    this.rows = values.map((row) =>
      mapSheetRowToElementRow(row, this.headerMap),
    );
  }

  insert(row: ElementRow): void {
    const sheet = getSheetByNameSafe(this.SHEET_NAME);

    // const asText = (v: any) => `'${String(v)}`;

    sheet.appendRow([
      forceText(row.ID), // 🔥 гарантія string
      forceText(row.Code), // 🔥 гарантія string

      row.PrefixName, // 🔥 ДОДАТИ СЮДИ
      row.Name,
      row.Type,
      row.Category,
      row.BaseUnit,

      row.ProfileType ?? '',
      row.ParentMaterialID ? forceText(row.ParentMaterialID) : '',

      row.Diameter ?? '',
      row.Class ?? '',

      row.Width ?? '',
      row.Height ?? '',
      row.Length ?? '',
      row.Thickness ?? '',

      row.IsActive ?? true,

      row.Comment ?? '',

      row.CreatedAt instanceof Date ? row.CreatedAt : new Date(),
    ]);

    this.rows.push(row); // оновлюємо локальний кеш після вставки
    console.log('📥 INSERT ROW TO SHEET:', row);
  }

  findById(id: string): ElementFull | null {
    const row = this.rows.find((r) => r.ID === id);
    return row ? mapElementRowToDomain(row) : null;
  }

  findByCode(code: string): ElementFull | null {
    const row = this.rows.find((r) => r.Code === code);
    return row ? mapElementRowToDomain(row) : null;
  }

  findByCodeNormalized(code: string): ElementFull | null {
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

    const target = norm(code);

    const row = this.rows.find((r) => norm(r.Code) === target);

    return row ? mapElementRowToDomain(row) : null;
  }

  findPart(part: ParsedPart) {
    return this.rows.find(
      (r) =>
        r.Type === 'part' &&
        r.Diameter === part.diameter &&
        r.Class === part.class &&
        r.Length === part.length,
    );
  }

  updateType(id: string, type: ElementType): void {
    const data = this.sheet.getDataRange().getValues();

    const [headers, ...rows] = data;

    const idCol = headers.indexOf('ID');
    const typeCol = headers.indexOf('Type');

    if (idCol === -1 || typeCol === -1) {
      throw new Error('Columns ID or Type not found');
    }

    for (let i = 0; i < rows.length; i++) {
      if (rows[i][idCol] === id) {
        const rowIndex = i + 2; // +1 header, +1 index

        this.sheet.getRange(rowIndex, typeCol + 1).setValue(type);

        // 🔥 оновлюємо кеш
        this.rows[i].Type = type;

        return;
      }
    }

    throw new Error(`Element with id ${id} not found`);
  }

  private buildHeaderMap(headers: string[]): Record<string, number> {
    const map: Record<string, number> = {};
    headers.forEach((h, i) => (map[h] = i));
    return map;
  }
}
