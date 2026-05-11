import { getSheetByNameSafe } from '../../../utils/sheets';

export class GoogleSheetsCatalogDataSource {
  private readonly SHEET_NAME = '04_Catalog';

  getRows(): any[][] {
    const sheet = getSheetByNameSafe(this.SHEET_NAME);
    return sheet.getDataRange().getValues();
  }

  appendRow(row: any[]) {
    const sheet = getSheetByNameSafe(this.SHEET_NAME);
    sheet.appendRow(row);
  }
}
