export class GoogleSheetsMaterialDataSource {
  private sheetName = '05_Materials';

  getRows(): any[][] {
    const sheet = SpreadsheetApp.getActive().getSheetByName(this.sheetName);

    if (!sheet) {
      throw new Error(`Sheet not found: ${this.sheetName}`);
    }

    return sheet.getDataRange().getValues();
  }
}
