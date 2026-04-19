export function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('APP')
    .addItem('Відкрити форму', 'openForm')
    .addItem('Відкрити форму таблиці', 'openFormTable')
    .addToUi();
}
