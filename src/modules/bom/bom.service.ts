//🏗️
import { parseSpec } from './parsers/parseSpec';
import { getOrCreateElement } from '../elements/element.factory';
import { parseTableText } from '../../utils/parseTableText';
import { deleteBOMTree, insertBOMRows } from './bom.repository';
import { mapTableRowToStructured } from './parsers/mappers/table-row.mapper';
import { mapElementToBOMItem } from './bom.mapper';
import { ElementShort } from '../elements/element.model';
import { TableRowInput } from './model/table-row-input.model';
import {
  ElementRepository,
  GoogleSheetsElementRepository,
} from '../elements/element.repository';
import { MockElementRepository } from '../elements/mock/mock.element.repository';
import {
  findMaterialForPart,
  getOrCreateMaterialFromPart,
} from '../../domain/materials/material.service';
import { buildByKind } from '../../modules/elements/builders/builder.dispatcher';
import { deleteBOMByParentId } from './bom.repository';
import { ProductDetector } from '../product/product.detector';

import { generateIdByType } from '../../utils/id';
import { parseParent } from './parsers/parseParent';
import { getOrCreateAssemblyWithName } from '../elements/assembly.service';
import { CatalogInMemoryRepository } from '../catalog/catalog.repository';
import { GoogleSheetsCatalogDataSource } from '../../infrastructure/sheets/catalog/GoogleSheetsCatalogDataSource';
import { StructuredLine } from './parsers/model/structured-line.model';

import { MaterialRepository } from '../../domain/materials/material.repository';
import { MaterialBatchRepository } from '../../domain/materials/material-batch.repository';
import { CatalogService } from '../catalog/catalog.service';
import { calcRebarWeight } from '../../utils/rebar';
import { getOrCreateMaterialFromCode } from '../elements/material.service';
import { getSheetByNameSafe } from '../../utils/sheets';
import { parseFromCode } from './parsers/parseSpec';
import { ParsedSpec } from './model/parsed-spec.model';
import { normalize, normalizeNumberString } from '../../utils/normalize';
import { extractPrefixFromSpec } from './parsers/prefix.resolver';

import { getOrCreateElementFromBuilt } from '../elements/element.factory';
import { parseStructuredLine } from './parsers/parseStucturedLine';
import { ICatalogRepository } from '../catalog/catalog.repository.interface';
import { buildFromTableRow } from './builders/tableRow.builder';
import { CatalogHelper } from '../catalog/catalog.helper';
import { GoogleSheetsMaterialBatchDataSource } from '../../domain/materials/googleSheetsMaterialBatch.datasource';
import { GoogleSheetsMaterialDataSource } from '../../domain/materials/googleSheetsMaterial.datasource';
import { buildAssemblyName } from 'modules/elements/builders/name.builder';

// const materialRepo = new MaterialRepository();

// export function buildBOMRow(
//   parentId: string,
//   // line: string,
//   row: TableRowInput,
//   now: Date,
//   repo: ElementRepository,
//   catalogHelper: CatalogHelper, // 🔥 зміна
//   materialRepo: MaterialRepository,
//   materialBatchRepo: MaterialBatchRepository,
// ): any[][] {
//   // const row = parseStructuredLine(line);
//   const prefix = row.prefix; //.toLowerCase();
//   const qty = row.qty ?? 1;
//   console.log('--- ROW DEBUG ---');
//   console.log('prefix:', prefix);
//   console.log('code:', row.code);
//   console.log('rawCode:', row.spec);

//   // ❌ БІЛЬШЕ НЕ ВИКОРИСТОВУЄМО
//   // const { resolvedType } = catalogService.resolveWithContext(...)

//   const parsed = /^[A-Z]+_\d+/.test(row.code)
//     ? parseFromCode(row.code)
//     : parseSpec(row.spec);

//   let built;

