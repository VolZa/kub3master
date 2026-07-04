import { SpreadsheetKey } from '../spreadsheets/SpreadsheetKey';
import { SheetKey } from './SheetKey';

export interface SheetDefinition {
  /** Логічний ключ аркуша */
  key: SheetKey;

  /** Логічна книга, в якій знаходиться аркуш */
  spreadsheet: SpreadsheetKey;

  /** Фактична назва аркуша в Google Sheets */
  name: string;
}
