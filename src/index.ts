import { onOpen } from './main';
import { openFormTable } from './ui/openForm';
import { doGet } from './ui/webApp';
import { buildBOMFromText, buildBOMFromTable } from './modules/bom/bom.service';
import { register } from './core/register';
import { parseTableText } from './utils/parseTableText';
import { parseParent } from './modules/bom/parsers/parseParent';
import { validateParentCode } from './modules/bom/bom.service';
import { CatalogHelper } from './modules/catalog/catalog.helper';
import {
  handleProductionEdit_,
  handleKrabsEdit_,
} from 'modules/productionJournal/productionJournal.service';
import { testBOMExplorer } from './modules/bom/tests/test.bom-explorer';
import { testBOMTree } from './modules/bom/tests/testBOMTree';
import { testMaterials } from './modules/bom/tests/test-materials';
import { testProductionRequirement } from './modules/bom/tests/test-production';
import { testProductReport } from './modules/reports/tests/testProductReport';
import { getElementRepository } from './app/factories/element.factory';
import { getCatalogRepository } from './app/factories/catalog.factory';
import { getMaterialRepository } from './app/factories/material.factory';
import { getMaterialBatchRepository } from './app/factories/materialBatch.factory';
import { previewProductionSynchronization } from './debug/production-synchronization.debug';
import { productionSynchronizationSmokeTest } from './debug/production-synchronization.smoke';
import { analyzeProduction, executeProduction } from './menu/production.menu';
import { debugProjectContext } from './debug/debug-project-context';
import { testP1BOM } from './modules/bom/tests/testP1BOM';
import { testP1Materials } from 'modules/bom/tests/testP1Materials';

import { generateProjectMaterialMatrixReport } from './modules/project/generateProjectMaterialMatrixReport';
import { diagnoseProductP1 } from './modules/bom/tests/diagnose-product-bom';
// import { testManufacturingDataSource } from './modules/bom/tests/testManufacturingDataSource';
// import { testManufacturingMapper } from './modules/bom/tests/testManufacturingMapper';
import { testManufacturingResolver } from './modules/manufacturing/tests/testManufacturingResolver';
import { testManufacturingProcessor } from 'modules/manufacturing/tests/testManufacturingProcessor';

import { manufacturingInitialMigration } from 'modules/manufacturing/migration/manufacturingInitialMigration';
import { testManufacturingDomainMapper } from 'modules/manufacturing/tests/testManufacturingDomainMapper';
import { testManufacturingSyncStateRepository } from 'modules/manufacturing/tests/testManufacturingSyncStateRepository';
import { testManufacturingSynchronizationAnalyze } from 'modules/manufacturingSync/tests/manufacturing-synchronization.test';
import { testManufacturingSynchronizationExecute } from 'modules/manufacturingSync/tests/manufacturing-synchronization-execute.test';
import { testManufacturingSynchronizationApplication } from 'modules/manufacturingSync/tests/manufacturing-synchronization-application.test';
import { testManufacturingSynchronizationCancel } from 'modules/manufacturingSync/tests/manufacturing-synchronization-cancel.test';
import { testManufacturingSynchronizationMove } from 'modules/manufacturingSync/tests/manufacturing-synchronization-move.test';
import { testManufacturingSynchronizationDetach } from 'modules/manufacturingSync/tests/manufacturing-synchronization-detach.test';
import { testManufacturingSynchronizationDetachAnalyze } from 'modules/manufacturingSync/tests/manufacturing-synchronization-detach-analyze.test';
import { testManufacturingSynchronizationDetachIntegration } from 'modules/manufacturingSync/tests/manufacturing-synchronization-detach-integration.test';
import { testManufacturingSynchronizationBatchAnalyze } from 'modules/manufacturingSync/tests/manufacturing-synchronization-batch-analyze.test';
import { testManufacturingSynchronizationBatchExecute } from 'modules/manufacturingSync/tests/manufacturing-synchronization-batch-execute.test';
import { testManufacturingSynchronizationBatchRepeat } from 'modules/manufacturingSync/tests/manufacturing-synchronization-batch-repeat.test';
import { testManufacturingRepositorySave } from 'modules/manufacturing/tests/manufacturing-repository-save.test';
import { testManufacturingInputValidator } from 'modules/manufacturingSync/tests/manufacturing-input-validator.test';
import { testManufacturingIdGenerator } from 'modules/manufacturing/tests/manufacturing-id-generator.test';
// import { testManufacturingCreationStructure } from 'modules/manufacturing/tests/manufacturing-input-validator.test';
// import { testManufacturingCreationFormulaDebug } from 'modules/manufacturing/tests/manufacturing-creation-formula-debug.test';
import { testManufacturingCreationService } from 'modules/manufacturing/tests/manufacturing-creation-service.test';
import { testManufacturingCreationApplicationService } from 'modules/manufacturing/tests/manufacturing-creation-application-service.test';
import { testManufacturingInputBufferDebug } from 'modules/manufacturing/tests/manufacturing-input-buffer-debug.test';
import { testManufacturingInputBufferMapper } from 'modules/manufacturing/tests/manufacturing-input-buffer-mapper.test';
import { testGoogleSheetsManufacturingBufferReader } from 'modules/manufacturing/tests/google-sheets-manufacturing-buffer-reader.test';
import { testManufacturingBufferCreationApplicationService } from 'modules/manufacturing/tests/manufacturing-buffer-creation-application-service.test';
import { testCreateManufacturingFromBuffer } from 'modules/manufacturing/tests/create-manufacturing-from-buffer.test';
import { testManufacturingWebInputMapper } from 'modules/manufacturing/tests/manufacturing-web-input-mapper.test';
import { testManufacturingHouseOptionsService } from 'modules/manufacturing/tests/manufacturing-house-options.service.test';
import { testManufacturingProductOptionsService } from 'modules/manufacturing/tests/manufacturing-product-options.service.test';
import { testManufacturingPlacementOptionsService } from 'modules/manufacturing/tests/manufacturing-placement-options.service.test';
import { testManufacturingWebOptionsApi } from 'modules/manufacturingSync/tests/manufacturing-web-options-api.test';

