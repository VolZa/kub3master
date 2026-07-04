import { SpreadsheetRegistry } from '../spreadsheets/SpreadsheetRegistry';

import { SheetConfig } from './SheetConfig';
import { SheetKey } from './SheetKey';

export class SheetProvider {
  constructor(
    private readonly spreadsheetRegistry = new SpreadsheetRegistry(),
  ) {}

  get(key: SheetKey): GoogleAppsScript.Spreadsheet.Sheet {
    const definition = SheetConfig[key];

    const spreadsheet = this.spreadsheetRegistry.get(definition.spreadsheet);

    const sheet = spreadsheet.getSheetByName(definition.name);

    if (!sheet) {
      throw new Error(`Аркуш "${definition.name}" (${key}) не знайдено.`);
    }

    return sheet;
  }
}

export const sheetProvider = new SheetProvider();