//   if (parsed.kind === 'assembly') {
//     built = {
//       code: row.code,
//       name: [row.prefix, row.spec].join(' '),
//       baseUnit: 'шт',
//     };
//   } else {
//     built = buildByKind(parsed);
//   }

//   if (!built.code || built.code.includes(' ')) {
//     throw new Error('❌ Invalid built code: ' + JSON.stringify(built));
//   }
//   console.log('PARSED:', parsed);

//   console.log('BUILT:', built);

//   // 🔥 тільки додаємо prefixName
//   const element = getOrCreateElementFromBuilt(
//     {
//       ...built,
//       prefixName: prefix, // ✔
//     },
//     repo,
//     catalogHelper, // 🔥 замість service
//     materialRepo,
//     materialBatchRepo,
//   );
//   console.log('BUILT:', built);
//   // 🔥 одиниця виміру
//   const unit = element.baseUnit;

//   console.log('RAW SPEC:', row.spec);
//   console.log('NORMALIZED SPEC:', normalize(row.spec));
//   return [[parentId, element.id, qty, unit, now]];
// }

export function buildBOMRow(
  parentId: string,
  row: TableRowInput,
  now: Date,
  repo: ElementRepository,
  catalogHelper: CatalogHelper,
  materialRepo: MaterialRepository,
  materialBatchRepo: MaterialBatchRepository,
): any[][] {
  // const prefix = row.prefix;
  // const qty = row.qty ?? 1;
  const prefix = row.prefix;
  const qty = row.qty ?? 1;

  const result: any[][] = [];

  const parent = repo.findById(parentId);

  if (!parent) {
    throw new Error(`Parent not found: ${parentId}`);
  }

  // 🔥 1. СПРОБА ЗНАЙТИ ЯК Є (ключове!)
  const existingElement = repo.findByCode(row.code);

  if (existingElement) {
    result.push([
      parentId,
      existingElement.id,
      qty,
      existingElement.baseUnit,
      now,
      parent.code,
      existingElement.code,
    ]);

    return result; // 🔥 ВИХІД — нічого більше не робимо
  }

  // 🔥 2. PARSE (тільки якщо НЕ знайдено)
  const parsed = parseSpec(row.spec);

  // 🔥 3. НЕ РОЗПІЗНАНО → STOP
  if (parsed.kind === 'assembly') {
    throw new Error(`❌ Element not found in 00_Elements: ${row.code}`);
  }

  // const parsed = /^[A-Z]+_\d+/.test(row.code)
  //   ? parseFromCode(row.code)
  //   : parseSpec(row.spec);

  // if (parsed.kind === 'assembly') {
  //   built = {
  //     code: row.code,
  //     name: [row.prefix, row.spec].join(' '),
  //     baseUnit: 'шт',
  //   };
  // } else {
  //   built = buildByKind(parsed);
  // }
  if (parsed.kind === 'unknown') {
    throw new Error(`❌ Element not found in 00_Elements: ${row.code}`);
  }

  const built = buildByKind(parsed);

  const element = getOrCreateElementFromBuilt(
    {
      ...built,
      prefixName: prefix,
    },
    repo,
    catalogHelper,
    materialRepo,
    materialBatchRepo,
  );

  const unit = element.baseUnit;

  // const result: any[][] = [];

  // const parent = repo.findById(parentId);

  if (!parent) {
    throw new Error(`Parent not found: ${parentId}`);
  }

  // 🔹 1. Parent → Child
  result.push([
    parentId,
    element.id,
    qty,
    unit,
    now,
    parent.code,
    element.code,
  ]);

  // 🔥 2. PART → MATERIAL (КЛЮЧОВЕ!)

  if (element.type === 'part' && element.parentMaterialID) {
    const materialId = element.parentMaterialID;

    const material = materialRepo.findById(materialId);

    if (!material) {
      throw new Error(`Material not found: ${materialId}`);
    }

    const batch = materialBatchRepo.findActiveByMaterialId(materialId);

    if (!batch) {
      throw new Error(`❌ Немає партії для матеріалу ${material.code}. 
        Додайте в 06_MaterialBatches активну партію для цього матеріалу.`);
    }

    if (built.length == null) {
      throw new Error(`Length missing for element: ${built.code}`);
    }

    if (batch.weightPerMeter == null) {
      throw new Error(`weightPerMeter missing for material: ${material.code}`);
    }

    const meters = built.length / 1000;

    let materialQty = meters * batch.weightPerMeter * qty;

    materialQty = Math.round(materialQty * 100) / 100;

    result.push([
      element.id,
      materialId,
      materialQty,
      'кг',
      now,
      element.code,
      material.code,
    ]);
  }

  return result;
}

