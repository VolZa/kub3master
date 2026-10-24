import { SpreadsheetProvider } from './SpreadsheetProvider';
import { ScopedSpreadsheetRegistry, type RegistryProvider } from './ScopedSpreadsheetRegistry';
export class SpreadsheetRegistry extends ScopedSpreadsheetRegistry {
  constructor(provider: RegistryProvider = new SpreadsheetProvider()) { super(provider); }
}
export const spreadsheetRegistry = new SpreadsheetRegistry();
