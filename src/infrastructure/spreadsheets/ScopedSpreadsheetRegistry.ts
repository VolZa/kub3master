import { SpreadsheetKey } from './SpreadsheetKey';


export interface RegistryProvider {
  open(key: SpreadsheetKey): GoogleAppsScript.Spreadsheet.Spreadsheet;
  /** Validate context on every cache access; production providers need no token. */
  cacheToken?(): string;
}
export class ScopedSpreadsheetRegistry {
  private token: string | undefined;
  private readonly cache = new Map<
    SpreadsheetKey,
    GoogleAppsScript.Spreadsheet.Spreadsheet
  >();

  constructor(private readonly provider: RegistryProvider) {}

  private synchronize(): void {
    try {
      const next = this.provider.cacheToken?.();
      if (next !== this.token) { this.cache.clear(); this.token = next; }
    } catch (error) { this.cache.clear(); this.token = undefined; throw error; }
  }

  get(key: SpreadsheetKey): GoogleAppsScript.Spreadsheet.Spreadsheet {
    this.synchronize();
    const cached = this.cache.get(key);

    if (cached) {
      return cached;
    }

    const spreadsheet = this.provider.open(key);

    this.cache.set(key, spreadsheet);

    return spreadsheet;
  }

  has(key: SpreadsheetKey): boolean {
    this.synchronize();
    return this.cache.has(key);
  }

  invalidate(key: SpreadsheetKey): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }
}



