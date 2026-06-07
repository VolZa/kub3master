// src/technology/productConfig/getProductConfigs.ts

import { getSheetByNameSafe } from 'utils/sheets';

export type ProductConfig = {
  ProductCode: string;
  FormId: number;
  CombSetTemplate: string | null;
  CrabId: string;
  Priority: number;
};

export function getProductConfigs(productCode: string): ProductConfig[] {
  const sheet = getSheetByNameSafe('11_ProductConfig');

  const values = sheet.getDataRange().getValues();

  const result: ProductConfig[] = values
    .slice(1)
    .map((row) => ({
      ProductCode: row[0],
      FormId: Number(row[1]),
      CombSetTemplate: row[2] || null,
      CrabId: row[3],
      Priority: Number(row[4]) || 0,
    }))
    .filter((r) => r.ProductCode === productCode);

  // сортуємо по пріоритету (менше = краще)
  result.sort((a, b) => a.Priority - b.Priority);

  return result;
}
