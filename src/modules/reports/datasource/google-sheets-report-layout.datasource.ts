import { getSheetByNameSafe } from '../../../utils/sheets';

export class GoogleSheetsReportLayoutDataSource {
  private readonly SHEET_NAME = '16_ReportLayout_Product';

  getRows(): any[][] {
    const sheet = getSheetByNameSafe(this.SHEET_NAME);

    return sheet.getDataRange().getValues();
  }
}
