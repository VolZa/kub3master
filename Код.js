function onOpen() {

  SpreadsheetApp.getUi()
    .createMenu("BOM")
    .addItem("Створити BOM", "openBOMForm")
    .addToUi();

}

function openBOMForm(){

  const html = HtmlService
    .createHtmlOutputFromFile("BOMForm")
    .setWidth(400)
    .setHeight(400);

  SpreadsheetApp.getUi().showSidebar(html);
}

// function onOpen(){

//   const ui = SpreadsheetApp.getUi();

//   ui.createMenu("MASTER")
//     // .addItem("Додати елемент", "openElementForm")
//     .addItem('➕ Додати елемент', 'showForm')
//     .addItem("Додати BOM", "openBOMForm")
//     .addToUi();

// }

// function onOpen() {
//   SpreadsheetApp.getUi()
//     .createMenu('ERP')
//     .addItem('➕ Додати елемент', 'showForm')
//     .addToUi();
// }

function showForm() {
  const html = HtmlService.createHtmlOutputFromFile('Form')
    .setTitle('Додати елемент');
  SpreadsheetApp.getUi().showSidebar(html);
}

function addBOMSmart(parentCode, specString, qty) {

  const elementsSheet = getSheetByNameSafe('00_Elements');
  const bomSheet = getSheetByNameSafe('01_BOM');

  qty = Number(qty);

  if (!qty || qty <= 0) {
    return "❌ Qty повинно бути > 0";
  }

  const parent = findElementByCode(parentCode);

  if (!parent) {
    return "❌ Parent не знайдено: " + parentCode;
  }

  const parsed = smartEngineeringParser(specString);

  if (!parsed || !parsed.detected) {
    return "❌ Не вдалося розпізнати специфікацію";
  }

  const child = getOrCreatePart(parsed);

  const bomData = bomSheet.getDataRange().getValues();

  for (let i = 1; i < bomData.length; i++) {

    if (
      bomData[i][0] == parent.id &&
      bomData[i][2] == child.id
    ) {
      return "⚠ Така складова вже є у BOM";
    }

  }

  bomSheet.appendRow([
    parent.id,
    parent.code,
    child.id,
    child.code,
    qty,
    "шт",
    new Date()
  ]);

  return "✅ BOM додано";
}

// function openBOMForm() {

//   const html = HtmlService
//     .createHtmlOutputFromFile('BOMForm')
//     .setWidth(400)
//     .setHeight(300);

//   SpreadsheetApp.getUi().showModalDialog(html, 'BOM');

// }
