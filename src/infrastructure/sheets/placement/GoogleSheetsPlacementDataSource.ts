import { SheetKey } from '../SheetKey';
import { SheetProvider } from '../SheetProvider';
import { GoogleSheetsDataSource } from '../GoogleSheetsDataSource';
import { IPlacementDataSource } from './placement-data-source.interface';

export class GoogleSheetsPlacementDataSource
  extends GoogleSheetsDataSource
  implements IPlacementDataSource
{
  constructor(sheetProvider: SheetProvider) {
    super(sheetProvider, SheetKey.PLACEMENT);
  }

  saveRows(rows: unknown[][]): void {
    this.replaceRows(rows);
  }
}
