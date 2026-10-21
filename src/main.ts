// src\main.ts
import { requireWrapperPermission } from './security/production-authorization';
export function onOpen(): void {
  requireWrapperPermission('onOpen');
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

    // Manual audit/rebuild actions are isolated from production registration in AC-002A.

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
