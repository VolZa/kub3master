import { GasSavedReportStore } from '../infrastructure/reporting/gas-saved-report-store';
import { requireWrapperPermission } from '../security/production-authorization';
import { SaveMaterialConsumptionReportUseCase } from '../infrastructure/reporting/saved-report';
export function getCurrentMaterialReportWeb() {
  requireWrapperPermission('getCurrentMaterialReportWeb');
  const store = new GasSavedReportStore();
  if (!store.lock()) return { status: 'ERROR', code: 'REPORT_BUSY' };
  try {
    const sheetId = store.currentId();
    if (sheetId === undefined) return { status: 'EMPTY' };
    store.snapshot(sheetId);
    return { status: 'OK', sheetId };
  } catch (error) { return saveError(error); }
  finally { store.unlock(); }
}
export function saveMaterialConsumptionReportWeb(input: unknown) {
  requireWrapperPermission('saveMaterialConsumptionReportWeb');
  if (!input || typeof input !== 'object' || !Number.isSafeInteger((input as any).sourceSheetId)) return { status: 'ERROR', code: 'INVALID_SOURCE_SHEET_ID' };
  try { return new SaveMaterialConsumptionReportUseCase(new GasSavedReportStore()).execute((input as any).sourceSheetId); }
  catch (error) { return saveError(error); }
}
function saveError(error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  return { status: 'ERROR', code: detail.split(':')[0], message: `${detail}. Не повторюйте збереження автоматично; перевірте REPORTING і журнал виконання.` };
}
