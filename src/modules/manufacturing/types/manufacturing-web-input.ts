/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing
 * File: manufacturing-web-input.ts
 * Path: src\modules\manufacturing\types\manufacturing-web-input.ts
 *
 * Вхідні дані Manufacturing, отримані з Web UI.
 * ==========================================================
 */

export interface ManufacturingWebInput {
  date: string;
  shift: string;
  houseCode: string;
  productCode: string;
  quantity: number;
  placementId?: number;
  master: string;
  comment: string;
}
