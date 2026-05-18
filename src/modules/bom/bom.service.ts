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
import { normalizeSpec } from './parsers/utils/spec.utils';
import { MaterialRepository } from '../../domain/materials/material.repository';
import { MaterialBatchRepository } from '../../domain/materials/material-batch.repository';
import { CatalogService } from '../catalog/catalog.service';
import { calcRebarWeight } from '../../utils/rebar';
import { getOrCreateMaterialFromCode } from '../elements/material.service';
import { getSheetByNameSafe } from '../../utils/sheets';
import { parseFromCode } from './parsers/parseSpec';
import { ParsedSpec } from './model/parsed-spec.model';
import { normalizeNumberString } from '../../utils/normalize';

export function buildBOMRow(
  parentId: string,
  structuredRow: StructuredLine,
  now: Date,
  repo: ElementRepository,
  catalogService: CatalogService,
  materialRepo?: MaterialRepository,
  batchRepo?: MaterialBatchRepository,
): any[][] {
  const { prefix, code, suffix, qty } = structuredRow;

  const safeQty =
    typeof qty === 'number' ? qty : normalizeNumberString(String(qty ?? 1));

  // ----------------------------
  // 🔍 1. Визначаємо через Catalog
  // ----------------------------
  const catalog = catalogService.resolveFromRow({
    codeEl: code,
    rawCode: code, // 🔥 мінімальний фікс (Це тимчасовий костиль) прокинь rawCode з parser: StructuredLine {code: codeEl,rawCode: rawCode, // ✔}
    prefix,
    sufix: suffix,
  });

  let parsed: ParsedSpec;

  // ----------------------------
  // 🧠 2. Логіка вибору парсингу
  // ----------------------------
  const isNormalizedCode = /^[A-Z]+_\d+/.test(code);

  if (catalog.type === 'part' || catalog.type === 'assembly') {
    // 🔥 НЕ парсимо геометрію
    parsed = {
      kind: 'assembly',
      name: code,
    };
  } else {
    // 🔥 геометрія (арматура, труба, полоса...)
    const name = [prefix, code, suffix].filter(Boolean).join(' ');

    parsed = isNormalizedCode ? parseFromCode(code) : parseSpec(name);
  }

  // ----------------------------
  // 🧱 3. Створюємо елемент
  // ----------------------------
  const element = getOrCreateElement(parsed, repo, catalogService);

  const parent = repo.findById(parentId);

  if (!parent) {
    throw new Error(`Parent element not found: ${parentId}`);
  }

  // ----------------------------
  // 🧱 MATERIAL (простий випадок)
  // ----------------------------
  if (element.type === 'material') {
    console.log('FINAL Qty (material) type:', typeof safeQty, safeQty);
    return [
      [
        parentId,
        element.id,
        safeQty,
        element.baseUnit,
        now,
        parent.code,
        element.code,
      ],
    ];
  }

  // ----------------------------
  // 🔩 PART → MATERIAL
  // ----------------------------
  if (element.type === 'part') {
    const built = buildByKind(parsed);

    let materialQty = safeQty;

    let materialId: string | null = null;
    let materialCode: string | null = null;

    // 🔥 FULL режим (через склад)
    if (materialRepo && batchRepo) {
      const material = materialRepo.findBySpec({
        profileType: built.profileType,
        diameter: built.diameter,
        class: built.className,
        width: built.width,
        height: built.height,
        thickness: built.thickness,
      });

      if (!material) {
        throw new Error(`❌ Material not found for part: ${element.code}`);
      }

      const batch = batchRepo.getActiveBatch(material.materialId);

      if (!batch) {
        throw new Error(`❌ No batch for material: ${material.code}`);
      }

      if (built.length) {
        const meters = built.length / 1000;
        materialQty = meters * batch.weightPerUnit * safeQty;
      }

      materialId = String(material.materialId);
      materialCode = material.code;
    }

    // 🔥 FALLBACK (через Elements)
    else {
      const materialCodeBase = element.code.split('_L')[0];

      const material = getOrCreateMaterialFromCode(materialCodeBase, repo);

      // 🔥 розрахунок ваги для арматури
      if (
        built.category === 'rebar' &&
        typeof built.length === 'number' &&
        typeof built.diameter === 'number'
      ) {
        materialQty = calcRebarWeight(built.length, built.diameter, safeQty);
      }

      materialId = material.id;
      materialCode = material.code;
    }

    materialQty = Math.round(materialQty * 100) / 100;

    updateElementParentMaterial(element.id, materialId);
    console.log(
      'FINAL Qty (FALLBACK (через Elements) type:',
      typeof safeQty,
      safeQty,
    );
    return [
      [
        parentId,
        element.id,
        safeQty,
        element.baseUnit,
        now,
        parent.code,
        element.code,
      ],
      [
        element.id,
        materialId,
        materialQty,
        'кг',
        now,
        element.code,
        materialCode,
      ],
    ];
  }

  // ----------------------------
  // 🔧 ASSEMBLY / PRODUCT
  // ----------------------------
  console.log('FINAL Qty (ASSEMBLY / PRODUCT) type:', typeof safeQty, safeQty);
  return [
    [
      parentId,
      element.id,
      safeQty,
      element.baseUnit,
      now,
      parent.code,
      element.code,
    ],
  ];
}

