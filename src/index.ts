import { onOpen } from './main';
import { openForm, openFormTable } from './ui/openForm';
import { buildBOMFromText } from './modules/bom/bom.service';
import { testBOM } from './dev/test-bom';
import { register } from './core/register';

import { GoogleSheetsElementRepository } from './modules/elements/element.repository';
import { buildBOMFromTable } from './modules/bom/parsers/bom-table.parser';
import { parseTableText } from './utils/parseTableText';
//from './modules/bom/utils/parseTableText';

// 🔥 НОВА ФУНКЦІЯ
function runTableParser(parentCode: string, text: string) {
  const repo = new GoogleSheetsElementRepository();

  const rows = parseTableText(text);

  const count = buildBOMFromTable(rows, parentCode, repo);

  return `Inserted rows: ${count}`;
}

// 🔥 РЕЄСТРАЦІЯ ВСЬОГО
register({
  onOpen,
  openForm,
  openFormTable,
  buildBOMFromText,
  testBOM,
  runTableParser, // 🔥 ДОДАТИ
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
