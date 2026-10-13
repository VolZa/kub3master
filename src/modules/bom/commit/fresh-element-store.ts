/**
 * Path: C:/www/26/03/kub3master-ts/src/modules/bom/commit/fresh-element-store.ts
 * Module: BOM commit
 * Layer: Infrastructure
 * Responsibility: uncached MASTER ElementRow reads and header-aligned insert under caller-owned lock.
 */
import { SpreadsheetProvider } from '../../../infrastructure/spreadsheets/SpreadsheetProvider';
import { SpreadsheetKey } from '../../../infrastructure/spreadsheets/SpreadsheetKey';
import { requireScriptLock } from '../../../utils/script-lock';
import { normalizeElementId } from '../../elements/element.mapper';
import type { ElementRow } from '../../elements/element.model';
import type { ElementRepository } from '../../elements/element.repository';
export const ELEMENT_COLUMNS = ['ID', 'Code', 'PrefixName', 'Name', 'Type', 'ProjectDocumentID', 'ParentMaterialID', 'Category', 'BaseUnit', 'ProfileType', 'Diameter', 'Class', 'Width', 'Height', 'Length', 'Thickness', 'IsActive', 'Comment', 'CreatedAt'] as const;
export interface FreshElementStore extends Pick<ElementRepository, 'insert'> { read(): ElementRow[] }
/** Empty optional cells and repository defaults have one physical comparison representation. */
export function physicalElement(row: ElementRow): Record<string, unknown> {
  return Object.fromEntries(ELEMENT_COLUMNS.map(key => [key,
    key === 'IsActive' ? row[key] ?? true : key === 'ID' ? normalizeElementId(row[key]) :
    key === 'ParentMaterialID' && row[key] ? normalizeElementId(row[key]) :
    key === 'ProjectDocumentID' && row[key] !== undefined && row[key] !== '' ? String(row[key]) : row[key] ?? '']));
}
export class MasterFreshElementStore implements FreshElementStore {
  constructor(private readonly lock: GoogleAppsScript.Lock.Lock) {}
  private table() {
    requireScriptLock(this.lock);
    const sheet = new SpreadsheetProvider().open(SpreadsheetKey.MASTER).getSheetByName('00_Elements');
    if (!sheet) throw new Error('00_Elements missing in MASTER');
    const data = sheet.getDataRange().getValues();
    const headers = data[0] as string[];
    if (!headers || ELEMENT_COLUMNS.some(key => headers.filter(value => value === key).length !== 1)) throw new Error('Invalid 00_Elements schema');
    return { sheet, headers, values: data.slice(1) };
  }
  read(): ElementRow[] {
    const { headers, values } = this.table();
    return values.filter(row => row.some(value => value !== '' && value != null)).map(values => {
      const row = Object.fromEntries(ELEMENT_COLUMNS.map(key => [key, values[headers.indexOf(key)]])) as unknown as ElementRow;
      const normalized = physicalElement(row);
      for (const key of ['ProfileType', 'Diameter', 'Class', 'Width', 'Height', 'Length', 'Thickness']) {
        if (normalized[key] === '') normalized[key] = undefined;
      }
      return normalized as unknown as ElementRow;
    });
  }
  insert(row: ElementRow): void {
    const { sheet, headers } = this.table();
    const canonical = physicalElement(row);
    // Extra columns are never guessed: schema must be reviewed before mutation.
    if (headers.some(key => !ELEMENT_COLUMNS.includes(key as typeof ELEMENT_COLUMNS[number]))) throw new Error('Unreviewed Element column');
    sheet.appendRow(headers.map(key => {
      const value = canonical[key];
      return typeof value === 'string' && value !== '' ? `'${value}` : value;
    }));
    SpreadsheetApp.flush();
  }
}
