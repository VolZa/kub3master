export const SpreadsheetKey = {
  MASTER: 'MASTER',
  OPERATIONAL: 'OPERATIONAL',
} as const;

export type SpreadsheetKey =
  (typeof SpreadsheetKey)[keyof typeof SpreadsheetKey];
