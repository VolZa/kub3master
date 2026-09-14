/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing
 * File: manufacturing.entrypoints.ts
 * Path: src\app\entrypoints\manufacturing.entrypoints.ts
 *
 * GAS entry points для операцій Manufacturing.
 * ==========================================================
 */

import { getManufacturingBufferCreationApplicationService } from '../factories/manufacturing-buffer-creation.factory';

export function createManufacturingFromBuffer(): void {
  const service = getManufacturingBufferCreationApplicationService();

  try {
    const manufacturing = service.createFromBuffer();

    SpreadsheetApp.getActive().toast(
      `Manufacturing ${manufacturing.id} створений.`,
      'Виготовлення',
      5,
    );

    console.log(`Manufacturing ${manufacturing.id} створений із буфера.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    SpreadsheetApp.getActive().toast(message, 'Помилка', 8);

    console.error(`Помилка створення Manufacturing: ${message}`);

    throw error;
  }
}
