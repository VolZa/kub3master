/**
 * ==========================================================
 * ERP КУБ
 * Module: Material
 * File: GoogleSheetsMaterialDataSource.ts
 * Path: src\infrastructure\sheets\material\GoogleSheetsMaterialDataSource.ts
 *
 * DataSource таблиці 05_Materials.
 * ==========================================================
 */
import { GoogleSheetsDataSource } from '../GoogleSheetsDataSource';
import { SheetKey } from '../SheetKey';
import { SheetProvider } from '../SheetProvider';

import { MATERIAL_HEADERS } from '../../../modules/material/material.headers';
import { MaterialRow } from '../../../modules/material/material.row';

export class GoogleSheetsMaterialDataSource extends GoogleSheetsDataSource<MaterialRow> {
  constructor(sheetProvider: SheetProvider) {
    super(sheetProvider, SheetKey.MATERIALS, MATERIAL_HEADERS);
  }
}
