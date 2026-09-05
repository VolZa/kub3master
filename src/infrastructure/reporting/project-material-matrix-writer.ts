import { SheetProvider } from 'infrastructure/sheets/SheetProvider';
import { SheetKey } from 'infrastructure/sheets/SheetKey';
import { BOMMaterialMatrix } from '../../modules/bom/model/bom-material-matrix.model';

export class ProjectMaterialMatrixWriter {
  constructor(private readonly sheetProvider: SheetProvider) {}

  write(matrix: BOMMaterialMatrix): void {
    const sheet = this.getSheet();

    const headers = this.buildHeaders(matrix);
    const rows = this.buildRows(matrix);

    sheet.clearContents();

    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

    if (rows.length > 0) {
      sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
    }
  }

  private getSheet(): GoogleAppsScript.Spreadsheet.Sheet {
    return this.sheetProvider.get(SheetKey.REPORT_MATERIAL_MATRIX);
  }

  private buildHeaders(matrix: BOMMaterialMatrix): string[] {
    return [
      'ProjectID',
      'ProductID',
      'ProductCode',
      ...matrix.columns.map((column) => column.columnCode),
    ];
  }

  private buildRows(matrix: BOMMaterialMatrix): (string | number)[][] {
    return matrix.rows.map((row) => [
      matrix.projectId,
      row.productId,
      row.productCode,
      ...matrix.columns.map((column) => row.values[column.materialId] ?? 0),
    ]);
  }
}
