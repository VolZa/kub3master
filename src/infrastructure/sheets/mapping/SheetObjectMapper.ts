/**
 * ------------------------------------------------------------------
 * SheetObjectMapper
 * src\infrastructure\sheets\mapping\SheetObjectMapper.ts
 * Контракт перетворення рядка Google Sheets у Row-об'єкт.
 * ------------------------------------------------------------------
 */

import { RawSheetRow } from './RawSheetRow';

export interface SheetObjectMapper<T> {
  map(headers: readonly string[], values: RawSheetRow): T;
}
