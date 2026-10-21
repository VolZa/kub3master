import { requireWrapperPermission } from '../security/production-authorization';
export function openForm() {
  requireWrapperPermission('openForm');
  const html = HtmlService.createTemplateFromFile('Form').evaluate()
    .setWidth(400)
    .setHeight(300);

  SpreadsheetApp.getUi().showSidebar(html);
}

export function openFormTable() {
  requireWrapperPermission('openFormTable');
  const html = HtmlService.createTemplateFromFile('FormTable').evaluate()
    .setWidth(450)
    .setHeight(350);

  SpreadsheetApp.getUi().showSidebar(html);
}
/** Private template include; no arbitrary file name is accepted from HTML clients. */
export function includeBOMCommitClient_(): string {
  requireWrapperPermission('includeBOMCommitClient_');
  return HtmlService.createHtmlOutputFromFile('BOMCommitClient').getContent()
    .replace('__BOM_CLIENT_SCOPE__', JSON.stringify(ScriptApp.getScriptId() + ':' + Session.getTemporaryActiveUserKey()));
}
