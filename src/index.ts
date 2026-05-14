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
  const repo = new GoogleSheetsElementRepository();

  const ds = new GoogleSheetsCatalogDataSource();
  const rowsCatalog = ds.getRows();

  const catalogRepo = new CatalogInMemoryRepository(rowsCatalog); // ✅
  // console.log('🔹CATALOG ITEMS:', JSON.stringify(catalogRepo, null, 2));
  // 🔥 додаємо сервіс
  const catalogService = new CatalogService(catalogRepo);

  // 🔹 Parent
  const parsedParent = parseParent(parentCode);
  validateParentCode(parsedParent.code);

  const rows = parseTableText(text);

  // console.log('PARSED ROWS:', JSON.stringify(rows, null, 2));
  const count = buildBOMFromTable(parsedParent, rows, repo, catalogService);
  // console.log('FINAL COUNT:', count);

  return `Inserted rows: ${count}`;
}

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
