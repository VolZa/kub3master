import { ScopedSpreadsheetRegistry } from '../../infrastructure/spreadsheets/ScopedSpreadsheetRegistry';
import { TestRuntimeResolver, type RuntimePorts } from './resolver';
import type { FileRole } from '../test-reset/test-configuration';

/** Only values escape this boundary: no cached mutable Sheet/Range/Spreadsheet handles. */
export function createTestRuntime(ports: RuntimePorts,
  sheets: Pick<typeof SpreadsheetApp, 'openById'>) {
  const resolver = new TestRuntimeResolver(ports);
  const registry = new ScopedSpreadsheetRegistry({
    cacheToken: () => resolver.resolve().token,
    open(role) {
      const target = resolver.target(role), book = sheets.openById(target.id);
      if (book.getId() !== target.id || resolver.resolve().token !== target.token) throw Error('TEST_CONTEXT_CHANGED');
      return book;
    },
  });
  return Object.freeze({
    readValues(role: FileRole, sheetName: string): unknown[][] {
      try {
        const before = resolver.target(role);
        const sheet = registry.get(role).getSheetByName(sheetName);
        if (!sheet) throw Error('TEST_SHEET_MISSING');
        const values = sheet.getDataRange().getValues();
        if (resolver.resolve().token !== before.token) { registry.clear(); throw Error('TEST_CONTEXT_CHANGED'); }
        return values;
      } catch (error) { registry.clear(); throw error; }
    },
    /** Writes and legacy business compositions remain held until separately isolated. */
    write(): never { throw Error('TEST_ROUTE_BLOCKED'); },
  });
}

