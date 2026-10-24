import { SpreadsheetConfig } from '../../infrastructure/spreadsheets/SpreadsheetConfig';
import type { Sources } from './test-configuration';
export const PRODUCTION_SCRIPT_ID = '1HbCOjFYh21DdVn116JgvHDu-_23seWyTfPd1CDyGHGnKOqq4DSnEknLI';
/** Production identifiers are read-only COPY SOURCES, never TEST runtime defaults. */
export const TEST_RESET_SOURCES: Sources = {
  MASTER: { id: SpreadsheetConfig.MASTER.id, requiredSheets: ['00_Elements', '01_BOM', '05_Materials'] },
  OPERATIONAL: { id: SpreadsheetConfig.OPERATIONAL.id, requiredSheets: ['01_Виготовлення'] },
  REPORTING: { id: SpreadsheetConfig.REPORTING.id, requiredSheets: ['ВідомістьВитрат'] },
};