type Input = {
  parentCode: string;
  specification: string;
};

export function validateParentCode(code: string) {
  if (code.includes(';')) {
    throw new Error('Parent code contains invalid ";" : ' + code);
  }

  if (!code.trim()) {
    throw new Error('Parent code is empty');
  }
}

export function buildBOMFromTable(
  parent: { code: string; prefix: string; name: string },
  rows: TableRowInput[],
  elementRepo: ElementRepository,
  catalogHelper: CatalogHelper,
  materialRepo: MaterialRepository,
  materialBatchRepo: MaterialBatchRepository,
) {
  console.log('👉 START buildBOMFromTable');

  const root = getOrCreateAssemblyWithName(
    parent.code,
    parent.prefix,
    buildAssemblyName(parent.prefix, parent.code),
    elementRepo,
  );

  const parentId = root.id;

  deleteBOMTree(parentId);

  const now = new Date();

  const rawRows: any[][] = [];
  const errors: any[] = [];

  for (const row of rows) {
    try {
      const lines = buildBOMRow(
        parentId,
        row, // ✔ тепер ок
        now,
        elementRepo, // ✔ виправлено
        catalogHelper,
        materialRepo,
        materialBatchRepo,
      );

      rawRows.push(...lines); // ✔ замість result
    } catch (e) {
      console.error('❌ ROW ERROR:', row, e);
      errors.push(row);
    }
  }

  console.log('BOM ROWS:', rawRows);

  const aggregated = aggregateBOMRows(rawRows);

  insertBOMRows(aggregated);

  return {
    added: aggregated.length,
    errors,
    errorCount: errors.length,
  };
}

// export function buildBOMFromTable(
//   parent: { code: string; prefix: string; name: string },
//   rows: TableRowInput[],
//   elementRepo: ElementRepository,
//   // catalogRepo: ICatalogRepository,
//   catalogHelper: CatalogHelper,
//   materialRepo: MaterialRepository,
//   materialBatchRepo: MaterialBatchRepository,
// ) {
//   console.log('👉 START buildBOMFromTable');

//   // 🔹 Root element
//   const root = getOrCreateAssemblyWithName(
//     parent.code,
//     parent.prefix,
//     parent.name,
//     elementRepo,
//   );

//   const parentId = root.id;

//   deleteBOMTree(parentId);

//   const now = new Date();

//   const rawRows: any[][] = [];
//   const errors: any[] = [];

//   // for (const row of rows) {
//   //   try {
//   //     // 🔥 1. parse spec
//   //     const parsed = parseSpec(row.spec);

//   //     if (parsed.kind === 'assembly') {
//   //       throw new Error('❌ Spec not parsed: ' + row.spec);
//   //     }

//   //     // 🔥 2. build
//   //     const built = buildByKind(parsed);

//   //     // 🔥 3. create element
//   //     const element = getOrCreateElementFromBuilt(
//   //       {
//   //         ...built,
//   //         prefixName: row.prefix.toLowerCase(),
//   //       },
//   //       elementRepo,
//   //       catalogHelper,
//   //       materialRepo,
//   //       materialBatchRepo,
//   //     );

//   //     // 🔥 4. unit
//   //     const unit = element.baseUnit;

