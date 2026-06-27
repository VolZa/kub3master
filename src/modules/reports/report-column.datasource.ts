import { getSheetByNameSafe } from '../../utils/sheets';

export class GoogleSheetsReportColumnDataSource {
  getRows(): any[][] {
    return getSheetByNameSafe('16_ReportColumns').getDataRange().getValues();
  }
}
