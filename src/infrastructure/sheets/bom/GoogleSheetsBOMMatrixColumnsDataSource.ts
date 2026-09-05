// src/infrastructure/sheets/bom/GoogleSheetsBOMMatrixColumnsDataSource.ts

import { GoogleSheetsDataSource } from '../GoogleSheetsDataSource';
import { SheetKey } from '../SheetKey';
import { SheetProvider } from '../SheetProvider';

// import { BOMMatrixColumnDefinition } from '../../../modules/bom/model/bom-matrix-column-definition.model';
import { BOM_MATRIX_COLUMNS_HEADERS } from '../../../modules/bom/bom-matrix-columns.headers';
import { BOMMatrixColumnDefinitionRow } from 'modules/bom/bom-matrix-column-definition.row';

export class GoogleSheetsBOMMatrixColumnsDataSource extends GoogleSheetsDataSource<BOMMatrixColumnDefinitionRow> {
  constructor(sheetProvider: SheetProvider) {
    super(
      sheetProvider,
      SheetKey.BOM_MATRIX_COLUMNS,
      BOM_MATRIX_COLUMNS_HEADERS,
    );
  }
}
