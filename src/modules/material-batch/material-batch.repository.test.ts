/**
 * src/modules/material-batch/material-batch.repository.test.ts
 *
 * Модуль: MaterialBatch
 * Призначення:
 * - тестує отримання доступних партій матеріалу;
 * - використовує реальні дані 06_MaterialBatches;
 * - перевіряє формування MaterialBatchOption.
 */

import { MaterialBatchRepository } from '../../domain/materials/material-batch.repository';

// Імпорт фабрики/репозиторію відповідно до вашої поточної архітектури.
// Якщо у проєкті функція має інший шлях — використати фактичний.
import { getMaterialBatchRepository } from '../../app/factories/materialBatch.factory';

export function testMaterialBatchOptions(): void {
  const repository: MaterialBatchRepository = getMaterialBatchRepository();

  // ------------------------------------------------------------
  // MaterialID = 3014
  // Арматура ø12 A500C
  // Очікувана партія:
  // BatchID = 1006
  // ------------------------------------------------------------

  const options = repository.getMaterialBatchOptions('3014');

  console.log(`MaterialBatch options for 3014: ${options.length}`);

  if (options.length === 0) {
    throw new Error(
      'Expected at least one material batch option for MaterialID 3014',
    );
  }

  // ------------------------------------------------------------
  // Контрольна партія
  // ------------------------------------------------------------

  const batch = options.find((option) => option.batchId === '1006');

  if (!batch) {
    throw new Error('BatchID 1006 not found in material batch options');
  }

  if (batch.batchCode !== 'INV_23320_R12_A500C') {
    throw new Error(
      `Expected BatchCode INV_23320_R12_A500C, got ${batch.batchCode}`,
    );
  }

  if (batch.materialId !== '3014') {
    throw new Error(`Expected MaterialID 3014, got ${batch.materialId}`);
  }

  if (batch.remainingQty !== 5990) {
    throw new Error(`Expected RemainingQty 5990, got ${batch.remainingQty}`);
  }

  if (batch.weightPerMeter !== 0.913) {
    throw new Error(
      `Expected WeightPerMeter 0.91, got ${batch.weightPerMeter}`,
    );
  }

  if (batch.length !== 12000) {
    throw new Error(`Expected Length 12000, got ${batch.length}`);
  }

  // ------------------------------------------------------------
  // Перевірка label
  // ------------------------------------------------------------

  if (batch.label !== 'INV_23320_R12_A500C — 5990') {
    throw new Error(`Unexpected label: ${batch.label}`);
  }

  // ------------------------------------------------------------
  // Вивід
  // ------------------------------------------------------------

  for (const option of options) {
    console.log(
      `${option.batchId} | ` +
        `${option.batchCode} | ` +
        `${option.remainingQty} | ` +
        `${option.weightPerMeter ?? ''} | ` +
        `${option.label}`,
    );
  }

  console.log('✓ testMaterialBatchOptions passed');
}
