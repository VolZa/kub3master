export function onOpen(): void {
  const ui = SpreadsheetApp.getUi();

  ui.createMenu('ERP КУБ')

    // ===========================
    // Проєкт
    // ===========================
    .addSubMenu(
      ui
        .createMenu('🏗 Проєкт')
        .addItem('📥 Імпорт специфікації', 'openFormTable'),
    )

    // ===========================
    // Виробництво
    // ===========================
    .addSubMenu(
      ui
        .createMenu('📥 Виробництво')
        .addItem('🔍 Аналіз журналу виробництва', 'analyzeProduction')
        .addItem('✔ Оновити статуси виготовлення', 'executeProduction'),
    )

    // ===========================
    // Розробка
    // ===========================
    .addSeparator()
    .addSubMenu(
      ui
        .createMenu('🛠 Розробка')
        .addItem('🧪 Smoke Test', 'productionSynchronizationSmokeTest')
        .addItem(
          '👁 Попередній перегляд синхронізації',
          'previewProductionSynchronization',
        ),
    )

    .addToUi();
}
// export function onOpen(): void {
//   const ui = SpreadsheetApp.getUi();

//   ui.createMenu('ERP КУБ')
//     // ===========================
//     // Виробництво
//     // ===========================
//     .addSubMenu(
//       ui
//         .createMenu('📥 Виробництво')
//         .addItem('🔍 Аналіз журналу виробництва', 'analyzeProduction')
//         .addItem('✔ Оновити статуси виготовлення', 'executeProduction'),
//     )

//     // ===========================
//     // Проект
//     // ===========================
//     .addSeparator()
//     .addItem('📋 Відкрити форму таблиці', 'openFormTable')

//     // ===========================
//     // Розробка
//     // ===========================
//     .addSeparator()
//     .addSubMenu(
//       ui
//         .createMenu('🛠 Розробка')
//         .addItem('🧪 Smoke Test', 'productionSynchronizationSmokeTest')
//         .addItem(
//           '👁 Попередній перегляд синхронізації',
//           'previewProductionSynchronization',
//         ),
//     )

//     .addToUi();
// }
// export function onOpen(): void {
//   const ui = SpreadsheetApp.getUi();

//   ui.createMenu('ERP КУБ')
//     .addSubMenu(
//       ui
//         .createMenu('📥 Виробництво')
//         .addItem('🔍 Аналіз журналу виробництва', 'analyzeProduction')
//         .addItem('✔ Оновити статуси виготовлення', 'executeProduction'),
//     )
//     .addSeparator()

//     .addItem('📋 Відкрити форму таблиці', 'openFormTable')
//     .addSeparator()

//     .addSubMenu(
//       ui
//         .createMenu('🧪 Debug')
//         .addItem('Smoke Test', 'productionSynchronizationSmokeTest')
//         .addItem('Preview Synchronization', 'previewProductionSynchronization'),
//     .addToUi()
//   );

// }

// export function onOpen() {
//   SpreadsheetApp.getUi()
//     .createMenu('APP')
//     .addItem('Відкрити форму', 'openForm')
//     .addItem('Відкрити форму таблиці', 'openFormTable')
//     .addToUi();
// }
