// src\main.ts
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
    // BOM
    // ===========================
    .addSubMenu(
      ui
        .createMenu('🔗 BOM')
        .addItem('🔍 Аудит усіх Product', 'testAuditAllProducts'),
    )

    // ===========================
    // Виробництво
    // ===========================
    .addSubMenu(
      ui
        .createMenu('📥 Виробництво')
        .addItem(
          '🔄 Повна синхронізація виробництва',
          'rebuildManufacturingState',
        ),
    )

    // ===========================
    // Розробка
    // ===========================
    .addSeparator()
    // .addSubMenu(
    //   ui
    //     .createMenu('🛠 Розробка')
    //     .addItem('🧪 Smoke Test', 'productionSynchronizationSmokeTest'),
    // )

    .addToUi();
}
// export function onOpen(): void {
//   const ui = SpreadsheetApp.getUi();

//   ui.createMenu('ERP КУБ')

//     // ===========================
//     // Проєкт
//     // ===========================
//     .addSubMenu(
//       ui
//         .createMenu('🏗 Проєкт')
//         .addItem('📥 Імпорт специфікації', 'openFormTable'),
//     )

//     // ===========================
//     // Виробництво
//     // ===========================
//     .addSubMenu(
//       ui
//         .createMenu('📥 Виробництво')
//         .addItem(
//           '🔄 Повна синхронізація виробництва',
//           'rebuildManufacturingState',
//         ),
//     )

//     // ===========================
//     // Розробка
//     // ===========================
//     .addSeparator()
//     // .addSubMenu(
//     //   ui
//     //     .createMenu('🛠 Розробка')
//     //     .addItem('🧪 Smoke Test', 'productionSynchronizationSmokeTest'),
//     // )

//     .addToUi();
// }
