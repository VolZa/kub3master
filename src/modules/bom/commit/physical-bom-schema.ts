/**
 * Path: C:/www/26/03/kub3master-ts/src/modules/bom/commit/physical-bom-schema.ts
 * Module: BOM
 * Layer: Contracts / Infrastructure
 * Responsibility: validate the approved seven-column value-only physical BOM schema.
 */
import { normalizeIntegerId } from '../../../utils/id.logic';
export const PHYSICAL_BOM_HEADERS = ['ParentID', 'ChildID', 'Qty', 'Unit', 'Comment', 'ParentCode', 'ChildCode'] as const;
export type PhysicalBOMRow = [string, string, number, string, string, string, string];
export function validateBOMHeaders(headers: unknown[]): void {
  if (headers.length !== 7 || PHYSICAL_BOM_HEADERS.some((header, index) => headers[index] !== header)) {
    throw new Error('Unsupported 01_BOM schema: expected ParentID, ChildID, Qty, Unit, Comment, ParentCode, ChildCode; no extra columns supported');
  }
}
export function validateBOMRow(row: unknown[], physicalRow = 0): PhysicalBOMRow | null {
  const error = () => new Error(`Invalid/partial 01_BOM physical row ${physicalRow}: expected seven value-only columns`);
  if (row.length !== 7) throw error();
  if (row.every(cell => cell === '')) return null;
  if (![0, 1].every(index => typeof row[index] === 'string' || typeof row[index] === 'number') ||
      typeof row[2] !== 'number' || !Number.isFinite(row[2]) || row[2] <= 0 ||
      ![3, 4, 5, 6].every(index => typeof row[index] === 'string') ||
      !String(row[3]).trim() || !String(row[5]).trim() || !String(row[6]).trim()) throw error();
  try {
    return [String(normalizeIntegerId(row[0], 'ParentID')), String(normalizeIntegerId(row[1], 'ChildID')),
      row[2], row[3], row[4], row[5], row[6]] as PhysicalBOMRow;
  } catch { throw error(); }
}
