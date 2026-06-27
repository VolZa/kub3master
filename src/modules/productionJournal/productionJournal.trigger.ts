import {
  handleProductionEdit_,
  handleKrabsEdit_,
} from './productionJournal.service';
export function onEditProductionJournal(
  e: GoogleAppsScript.Events.SheetsOnEdit,
): void {
  if (!e.range || !e.value) return;

  const sheet = e.range.getSheet();
  const sheetName = sheet.getName();

  const row = e.range.getRow();
  const col = e.range.getColumn();

  if (col !== 1 || row !== 2) return;

  switch (sheetName) {
    case '01_Виготовлення':
      handleProductionEdit_();
      break;

    case '03_Краби':
      handleKrabsEdit_();
      break;
  }
}
