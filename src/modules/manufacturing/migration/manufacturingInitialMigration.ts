/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing
 * Layer: Application / Migration
 * File: manufacturingInitialMigration.ts
 * Path: src/modules/manufacturing/migration/manufacturingInitialMigration.ts
 *
 * Одноразова початкова міграція існуючих записів
 * 01_Виготовлення.
 *
 * dryRun = true  → тільки аналіз, без запису.
 * dryRun = false → фактична міграція.
 * ==========================================================
 */

import { sheetProvider } from '../../../app/factories/infrastructure.factory';
import { SheetKey } from '../../../infrastructure/sheets/SheetKey';
import { MANUFACTURING_HEADERS } from '../../../infrastructure/sheets/manufacturing/manufacturing.headers';

export function manufacturingInitialMigration(dryRun: boolean = true): void {
  const sheet = sheetProvider.get(SheetKey.MANUFACTURING);

  const lastRow = sheet.getLastRow();

  if (lastRow < 3) {
    Logger.log('Manufacturing records not found.');
    return;
  }

  const dataStartRow = 3;
  const rowCount = lastRow - dataStartRow + 1;

  const idColumn = MANUFACTURING_HEADERS.indexOf('ID') + 1;

  const statusColumn = MANUFACTURING_HEADERS.indexOf('Статус') + 1;

  const createdColumn = MANUFACTURING_HEADERS.indexOf('Створено') + 1;

  const updatedColumn = MANUFACTURING_HEADERS.indexOf('Змінено') + 1;

  const ids = sheet.getRange(dataStartRow, idColumn, rowCount, 1).getValues();

  const statuses = sheet
    .getRange(dataStartRow, statusColumn, rowCount, 1)
    .getValues();

  const migrationTimestamp = new Date();

  let total = 0;
  let toMigrate = 0;
  let skipped = 0;
  let errors = 0;

  const rowsToMigrate: number[] = [];

  Logger.log('========================================');
  Logger.log('MANUFACTURING INITIAL MIGRATION');
  Logger.log(dryRun ? 'MODE: DRY-RUN' : 'MODE: EXECUTE');
  Logger.log('========================================');

  for (let i = 0; i < rowCount; i++) {
    const rowNumber = dataStartRow + i;

    const id = String(ids[i][0] ?? '').trim();
    const status = String(statuses[i][0] ?? '').trim();

    if (!id) {
      errors++;

      Logger.log(`❌ Рядок ${rowNumber}: відсутній ManufacturingId`);

      continue;
    }

    total++;

    if (status) {
      skipped++;
      continue;
    }

    toMigrate++;
    rowsToMigrate.push(rowNumber);

    Logger.log(`➡️ Рядок ${rowNumber}: ${id} → ACTIVE`);
  }

  Logger.log('========================================');
  Logger.log(`📋 Всього записів: ${total}`);
  Logger.log(`➡️ До міграції: ${toMigrate}`);
  Logger.log(`⏭️ Пропущено: ${skipped}`);
  Logger.log(`❌ Помилок: ${errors}`);
  Logger.log('========================================');

  if (dryRun) {
    Logger.log('🔍 DRY-RUN: дані НЕ змінено.');
    return;
  }

  if (errors > 0) {
    throw new Error(`Міграцію скасовано. Виявлено помилок: ${errors}`);
  }

  if (rowsToMigrate.length === 0) {
    Logger.log('ℹ️ Немає записів для міграції.');
    return;
  }

  const statusValues = rowsToMigrate.map(() => ['ACTIVE']);
  const timestampValues = rowsToMigrate.map(() => [migrationTimestamp]);

  rowsToMigrate.forEach((rowNumber, index) => {
    sheet.getRange(rowNumber, statusColumn).setValue(statusValues[index][0]);

    sheet
      .getRange(rowNumber, createdColumn)
      .setValue(timestampValues[index][0]);

    sheet
      .getRange(rowNumber, updatedColumn)
      .setValue(timestampValues[index][0]);
  });

  Logger.log('========================================');
  Logger.log('✅ МІГРАЦІЮ ВИКОНАНО');
  Logger.log(`Мігровано записів: ${rowsToMigrate.length}`);
  Logger.log(`Timestamp: ${migrationTimestamp.toISOString()}`);
  Logger.log('========================================');
}