//   //     rawRows.push([parentId, element.id, row.qty, unit, now]);
//   //   } catch (e) {
//   //     console.error('❌ ROW ERROR:', row, e);
//   //     errors.push(row);
//   //   }
//   // }

//   for (const row of rows) {
//     const lines = buildBOMRow(
//       parentId,
//       row,
//       now,
//       materialRepo,
//       catalogHelper,
//       materialRepo,
//       materialBatchRepo,
//     );

//     result.push(...lines);
//   }

//   console.log('BOM ROWS:', rows);

//   const aggregated = aggregateBOMRows(rawRows);

//   insertBOMRows(aggregated);

//   return {
//     added: aggregated.length,
//     errors,
//     errorCount: errors.length,
//   };
// }

// export function buildBOMFromTable(
//   parent: { code: string; prefix: string; name: string },
//   rows: TableRowInput[],
//   repo: ElementRepository,
//   catalogService: CatalogService,
//   materialBatchRepo: MaterialBatchRepository,
// ) {
//   console.log('👉 START buildBOMFromTable');

//   const root = getOrCreateAssemblyWithName(
//     parent.code,
//     parent.prefix,
//     parent.name,
//     repo,
//   );

//   const parentId = root.id;

//   deleteBOMTree(parentId);

//   const now = new Date();

//   const rawRows: any[][] = [];
//   const errors: any[] = [];

//   // 🔥 ДОДАТИ
//   const materialSheet = getSheetByNameSafe('05_Materials');
//   const materialRows = materialSheet.getDataRange().getValues();

//   const materialRepo = new MaterialRepository(materialRows);
//   // const materialRepo = new MaterialRepository();

//   function buildLineFromRow(row: TableRowInput): string {
//     return `${row.prefix}; ${row.spec}; ${row.qty}`;
//   }

//   for (const row of rows) {
//     try {
//       const line = buildLineFromRow(row); // 🔥

//       const bomRows = buildBOMRow(
//         parentId,
//         line,
//         now,
//         repo,
//         catalogService,
//         materialRepo,
//         materialBatchRepo, // 🔥 додати
//       );

//       rawRows.push(...bomRows);
//     } catch (e) {
//       console.error('❌ ROW ERROR:', row, e);
//       errors.push(row);
//     }
//   }
//   console.log('BOM ROWS:', rows);

//   const aggregated = aggregateBOMRows(rawRows);

//   insertBOMRows(aggregated);

//   return {
//     added: aggregated.length,
//     errors,
//     errorCount: errors.length,
//   };
// }

// export function buildBOMFromTable(
//   parent: { code: string; prefix: string; name: string },
//   rows: TableRowInput[],
//   repo: ElementRepository,
//   // catalogRepo: ICatalogRepository,
//   catalogService: CatalogService,
// ) {
//   console.log('👉 START buildBOMFromTable');

//   const root = getOrCreateAssemblyWithName(
//     parent.code,
//     parent.prefix,
//     parent.name,
//     repo,
//   );

//   const parentId = root.id;

//   deleteBOMTree(parentId);

//   const now = new Date();

//   const rawRows: any[][] = [];
//   const errors: any[] = [];

//   for (const row of rows) {
//     try {
//       const structured = mapTableRowToStructured(row);

//       const bomRows = buildBOMRow(
//         parentId,
//         line,
//         now,
//         repo,
//         catalogService,
//         materialRepo, // 🔥 ОБОВʼЯЗКОВО
//       );

//       rawRows.push(...bomRows);
//     } catch (e) {
//       console.error('❌ ROW ERROR:', row, e);
//       errors.push(row);
//     }
//   }

//   const aggregated = aggregateBOMRows(rawRows);

//   insertBOMRows(aggregated);

//   //👉 тимчасово прибери
//   // const detector = new ProductDetector(repo);
//   // detector.detectAndUpdate(parentId, aggregated);

