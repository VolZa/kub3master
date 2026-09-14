/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing
 * File: manufacturing-status.ts
 * Path: src/domain/manufacturing/manufacturing-status.ts
 *
 * Статуси факту виготовлення.
 * ==========================================================
 */

export const MANUFACTURING_STATUSES = ['ACTIVE', 'CANCELLED'] as const;

export type ManufacturingStatus = (typeof MANUFACTURING_STATUSES)[number];
