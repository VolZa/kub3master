import { getSheetByNameSafe } from 'utils/sheets';
import { getShiftPlan } from 'technology/shiftPlan';

export function completeShiftPlan(date: string, shift: number) {
  const shiftPlan = getShiftPlan();

  const records = shiftPlan.filter((r) => r.Date === date && r.Shift === shift);

  if (records.length === 0) {
    throw new Error('Немає записів для цієї зміни');
  }

  const sheet = getSheetByNameSafe('14_ProductionLog');

  const lastRow = sheet.getLastRow();

  const values = records.map((r, i) => [
    lastRow + i, // Id
    date,
    r.PlacementId,
    1, // Accepted = 1 (поки все прийнято)
  ]);

  sheet
    .getRange(lastRow + 1, 1, values.length, values[0].length)
    .setValues(values);

  console.log(`Записано ${values.length} виробів у ProductionLog`);
}