function testDiagnoseProductP1(): void {
  diagnoseProductP1();
}
function testGenerateProjectMaterialMatrixReport(): void {
  generateProjectMaterialMatrixReport('1');
}

function runTableParser(
  projectDocumentID: string,
  parentCode: string,
  text: string,
) {
  const elementRepo = getElementRepository();

  const catalogRepo = getCatalogRepository();

  const materialRepo = getMaterialRepository();

  const materialBatchRepo = getMaterialBatchRepository();

  // 🔹 Parent
  const parsedParent = {
    ...parseParent(parentCode),
    projectDocumentID,
  };
  validateParentCode(parsedParent.code);

  // 🔹 Table rows
  const rows = parseTableText(text);

  // 🔥 ГОЛОВНИЙ ВИКЛИК
  const catalogHelper = new CatalogHelper(catalogRepo);
  const count = buildBOMFromTable(
    parsedParent,
    rows,
    elementRepo,
    // catalogRepo, // ❗ замість catalogService
    catalogHelper, // 🔥 НОВЕ ❗ замість catalogRepo
    materialRepo, // 🔥 НОВЕ
    materialBatchRepo, // 🔥 НОВЕ
  );

  return `Inserted rows: ${count}`;
}

function onEdit(e: GoogleAppsScript.Events.SheetsOnEdit) {
  if (!e.range || !e.value) return;

  const sheet = e.range.getSheet();

  if (
    sheet.getName() === '01_Виготовлення' &&
    e.range.getA1Notation() === 'A2'
  ) {
    handleProductionEdit_();
    return;
  }

  if (sheet.getName() === '03_Краби' && e.range.getA1Notation() === 'A2') {
    handleKrabsEdit_();
    return;
  }
}

// 🔥 РЕЄСТРАЦІЯ ВСЬОГО
register({
  analyzeProduction,
  executeProduction,
  onOpen,
  openFormTable,
  doGet,
  buildBOMFromText,
  testBOMExplorer,
  testBOMTree,
  testMaterials,
  runTableParser,
  testProductionRequirement,
  testProductReport,
  previewProductionSynchronization,
  productionSynchronizationSmokeTest,
  debugProjectContext,
  testP1BOM,
  testP1Materials,

  testDiagnoseProductP1,
  testGenerateProjectMaterialMatrixReport,
  testManufacturingResolver,
  testManufacturingProcessor,
  manufacturingInitialMigration,
  testManufacturingDomainMapper,
  // testManufacturingDataSource,
  // testManufacturingMapper,
  testManufacturingSyncStateRepository,
  testManufacturingSynchronizationAnalyze,
  testManufacturingSynchronizationExecute,
  testManufacturingSynchronizationApplication,
  testManufacturingSynchronizationCancel,
  testManufacturingSynchronizationMove,
  testManufacturingSynchronizationDetach,
  testManufacturingSynchronizationDetachAnalyze,
  testManufacturingSynchronizationDetachIntegration,
  testManufacturingSynchronizationBatchAnalyze,
  testManufacturingSynchronizationBatchExecute,
  testManufacturingSynchronizationBatchRepeat,
  testManufacturingRepositorySave,
  testManufacturingInputValidator,
  testManufacturingIdGenerator,

  // Одноразовий інтеграційний тест — вже виконаний.
  // testManufacturingCreationStructure,

  // Тимчасова діагностика формули — більше не потрібна.
  // testManufacturingCreationFormulaDebug,
  testManufacturingCreationService,
  // testManufacturingCreationApplicationService,
  testManufacturingInputBufferDebug,
  testManufacturingInputBufferMapper,

  testGoogleSheetsManufacturingBufferReader,
  testManufacturingBufferCreationApplicationService,
  testCreateManufacturingFromBuffer,
  testManufacturingWebInputMapper,
  testManufacturingHouseOptionsService,
  testManufacturingProductOptionsService,
  testManufacturingPlacementOptionsService,
  testManufacturingWebOptionsApi,
});
