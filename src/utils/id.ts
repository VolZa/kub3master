import { ID_RANGES, ElementType } from '../config/config';
import { getSheetByNameSafe } from '../utils/sheets';

export function generateIdByType(type: ElementType): string {
  const sheet = getSheetByNameSafe('_Config_ID_Counters');

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    throw new Error('_Config_ID_Counters порожній');
  }

  const data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();

  const [min, max] = ID_RANGES[type];

  const rowIndex = data.findIndex((r) => r[0] === type);

  if (rowIndex === -1) {
    throw new Error(`Тип ${type} не знайдено в _Config_ID_Counters`);
  }

  const lastId = Number(data[rowIndex][1]);
  const newId = lastId + 1;

  if (newId > max) {
    throw new Error(`Перевищено діапазон ID для типу ${type}`);
  }

  sheet.getRange(rowIndex + 2, 2).setValue(newId);

  return String(newId);
}
