import { SavedReportsManagement, type ArchiveAction, type ArchivePolicy } from '../infrastructure/reporting/archive-management';
import { GasArchiveManagementStore } from '../infrastructure/reporting/gas-archive-management-store';
import { requirePermission, requireWrapperPermission } from '../security/production-authorization';

/** Server-resolved identity only. Request fields and hidden buttons never grant permission. */
export class ArchiveRolePolicy implements ArchivePolicy {
  constructor(private readonly identity: () => { email: string; roles: readonly string[] } | undefined) {}
  authorize(_action: ArchiveAction) {
    const user = this.identity();
    if (!user?.email || !user.roles.some(r => r === 'ERP_OWNER' || r === 'WORKSHOP_MANAGER')) throw new Error('ARCHIVE_ACCESS_DENIED');
  }
}
/** Central permission policy; production identity remains unconfigured and denies access. */
export const unconfiguredArchivePolicy: ArchivePolicy = { authorize(action) {
  const permissions = { list: 'REPORT_LIST', open: 'REPORT_VIEW', save: 'REPORT_SAVE', rename: 'REPORT_RENAME', delete: 'REPORT_DELETE' } as const;
  requirePermission(permissions[action]);
} };
function run(fn: (service: SavedReportsManagement) => unknown) {
  try { return fn(new SavedReportsManagement(new GasArchiveManagementStore(), unconfiguredArchivePolicy)); }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: 'ERROR', code: message.split(':')[0], message: `${message}. Не повторюйте зміну автоматично; при частковому збої перевірте REPORTING.` };
  }
}
function input(value: unknown, rename = false): { reportId: string; sheetId: number; newName?: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_ARCHIVE_INPUT');
  const r = value as Record<string, unknown>;
  if (Object.keys(r).some(k => !(rename ? ['reportId', 'sheetId', 'newName'] : ['reportId', 'sheetId']).includes(k)) ||
    typeof r.reportId !== 'string' || !Number.isSafeInteger(r.sheetId) || (rename && typeof r.newName !== 'string')) throw new Error('INVALID_ARCHIVE_INPUT');
  return r as any;
}
export function listSavedMaterialReportsWeb() { requireWrapperPermission('listSavedMaterialReportsWeb'); return run(service => ({ status: 'OK', reports: service.list() })); }
export function renameSavedMaterialReportWeb(value: unknown) {
  requireWrapperPermission('renameSavedMaterialReportWeb');
  return run(service => { const r = input(value, true); return service.rename(r.reportId, r.sheetId, r.newName!); });
}
export function deleteSavedMaterialReportWeb(value: unknown) {
  requireWrapperPermission('deleteSavedMaterialReportWeb');
  return run(service => { const r = input(value); return service.delete(r.reportId, r.sheetId); });
}
