/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing
 * File: manufacturing-input.ts
 * Path: src/modules/manufacturing/types/manufacturing-input.ts
 *
 * Layer: Application / Input
 *
 * Призначення:
 * Тип даних для рядка-буфера введення Manufacturing.
 *
 * Не є доменною сутністю Manufacturing.
 * Може містити неповні або ще невалідні дані,
 * введені користувачем.
 * ==========================================================
 */

export interface ManufacturingInput {
  date: Date | undefined;
  shift: string;
  houseCode: string;
  productCode: string;
  quantity: number | undefined;
  placementId: number | undefined;
  master: string;
  comment: string;
}
