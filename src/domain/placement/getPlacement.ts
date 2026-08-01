// src\domain\placement\getPlacement.ts
import { getSheetByNameSafe } from 'utils/sheets';

export interface PlacementReference {
  id: number;
  productCode: string;
}

export function getPlacementReference(): PlacementReference[] {
  const sheet = getSheetByNameSafe('13_Placement');

  const values = sheet.getDataRange().getValues();

  return values.slice(1).map((row) => ({
    id: Number(row[0]),
    productCode: row[5],
  }));
}
