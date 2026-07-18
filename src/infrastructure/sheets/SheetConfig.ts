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
  SHIFT_PLANS: {
    key: SheetKey.SHIFT_PLANS,
    spreadsheet: SpreadsheetKey.MASTER,
    name: '14_ShiftPlans',
  },
  SHIFT_PLAN_ITEMS: {
    key: SheetKey.SHIFT_PLAN_ITEMS,
    spreadsheet: SpreadsheetKey.MASTER,
    name: '15_ShiftPlanItems',
  },

  PROJECTS: {
    key: SheetKey.PROJECTS,
    spreadsheet: SpreadsheetKey.MASTER,
    name: '18_Projects',
  },
  PROJECT_DOCUMENTS: {
    key: SheetKey.PROJECT_DOCUMENTS,
    spreadsheet: SpreadsheetKey.MASTER,
    name: '19_ProjectDocuments',
  },
  HOUSES: {
    key: SheetKey.HOUSES,
    spreadsheet: SpreadsheetKey.MASTER,
    name: '20_Houses',
  },
  PRODUCTION: {
    key: SheetKey.PRODUCTION,
    spreadsheet: SpreadsheetKey.OPERATIONAL,
    name: '01_Виготовлення',
  },
};
