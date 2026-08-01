//src\infrastructure\sheets\catalog\GoogleSheetsCatalogDataSource.ts

import { GoogleSheetsDataSource } from '../GoogleSheetsDataSource';
import { SheetKey } from '../SheetKey';
import { SheetProvider } from '../SheetProvider';

import { CatalogRow } from '../../../modules/catalog/catalog.row';
import { CATALOG_HEADERS } from '../../../modules/catalog/catalog.headers';

export class GoogleSheetsCatalogDataSource extends GoogleSheetsDataSource<CatalogRow> {
  constructor(sheetProvider: SheetProvider) {
    super(sheetProvider, SheetKey.CATALOG, CATALOG_HEADERS);
  }
}
