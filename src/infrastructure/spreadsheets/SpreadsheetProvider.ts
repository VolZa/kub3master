import { SpreadsheetConfig } from './SpreadsheetConfig';
import { SpreadsheetKey } from './SpreadsheetKey';

export class SpreadsheetProvider {
  open(key: SpreadsheetKey): GoogleAppsScript.Spreadsheet.Spreadsheet {
    const info = SpreadsheetConfig[key];

    if (key === SpreadsheetKey.MASTER) {
      return SpreadsheetApp.getActiveSpreadsheet();
    }

    return SpreadsheetApp.openById(info.id);
  }
}