//   return {
//     added: aggregated.length,
//     errors,
//     errorCount: errors.length,
//   };
// }

// 🔥 допоміжна функція для визначення типу батьківського елемента
function detectParentTypeFromInput(lines: string[]): 'product' | 'assembly' {
  return lines.some((line) => line.toLowerCase().includes('бетон'))
    ? 'product'
    : 'assembly';
}

export function buildBOMFromText(data: Input) {
  console.log('🔥 START buildBOMFromText');

  const repo = new GoogleSheetsElementRepository();

  const ds = new GoogleSheetsCatalogDataSource();
  const rowsCatalog = ds.getRows();

  const catalogRepo = new CatalogInMemoryRepository(rowsCatalog);

  // 🔥 новий шар
  const catalogHelper = new CatalogHelper(catalogRepo);

  // 🔹 Parent
  const parsedParent = parseParent(data.parentCode);
  validateParentCode(parsedParent.code);

  const tableRows = parseTableText(data.specification);

  console.log('TABLE ROWS:', JSON.stringify(tableRows, null, 2));

  // 🔥 передаємо service, а не repo

  const materialDS = new GoogleSheetsMaterialDataSource();
  const materialRepo = new MaterialRepository(materialDS.getRows());

  const materialBatchDS = new GoogleSheetsMaterialBatchDataSource();
  const materialBatchRepo = new MaterialBatchRepository(
    materialBatchDS.getRows(),
  );
  return buildBOMFromTable(
    parsedParent,
    tableRows,
    repo,
    catalogHelper, // ✔
    materialRepo, // ✔
    materialBatchRepo, // ✔
  );
  // return buildBOMFromTable(parsedParent, tableRows, repo, catalogService);
}

export function aggregateBOMRows(rows: any[][]): any[][] {
  const map = new Map<string, any[]>();

  for (const r of rows) {
    const key = `${r[0]}_${r[1]}_${r[3]}`;

    if (map.has(key)) {
      map.get(key)![2] += r[2];
    } else {
      map.set(key, [...r]);
    }
  }

  return Array.from(map.values());
}

function extractSpecAndQty(line: string): {
  spec: string;
  qty: number;
} {
  const parts = line.trim().split(/\s+/);

  if (parts.length === 0) {
    throw new Error('Empty line');
  }

  const last = parts[parts.length - 1];

  // якщо останнє значення — число → qty
  if (!isNaN(Number(last))) {
    const qty = Number(last);

    if (qty <= 0) {
      throw new Error('Qty <= 0');
    }

    parts.pop();

    return {
      spec: parts.join(' '),
      qty,
    };
  }

  // якщо qty не задано
  return {
    spec: line,
    qty: 1,
  };
}

// export function buildBOMRow(
//   parentId: string,
//   structuredRow: StructuredLine,
//   now: Date,
//   repo: ElementRepository,
//   catalogService: CatalogService,
//   materialRepo?: MaterialRepository,
//   batchRepo?: MaterialBatchRepository,
// ): any[][] {
//   const { prefix, code, suffix, qty } = structuredRow;

//   const safeQty =
//     typeof qty === 'number' ? qty : normalizeNumberString(String(qty ?? 1));

//   // ----------------------------
//   // 🔍 1. Визначаємо через Catalog
//   // ----------------------------
//   const catalog = catalogService.resolveFromRow({
//     codeEl: code,
//     rawCode: code, // 🔥 мінімальний фікс (Це тимчасовий костиль) прокинь rawCode з parser: StructuredLine {code: codeEl,rawCode: rawCode, // ✔}
//     prefix,
//     sufix: suffix,
//   });

//   let parsed: ParsedSpec;

//   // ----------------------------
//   // 🧠 2. Логіка вибору парсингу
//   // ----------------------------
//   const isNormalizedCode = /^[A-Z]+_\d+/.test(code);

