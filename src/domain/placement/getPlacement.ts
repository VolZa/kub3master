import { getSheetByNameSafe } from 'utils/sheets';

export type Placement = {
  Id: number;
  ProductCode: string;
};

export function getPlacement(): Placement[] {
  const sheet = getSheetByNameSafe('13_Placement');

  const values = sheet.getDataRange().getValues();

  return values.slice(1).map((row) => ({
    Id: Number(row[0]),
    ProductCode: row[5],
  }));
}
