export function openForm() {
  const html = HtmlService.createHtmlOutputFromFile('Form')
    .setWidth(400)
    .setHeight(300);

  SpreadsheetApp.getUi().showSidebar(html);
}
