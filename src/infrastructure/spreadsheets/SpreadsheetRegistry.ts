import { SpreadsheetKey } from './SpreadsheetKey';
import { SpreadsheetProvider } from './SpreadsheetProvider';

export class SpreadsheetRegistry {
  private readonly cache = new Map<
    SpreadsheetKey,
    GoogleAppsScript.Spreadsheet.Spreadsheet
  >();

  constructor(private readonly provider = new SpreadsheetProvider()) {}

  get(key: SpreadsheetKey): GoogleAppsScript.Spreadsheet.Spreadsheet {
    const cached = this.cache.get(key);

    if (cached) {
      return cached;
    }

    const spreadsheet = this.provider.open(key);

    this.cache.set(key, spreadsheet);

    return spreadsheet;
  }

  has(key: SpreadsheetKey): boolean {
    return this.cache.has(key);
  }

  invalidate(key: SpreadsheetKey): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }
}

export const spreadsheetRegistry = new SpreadsheetRegistry();

// import { SpreadsheetKey } from './SpreadsheetKey';
// import { SpreadsheetProvider } from './SpreadsheetProvider';

// export class SpreadsheetRegistry {
//   private readonly cache = new Map<
//     SpreadsheetKey,
//     GoogleAppsScript.Spreadsheet.Spreadsheet
//   >();

//   constructor(private readonly provider = new SpreadsheetProvider()) {}

//   get(key: SpreadsheetKey): GoogleAppsScript.Spreadsheet.Spreadsheet {
//     const cached = this.cache.get(key);

//     if (cached) {
//       return cached;
//     }

//     const spreadsheet = this.provider.open(key);

//     this.cache.set(key, spreadsheet);

//     return spreadsheet;
//   }

//   clear(): void {
//     this.cache.clear();
//   }
// }
