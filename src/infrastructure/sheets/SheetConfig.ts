import { SheetDefinition } from './SheetDefinition';
import { SheetKey } from './SheetKey';
import { SpreadsheetKey } from '../spreadsheets/SpreadsheetKey';

export const SheetConfig: Record<SheetKey, SheetDefinition> = {
  CATALOG: {
    key: SheetKey.CATALOG,
    spreadsheet: SpreadsheetKey.MASTER,
    name: '04_Catalog',
  },
  MATERIAL_BATCHES: {
    key: SheetKey.MATERIAL_BATCHES,
    spreadsheet: SpreadsheetKey.MASTER,
    name: '06_MaterialBatches',
  },
  MATERIALS: {
    key: SheetKey.MATERIALS,
    spreadsheet: SpreadsheetKey.MASTER,
    name: '05_Materials',
  },
  PLACEMENT: {
    key: SheetKey.PLACEMENT,
    spreadsheet: SpreadsheetKey.MASTER,
    name: '13_Placement',
  },
};
