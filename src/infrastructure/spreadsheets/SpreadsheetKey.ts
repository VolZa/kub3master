//src/infrastructure/spreadsheets/SpreadsheetKey.ts
export const SpreadsheetKey = {
  MASTER: 'MASTER',
  OPERATIONAL: 'OPERATIONAL',
  REPORTING: 'REPORTING',
} as const;

export type SpreadsheetKey =
  (typeof SpreadsheetKey)[keyof typeof SpreadsheetKey];
