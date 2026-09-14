import { SpreadsheetConfig } from './SpreadsheetConfig';
import { SpreadsheetKey } from './SpreadsheetKey';

export class SpreadsheetProvider {
  open(key: SpreadsheetKey): GoogleAppsScript.Spreadsheet.Spreadsheet {
    const info = SpreadsheetConfig[key];

    return SpreadsheetApp.openById(info.id);
  }
}
