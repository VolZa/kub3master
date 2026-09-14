/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing
 * Layer: Application / Tests
 * File: testManufacturingDomainMapper.ts
 * Path: src/modules/manufacturing/tests/testManufacturingDomainMapper.ts
 *
 * Контрольна перевірка перетворення ManufacturingRow
 * у Domain-модель Manufacturing.
 *
 * Тест НЕ змінює дані в Google Sheets.
 * ==========================================================
 */

import { sheetProvider } from '../../../app/factories/infrastructure.factory';
import { GoogleSheetsManufacturingDataSource } from '../../../infrastructure/sheets/manufacturing/GoogleSheetsManufacturingDataSource';
import { ManufacturingDomainMapper } from '../mapping/manufacturingDomainMapper';

export function testManufacturingDomainMapper(): void {
  Logger.log('========================================');
  Logger.log('TEST: ManufacturingDomainMapper');
  Logger.log('========================================');

  const dataSource = new GoogleSheetsManufacturingDataSource(sheetProvider);

  const rows = dataSource.getRows();

  Logger.log(`📋 Отримано рядків: ${rows.length}`);

  let successCount = 0;
  let errorCount = 0;

  rows.forEach((row, index) => {
    const rowNumber = index + 3;
    const id = String(row['ID'] ?? '').trim();

    try {
      const manufacturing = ManufacturingDomainMapper.mapRowToDomain(row);

      successCount++;

      Logger.log(`✅ Рядок ${rowNumber}: ${id} → Manufacturing`);

      Logger.log(
        `   productCode=${manufacturing.productCode}, ` +
          `quantity=${manufacturing.quantity}, ` +
          `placementId=${manufacturing.placementId ?? '—'}, ` +
          `status=${manufacturing.status}`,
      );
    } catch (error) {
      errorCount++;

      Logger.log(`❌ Рядок ${rowNumber}: ${id}`);

      Logger.log(
        `   Помилка: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });

  Logger.log('========================================');
  Logger.log(`📋 Всього: ${rows.length}`);
  Logger.log(`✅ Успішно: ${successCount}`);
  Logger.log(`❌ Помилок: ${errorCount}`);
  Logger.log('========================================');

  if (errorCount > 0) {
    throw new Error(
      `ManufacturingDomainMapper: виявлено ${errorCount} помилок.`,
    );
  }

  Logger.log('🎉 ManufacturingDomainMapper: ВСІ ЗАПИСИ ПРОЙШЛИ ПЕРЕВІРКУ.');
}
