// src\app\factories\infrastructure.factory.ts
import { SpreadsheetProvider } from '../../infrastructure/spreadsheets/SpreadsheetProvider';
import { SpreadsheetRegistry } from '../../infrastructure/spreadsheets/SpreadsheetRegistry';
import { SheetProvider } from '../../infrastructure/sheets/SheetProvider';

const spreadsheetProvider = new SpreadsheetProvider();

const spreadsheetRegistry = new SpreadsheetRegistry(spreadsheetProvider);

const sheetProvider = new SheetProvider(spreadsheetRegistry);

export { spreadsheetProvider, spreadsheetRegistry, sheetProvider };
