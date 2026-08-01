/**
 * Значення однієї комірки Google Sheets.
 */
export type SheetCell = unknown;

/**
 * Один рядок таблиці.
 */
export type SheetRow = readonly SheetCell[];

/**
 * Таблиця Google Sheets.
 */
export type SheetMatrix = readonly SheetRow[];
