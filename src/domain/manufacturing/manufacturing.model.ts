/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing
 * File: manufacturing.model.ts
 * Path: src/domain/manufacturing/manufacturing.model.ts
 *
 * Domain-модель факту виготовлення виробу.
 * ==========================================================
 */

import { ManufacturingStatus } from './manufacturing-status';

export interface Manufacturing {
  id: string;
  date: Date;
  shift: string;
  houseCode: string;
  productCode: string;
  quantity: number;
  placementId?: number;
  master: string;
  comment: string;
  status: ManufacturingStatus;
  createdAt: Date;
  updatedAt: Date;
}
