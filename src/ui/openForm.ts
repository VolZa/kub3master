export function openForm() {
  const html = HtmlService.createHtmlOutputFromFile('Form')
    .setWidth(400)
    .setHeight(300);

  SpreadsheetApp.getUi().showSidebar(html);
}

export function openFormTable() {
  const html = HtmlService.createHtmlOutputFromFile('FormTable')
    .setWidth(450)
    .setHeight(350);

  SpreadsheetApp.getUi().showSidebar(html);
}
