import { onOpen } from './main';
import { openForm, openFormTable } from './ui/openForm';
import { buildBOMFromText, buildBOMFromTable } from './modules/bom/bom.service';
// import { buildBOMFromTable } from './modules/bom/bom-table.parser';
// import { testBOM } from './dev/test-bom';
import { register } from './core/register';

import { GoogleSheetsElementRepository } from './modules/elements/element.repository';
import { parseTableText } from './utils/parseTableText';
// import { GoogleSheetsCatalogRepository } from './infrastructure/sheets/catalog/GoogleSheetsCatalogRepository';
import { GoogleSheetsCatalogDataSource } from './infrastructure/sheets/catalog/GoogleSheetsCatalogDataSource';
import { CatalogInMemoryRepository } from './modules/catalog/catalog.repository';
import { CatalogService } from './modules/catalog/catalog.service';
import { parseParent } from './modules/bom/parsers/parseParent';
import { validateParentCode } from './modules/bom/bom.service';
import { GoogleSheetsMaterialBatchRepository } from './domain/materials/googleSheetsMaterialBatch.repository';
import { MaterialRepository } from './domain/materials/material.repository';
import { MaterialBatchRepository } from './domain/materials/material-batch.repository';
import { GoogleSheetsMaterialDataSource } from './domain/materials/googleSheetsMaterial.datasource';
import { GoogleSheetsMaterialBatchDataSource } from './domain/materials/googleSheetsMaterialBatch.datasource';
import { CatalogHelper } from './modules/catalog/catalog.helper';

// import { parseTableText } from './modules/bom/utils/parseTableText';
// import { buildBOMFromTable } from './modules/bom/bom-table.parser';
// import { testBOM } from './dev/test-bom';
// import { register } from './core/register';
//from './modules/bom/utils/parseTableText';

// 🔥 НОВА ФУНКЦІЯ
// function runTableParser(parentCode: string, text: string) {
//   const repo = new GoogleSheetsElementRepository();
//   const catalogRepo = new GoogleSheetsCatalogDataSource();
//   const rows = parseTableText(text);

//   const count = buildBOMFromTable(rows, parentCode, repo, catalogRepo);

//   return `Inserted rows: ${count}`;
// }
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

// function runTableParser(parentCode: string, text: string) {
//   const repo = new GoogleSheetsElementRepository();

//   const ds = new GoogleSheetsCatalogDataSource();
//   const rowsCatalog = ds.getRows();

//   const catalogRepo = new CatalogInMemoryRepository(rowsCatalog); // ✅
//   // console.log('🔹CATALOG ITEMS:', JSON.stringify(catalogRepo, null, 2));
//   // 🔥 додаємо сервіс
//   const catalogService = new CatalogService(catalogRepo);

//   // 🔹 Матеріали
//   const materialBatchRepo = new GoogleSheetsMaterialBatchRepository();

//   // 🔹 Parent
//   const parsedParent = parseParent(parentCode);
//   validateParentCode(parsedParent.code);

//   const rows = parseTableText(text);

//   // console.log('PARSED ROWS:', JSON.stringify(rows, null, 2));
//   const count = buildBOMFromTable(parsedParent, rows, repo, catalogService, materialBatchRepo);
//   // console.log('FINAL COUNT:', count);

//   return `Inserted rows: ${count}`;
// }

// 🔥 РЕЄСТРАЦІЯ ВСЬОГО
register({
  onOpen,
  openForm,
  openFormTable,
  buildBOMFromText,
  // testBOM,
  runTableParser,
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
