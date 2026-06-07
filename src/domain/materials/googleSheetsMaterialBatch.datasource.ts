export class GoogleSheetsMaterialBatchDataSource {
  private sheetName = '06_MaterialBatches'; // ⚠️ перевір назву

  getRows(): any[][] {
    const sheet = SpreadsheetApp.getActive().getSheetByName(this.sheetName);

    if (!sheet) {
      throw new Error(`Sheet not found: ${this.sheetName}`);
    }

    return sheet.getDataRange().getValues();
  }
}
