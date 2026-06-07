// src/technology/shiftPlan/shiftPlan.repository.ts
import { getSheetByNameSafe } from 'utils/sheets';

export type ShiftPlanRecord = {
  Id: number;
  Date: string;
  Shift: number;
  PlacementId: number;
  FormId: number;
  CombSet: string;
  CrabId: string;
};

export function getShiftPlan(): ShiftPlanRecord[] {
  const sheet = getSheetByNameSafe('15_ShiftPlan');

  const values = sheet.getDataRange().getValues();

  return values.slice(1).map((row) => ({
    Id: Number(row[0]),
    Date: row[1],
    Shift: Number(row[2]),
    PlacementId: Number(row[3]),
    FormId: Number(row[4]),
    CombSet: row[5],
    CrabId: row[6],
  }));
}

export function saveShiftPlan(records: ShiftPlanRecord[]) {
  const sheet = getSheetByNameSafe('15_ShiftPlan');

  const lastRow = sheet.getLastRow();

  const rows = records.map((r) => [
    r.Id,
    r.Date,
    r.Shift,
    r.PlacementId,
    r.FormId,
    r.CombSet,
    r.CrabId,
  ]);

  sheet.getRange(lastRow + 1, 1, rows.length, rows[0].length).setValues(rows);
}
