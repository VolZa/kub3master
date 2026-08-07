import { onOpen } from './main';
import { openFormTable } from './ui/openForm';
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
});
