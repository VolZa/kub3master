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
