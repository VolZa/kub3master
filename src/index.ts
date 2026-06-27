import { onOpen } from './main';
import { openForm, openFormTable } from './ui/openForm';
import { buildBOMFromText, buildBOMFromTable } from './modules/bom/bom.service';

import { register } from './core/register';

import { GoogleSheetsElementRepository } from './modules/elements/element.repository';
import { parseTableText } from './utils/parseTableText';

import { GoogleSheetsCatalogDataSource } from './infrastructure/sheets/catalog/GoogleSheetsCatalogDataSource';
import { CatalogInMemoryRepository } from './modules/catalog/catalog.repository';

import { parseParent } from './modules/bom/parsers/parseParent';
import { validateParentCode } from './modules/bom/bom.service';
import { GoogleSheetsMaterialBatchRepository } from './domain/materials/googleSheetsMaterialBatch.repository';
import { MaterialRepository } from './domain/materials/material.repository';
import { MaterialBatchRepository } from './domain/materials/material-batch.repository';
import { GoogleSheetsMaterialDataSource } from './domain/materials/googleSheetsMaterial.datasource';
import { GoogleSheetsMaterialBatchDataSource } from './domain/materials/googleSheetsMaterialBatch.datasource';
import { CatalogHelper } from './modules/catalog/catalog.helper';
import { onEditProductionJournal } from 'modules/productionJournal/productionJournal.trigger';
import {
  handleProductionEdit_,
  handleKrabsEdit_,
} from 'modules/productionJournal/productionJournal.service';
import { testBOMExplorer } from './modules/bom/tests/test.bom-explorer';
import { testBOMTree } from './modules/bom/tests/testBOMTree';
import { testMaterials } from './modules/bom/tests/test-materials';
import { testProductionRequirement } from './modules/bom/tests/test-production';
import { testProductMatrix } from './modules/reports/tests/testProductMatrix';

function runTableParser(parentCode: string, text: string) {
  // 🔹 Elements
  const elementRepo = new GoogleSheetsElementRepository();

  // 🔹 Catalog
  const catalogDS = new GoogleSheetsCatalogDataSource();
  const catalogRows = catalogDS.getRows();

  const catalogRepo = new CatalogInMemoryRepository(catalogRows);

  // 🔹 Materials (05_Materials)
  const materialDS = new GoogleSheetsMaterialDataSource();
  const materialRows = materialDS.getRows();

  const materialRepo = new MaterialRepository(materialRows);

  // 🔹 Material Batches
  const materialBatchDS = new GoogleSheetsMaterialBatchDataSource();
  const materialBatchRows = materialBatchDS.getRows();

  const materialBatchRepo = new MaterialBatchRepository(materialBatchRows);

  // 🔹 Parent
  const parsedParent = parseParent(parentCode);
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
  onOpen,
  openForm,
  openFormTable,
  buildBOMFromText,
  testBOMExplorer,
  testBOMTree,
  testMaterials,
  runTableParser,
  testProductionRequirement,
  testProductMatrix,
});
// import { onOpen } from './main';
// import { openForm, openFormTable } from './ui/openForm';
// import { buildBOMFromText } from './modules/bom/bom.service';
// import { testBOM } from './dev/test-bom';
// import { register } from './core/register';

// register({
//   onOpen,
//   openForm,
//   openFormTable,
//   buildBOMFromText,
//   testBOM,
// });

// import { onOpen } from './main';
// import { openForm } from './ui/openForm';
// import { buildBOMFromText } from './modules/bom/bom.service';

// import { testBOM } from './dev/test-bom';
// import { register } from './core/register';

// register({
//   testBOM,
// });
// // 🔥 експортуємо в глобал
// (globalThis as any).onOpen = onOpen;
// (globalThis as any).openForm = openForm;
// (globalThis as any).buildBOMFromText = buildBOMFromText;

// import { onOpen } from './main';
// import { openForm } from './ui/openForm';

// // 🔥 просто виклик, без globalThis
// onOpen;
// openForm;
//==========

// import { onOpen } from './main';
// import { openForm } from './ui/openForm';

// (globalThis as any).onOpen = onOpen;
// (globalThis as any).openForm = openForm;
