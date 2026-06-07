import { getSheetByNameSafe } from 'utils/sheets';

export type ProductionRecord = {
  Id: number;
  Date: string;
  PlacementId: number;
  Accepted: boolean;
};

export function getProductionLog(): ProductionRecord[] {
  const sheet = getSheetByNameSafe('14_ProductionLog');

  const values = sheet.getDataRange().getValues();

  return values.slice(1).map((row) => ({
    Id: Number(row[0]),
    PlacementId: Number(row[1]),
    Date: row[2],
    Shift: Number(row[3]),
    Accepted: row[4] === 1,
    Comment: row[5],
  }));
}
