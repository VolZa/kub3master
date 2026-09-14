/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing
 * File: manufacturing-input-validation-result.ts
 * Path: src/modules/manufacturing/types/manufacturing-input-validation-result.ts
 *
 * Layer: Application / Input
 *
 * Призначення:
 * Результат перевірки даних ManufacturingInput.
 * ==========================================================
 */

export interface ManufacturingInputValidationResult {
  valid: boolean;
  errors: string[];
}