//   if (catalog.type === 'part' || catalog.type === 'assembly') {
//     // 🔥 НЕ парсимо геометрію
//     parsed = {
//       kind: 'assembly',
//       name: code,
//     };
//   } else {
//     // 🔥 геометрія (арматура, труба, полоса...)
//     const name = [prefix, code, suffix].filter(Boolean).join(' ');

//     parsed = isNormalizedCode ? parseFromCode(code) : parseSpec(name);
//   }

//   // ----------------------------
//   // 🧱 3. Створюємо елемент
//   // ----------------------------
//   const element = getOrCreateElement(parsed, repo, catalogService);

//   const parent = repo.findById(parentId);

//   if (!parent) {
//     throw new Error(`Parent element not found: ${parentId}`);
//   }

//   // ----------------------------
//   // 🧱 MATERIAL (простий випадок)
//   // ----------------------------
//   if (element.type === 'material') {
//     console.log('FINAL Qty (material) type:', typeof safeQty, safeQty);
//     return [
//       [
//         parentId,
//         element.id,
//         safeQty,
//         element.baseUnit,
//         now,
//         parent.code,
//         element.code,
//       ],
//     ];
//   }

//   // ----------------------------
//   // 🔩 PART → MATERIAL
//   // ----------------------------
//   if (element.type === 'part') {
//     // const built = buildByKind(parsed);
//     const prefix = extractPrefixFromSpec(parsed);

//     const catalog = catalogRepo.requireByTypeCode(prefix);

//     let materialQty = safeQty;

//     let materialId: string | null = null;
//     let materialCode: string | null = null;

//     // 🔥 FULL режим (через склад)
//     if (materialRepo && batchRepo) {
//       const material = materialRepo.findBySpec({
//         profileType: built.profileType,
//         diameter: built.diameter,
//         class: built.className,
//         width: built.width,
//         height: built.height,
//         thickness: built.thickness,
//       });

//       if (!material) {
//         throw new Error(`❌ Material not found for part: ${element.code}`);
//       }

//       const batch = batchRepo.getActiveBatch(material.materialId);

//       if (!batch) {
//         throw new Error(`❌ No batch for material: ${material.code}`);
//       }

//       if (built.length) {
//         const meters = built.length / 1000;
//         materialQty = meters * batch.weightPerUnit * safeQty;
//       }

//       materialId = String(material.materialId);
//       materialCode = material.code;
//     }

//     // 🔥 FALLBACK (через Elements)
//     else {
//       const materialCodeBase = element.code.split('_L')[0];

//       const material = getOrCreateMaterialFromCode(materialCodeBase, repo);

//       // 🔥 розрахунок ваги для арматури
//       if (
//         built.category === 'rebar' &&
//         typeof built.length === 'number' &&
//         typeof built.diameter === 'number'
//       ) {
//         materialQty = calcRebarWeight(built.length, built.diameter, safeQty);
//       }

//       materialId = material.id;
//       materialCode = material.code;
//     }

//     materialQty = Math.round(materialQty * 100) / 100;

//     updateElementParentMaterial(element.id, materialId);
//     console.log(
//       'FINAL Qty (FALLBACK (через Elements) type:',
//       typeof safeQty,
//       safeQty,
//     );
//     return [
//       [
//         parentId,
//         element.id,
//         safeQty,
//         element.baseUnit,
//         now,
//         parent.code,
//         element.code,
//       ],
//       [
//         element.id,
//         materialId,
//         materialQty,
//         'кг',
//         now,
//         element.code,
//         materialCode,
//       ],
//     ];
//   }

//   // ----------------------------
//   // 🔧 ASSEMBLY / PRODUCT
//   // ----------------------------
//   console.log('FINAL Qty (ASSEMBLY / PRODUCT) type:', typeof safeQty, safeQty);
//   return [
//     [
//       parentId,
//       element.id,
//       safeQty,
//       element.baseUnit,
//       now,
//       parent.code,
//       element.code,
//     ],
//   ];
// }
