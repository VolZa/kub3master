export function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('APP')
    .addItem('Відкрити форму', 'openForm')
    .addToUi();
}
