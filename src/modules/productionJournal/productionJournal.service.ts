export function handleProductionEdit_(): void {
  const ss = SpreadsheetApp.getActive();

  const production = ss.getSheetByName('01_Виготовлення');
  const forms = ss.getSheetByName('02_Оснастка');

  if (!production || !forms) return;

  production.insertRowBefore(2);

  forms.insertRowBefore(3);
}

export function handleKrabsEdit_(): void {
  const sheet = SpreadsheetApp.getActive().getSheetByName('03_Краби');

  if (!sheet) return;

  sheet.insertRowBefore(2);
}
