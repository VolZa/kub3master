// Production composition only. Every registered RPC handler is permission guarded.
// Tests, migrations and manual admin probes stay in source, outside this composition.
import { onOpen } from './main';
import { openFormTable, openForm, includeBOMCommitClient_ } from './ui/openForm';
import { doGet, createManufacturingFromWeb, getManufacturingHouseOptions, getManufacturingProductOptions, getManufacturingPlacementOptions, generateMaterialConsumptionReportWeb } from './ui/webApp';
import { getCurrentMaterialReportWeb, saveMaterialConsumptionReportWeb } from './ui/saved-report-web';
import { listSavedMaterialReportsWeb, renameSavedMaterialReportWeb, deleteSavedMaterialReportWeb } from './ui/archive-management-web';
import { submitBOM, resumeBOM, runTableParser, buildBOMFromText } from './ui/bom-commit.api';
import { handleProductionEdit_, handleKrabsEdit_ } from './modules/productionJournal/productionJournal.service';
import { register } from './core/register';
import { requireWrapperPermission } from './security/production-authorization';
function onEdit(e: GoogleAppsScript.Events.SheetsOnEdit) {
  requireWrapperPermission('onEdit');
  if (!e.range || !e.value) return;
  const sheet = e.range.getSheet();
  if (sheet.getName() === '01_Виготовлення' && e.range.getA1Notation() === 'A2') { handleProductionEdit_(); return; }
  if (sheet.getName() === '03_Краби' && e.range.getA1Notation() === 'A2') handleKrabsEdit_();
}
register({
  onOpen, onEdit, openForm, openFormTable, includeBOMCommitClient_, doGet,
  submitBOM, resumeBOM, runTableParser, buildBOMFromText,
  createManufacturingFromWeb, getManufacturingHouseOptions, getManufacturingProductOptions, getManufacturingPlacementOptions,
  generateMaterialConsumptionReportWeb, getCurrentMaterialReportWeb, saveMaterialConsumptionReportWeb,
  listSavedMaterialReportsWeb, renameSavedMaterialReportWeb, deleteSavedMaterialReportWeb,
});
