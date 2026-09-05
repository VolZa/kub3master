import { GoogleSheetsDataSource } from '../GoogleSheetsDataSource';
import { SheetKey } from '../SheetKey';
import { SheetProvider } from '../SheetProvider';

import { ManufacturingRow } from './manufacturing.row';
import { MANUFACTURING_HEADERS } from './manufacturing.headers';

export class GoogleSheetsManufacturingDataSource extends GoogleSheetsDataSource<ManufacturingRow> {
  constructor(sheetProvider: SheetProvider) {
    super(sheetProvider, SheetKey.MANUFACTURING, MANUFACTURING_HEADERS, 3, 6);
  }
}