// Виправлена (гнучка) версія для роботи з різними типами специфікацій (через парсер)
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

//   const safeQty = qty ?? 1;

//   const name = [prefix, code, suffix].filter(Boolean).join(' ');

//   // const normalized = normalizeSpec(name);
//   // const parsed = parseSpec(normalized);

//   const isNormalized = /^[A-Z]+_\d+/.test(code);

//   const parsed = isNormalized
//     ? parseFromCode(code) // 🔥 новий шлях
//     : parseSpec(normalizeSpec(name));

//   const element = getOrCreateElement(parsed, repo, catalogService);
//   const parent = repo.findById(parentId);

//   if (!parent) {
//     throw new Error(`Parent element not found: ${parentId}`);
//   }

//   // ----------------------------
//   // 🧱 MATERIAL
//   // ----------------------------
//   if (element.type === 'material') {
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
//     const built = buildByKind(parsed);

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
//       const requestedMaterialCode = extractMaterialCode(structuredRow.code);

//       const material = getOrCreateMaterialFromCode(requestedMaterialCode, repo);

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

function extractMaterialCode(code: string): string {
  return code.split(',')[0];
}

function updateElementParentMaterial(
  elementId: string,
  materialId: string | null,
) {
  if (!materialId) return;

  const sheet = getSheetByNameSafe('00_Elements');
  const data = sheet.getDataRange().getValues();

  if (data.length <= 1) return;

  const headers = data[0];
  const idIdx = headers.indexOf('ID');
  const parentMaterialIdx = headers.indexOf('ParentMaterialID');
  const parentTypeIdx = headers.indexOf('ParentType');

  if (idIdx === -1 || parentMaterialIdx === -1 || parentTypeIdx === -1) {
    throw new Error('Columns ID, ParentMaterialID or ParentType not found');
  }

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idIdx]) === String(elementId)) {
      const rowIndex = i + 1;

      sheet
        .getRange(rowIndex, parentMaterialIdx + 1)
        .setValue(String(materialId));
      sheet.getRange(rowIndex, parentTypeIdx + 1).setValue('material');
      return;
    }
  }
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
  parent: { code: string; name: string },
  rows: TableRowInput[],
  repo: ElementRepository,
  // catalogRepo: ICatalogRepository,
  catalogService: CatalogService,
) {
  console.log('👉 START buildBOMFromTable');

  const root = getOrCreateAssemblyWithName(parent.code, parent.name, repo);

  const parentId = root.id;

  deleteBOMTree(parentId);

  const now = new Date();

  const rawRows: any[][] = [];
  const errors: any[] = [];

  for (const row of rows) {
    try {
      const structured = mapTableRowToStructured(row);

      const bomRows = buildBOMRow(
        parentId,
        structured,
        now,
        repo,
        catalogService,
      );

      rawRows.push(...bomRows);
    } catch (e) {
      console.error('❌ ROW ERROR:', row, e);
      errors.push(row);
    }
  }

  const aggregated = aggregateBOMRows(rawRows);

  insertBOMRows(aggregated);

  //👉 тимчасово прибери
  // const detector = new ProductDetector(repo);
  // detector.detectAndUpdate(parentId, aggregated);

  return {
    added: aggregated.length,
    errors,
    errorCount: errors.length,
  };
}

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

  // 🔥 додаємо сервіс
  const catalogService = new CatalogService(catalogRepo);

  // 🔹 Parent
  const parsedParent = parseParent(data.parentCode);
  validateParentCode(parsedParent.code);

  const tableRows = parseTableText(data.specification);

  console.log('TABLE ROWS:', JSON.stringify(tableRows, null, 2));

  // 🔥 передаємо service, а не repo
  return buildBOMFromTable(parsedParent, tableRows, repo, catalogService);
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
