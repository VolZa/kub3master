/**
 * Path: C:/www/26/03/kub3master-ts/src/ui/bom-commit.api.ts
 * Module: BOM UI
 * Layer: Application boundary
 * Responsibility: authorize MASTER editors and accept only raw specification context for Safe Commit.
 */
import { commitBOM, resumeBOMCommit, type BOMCommitResult } from '../modules/bom/commit/safe-commit.service';
import { SpreadsheetConfig } from '../infrastructure/spreadsheets/SpreadsheetConfig';
function authorize(): void {
  const email = Session.getActiveUser().getEmail().trim().toLowerCase();
  if (!email) throw new Error('BOM_ACCESS_DENIED: не вдалося підтвердити користувача');
  const file = DriveApp.getFileById(SpreadsheetConfig.MASTER.id);
  const users = [file.getOwner(), ...file.getEditors()].filter(Boolean);
  if (!users.some(user => user!.getEmail().toLowerCase() === email)) throw new Error('BOM_ACCESS_DENIED: потрібні права редактора MASTER');
}
function object(value: unknown, allowed: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key))) throw new Error('Непідтримані поля запиту BOM');
  return value as Record<string, unknown>;
}
function text(value: unknown, name: string, maximum: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) throw new Error(`Некоректне поле ${name}`);
  return value;
}
function operationID(value: unknown): string {
  const id = text(value, 'OperationID', 116);
  if (!/^[A-Za-z0-9_-]+$/.test(id) || id.endsWith('_BOM')) throw new Error('Некоректний OperationID'); return id;
}
export function submitBOM(request: unknown): BOMCommitResult {
  authorize();
  try {
    const input = object(request, ['operationID', 'projectDocumentID', 'parentInput', 'specification']);
    const id = operationID(input.operationID);
    return commitBOM({ projectDocumentID: text(input.projectDocumentID, 'ProjectDocumentID', 120),
      parentInput: text(input.parentInput, 'Батьківський Element', 1000), specification: text(input.specification, 'Специфікація', 200000) }, id);
  } catch (error) { return { status: 'VALIDATION_ERROR', operationID: typeof (request as any)?.operationID === 'string' ? (request as any).operationID : '', error: String(error) }; }
}
export function resumeBOM(operation: unknown): BOMCommitResult {
  authorize();
  const id = operationID(operation); return resumeBOMCommit(id);
}
/** Old callers must supply both explicit document context and stable OperationID; no automatic IDs/default document. */
export function runTableParser(projectDocumentID: unknown, parentCode: unknown, specification: unknown, operation: unknown) {
  return submitBOM({ projectDocumentID, parentInput: parentCode, specification, operationID: operation });
}
export function buildBOMFromText(request: unknown) {
  authorize();
  try {
    const input = object(request, ['projectDocumentID', 'parentCode', 'specification', 'operationID']);
    return submitBOM({ projectDocumentID: input.projectDocumentID, parentInput: input.parentCode, specification: input.specification, operationID: input.operationID });
  } catch (error) { return { status: 'VALIDATION_ERROR', operationID: '', error: String(error) } as BOMCommitResult; }
}
