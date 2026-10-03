/**
 * src/modules/material-batch/material-batch-option.ts
 *
 * Модуль: MaterialBatch
 *
 * Призначення:
 * - DTO для вибору партії матеріалу у UI;
 * - використовується вебформою;
 * - не є доменною моделлю MaterialBatch.
 */

export interface MaterialBatchOption {
  batchId: string;
  batchCode: string;
  materialId: string;

  receivedAt: string;

  remainingQty: number;

  weightPerMeter?: number;
  length?: number;

  /** Текст для відображення у <select>. */
  label: string;
}
