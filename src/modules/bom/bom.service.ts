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
import { getOrCreateMaterialFromCode } from './bom.utils';
// Виправлена (гнучка) версія для роботи з різними типами специфікацій (через парсер)
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

  const safeQty = qty ?? 1;

  const name = [prefix, code, suffix].filter(Boolean).join(' ');

  const normalized = normalizeSpec(name);
  const parsed = parseSpec(normalized);

  const element = getOrCreateElement(parsed, repo, catalogService);

  // ----------------------------
  // 🧱 MATERIAL
  // ----------------------------
  if (element.type === 'material') {
    return [[parentId, element.id, safeQty, element.baseUnit, now]];
  }

  // ----------------------------
  // 🔩 PART → MATERIAL
  // ----------------------------
  if (element.type === 'part') {
    const built = buildByKind(parsed);

    let materialQty = safeQty;

    let materialId: string | null = null;

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
    }

    // 🔥 FALLBACK (через Elements)
    else {
      const materialCode = extractMaterialCode(structuredRow.code);

      const material = getOrCreateMaterialFromCode(materialCode, repo);

      if (
        built.category === 'rebar' &&
        typeof built.length === 'number' &&
        typeof built.diameter === 'number'
      ) {
        materialQty = calcRebarWeight(built.length, built.diameter, safeQty);
      }

      materialId = material.id;
    }

    materialQty = Math.round(materialQty * 100) / 100;

    return [
      [parentId, element.id, safeQty, element.baseUnit, now],
      [element.id, materialId, materialQty, 'кг', now],
    ];
  }

  // ----------------------------
  // 🔧 ASSEMBLY / PRODUCT
  // ----------------------------
  return [[parentId, element.id, safeQty, element.baseUnit, now]];
}

function extractMaterialCode(code: string): string {
  return code.split(',')[0];
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
// //debug
// import { debug } from '../../utils/debug';
// import { calcRebarWeight } from '../../utils/rebar';
// import { getOrCreateRebarPart } from '../../services/part.service';
// import { addMissingElement } from '../missing/missing.repository';
// import { ICatalogRepository } from '../catalog/catalog.repository.interface';
// import { mapTableRowToStructured } from './parsers/mappers/table-row.mapper';
// // import { parseStructuredLine } from './parsers/parseStucturedLine';
// import { CatalogService } from '../catalog/catalog.service';
// import { MaterialBatchRepository } from '../../domain/materials/material-batch.repository';
// // import { buildBOMFromTable } from './parsers/bom-table.parser';

// type CreateBOMInput = {
//   parentCode: string;
//   specification: string;
// };

// function _createBOM(data: CreateBOMInput): string {
//   console.log('RAW SPEC:\n' + data.specification);

//   const lines = data.specification.split('\n');

//   const parsed = lines.map((line) => {
//     const parts = line.trim().split(' ');
//     return {
//       name: parts.slice(0, -1).join(' '),
//       qty: Number(parts[parts.length - 1]),
//     };
//   });

//   console.log('PARSED:', JSON.stringify(parsed, null, 2));

//   return `Parsed ${parsed.length} items`;
// }

// export const createBOM = debug('createBOM', _createBOM);

/* Будує один рядок BOM  */
//Стара робоча версія на 5 аргументів
// export function buildBOMRow(
//   parentId: string,
//   structuredRow: StructuredLine,
//   now: Date,
//   repo: ElementRepository,
//   catalogService: CatalogService,
// ): any[][] {
//   const { prefix, code, suffix, qty } = structuredRow;

//   const safeQty = qty ?? 1;

//   const name = [prefix, code, suffix].filter(Boolean).join(' ');

//   // 🔥 normalize
//   const normalized = normalizeSpec(name);

//   // 🔥 parse
//   const parsed = parseSpec(normalized);

//   // 🔥 element
//   const element = getOrCreateElement(parsed, repo, catalogService);

//   // ----------------------------
//   // 🧱 MATERIAL (бетон)
//   // ----------------------------
//   if (element.type === 'material') {
//     return [[parentId, element.id, safeQty, element.baseUnit, now]];
//   }

//   // ----------------------------
//   // 🔩 PART → MATERIAL (старий стабільний варіант)
//   // ----------------------------
//   if (element.type === 'part') {
//     const built = buildByKind(parsed);

//     let materialQty = safeQty;

//     // 🔥 тільки для rebar поки
//     if (
//       built.category === 'rebar' &&
//       typeof built.length === 'number' &&
//       typeof built.diameter === 'number'
//     ) {
//       materialQty = calcRebarWeight(built.length, built.diameter, safeQty);

//       materialQty = Math.round(materialQty * 100) / 100;
//     }

//     // 🔥 створюємо матеріал (універсально)
//     const material = getOrCreateMaterialFromPart(built, repo);

//     return [
//       [parentId, element.id, safeQty, element.baseUnit, now],
//       [element.id, material.id, materialQty, 'кг', now],
//     ];
//   }

//   // ----------------------------
//   // 🔧 ASSEMBLY / PRODUCT
//   // ----------------------------
//   return [[parentId, element.id, safeQty, element.baseUnit, now]];
// }

//Нова версія з 7 аргументами для роботи з batchами матеріалів
// export function buildBOMRow(
//   parentId: string,
//   structuredRow: StructuredLine,
//   now: Date,
//   repo: ElementRepository,
//   catalogService: CatalogService,
// materialRepo: MaterialRepository,
// batchRepo: MaterialBatchRepository,
// ): any[][] {
//   const { prefix, code, suffix, qty } = structuredRow;

//   const safeQty = qty ?? 1;

//   const name = [prefix, code, suffix].filter(Boolean).join(' ');

//   // 🔥 parse
//   const normalized = normalizeSpec(name);
//   const parsed = parseSpec(normalized);

//   const element = getOrCreateElement(parsed, repo, catalogService);

//   // ----------------------------
//   // 🧱 MATERIAL (бетон і т.д.)
//   // ----------------------------
//   if (element.type === 'material') {
//     return [[parentId, element.id, safeQty, element.baseUnit, now]];
//   }

//   // ----------------------------
//   // 🔩 PART → MATERIAL (через довідник)
//   // ----------------------------
//   if (element.type === 'part') {
//     const built = buildByKind(parsed);

//     // 🔥 1. знайти матеріал
//     const material = materialRepo.findBySpec({
//       profileType: built.profileType,
//       diameter: built.diameter,
//       class: built.className,
//       width: built.width,
//       height: built.height,
//       thickness: built.thickness,
//     });

//     const batch = batchRepo.getActiveBatch(material.materialId);

//     if (!batch) {
//       throw new Error(`❌ No batch for material: ${material.code}`);
//     }

//     const meters = built.length / 1000;

//     let materialQty = meters * batch.weightPerUnit * safeQty;

//     if (!material) {
//       throw new Error(`❌ Material not found for part: ${element.code}`);
//     }

//     // 🔥 2. знайти партію
//     // const batch = materialRepo.getActiveBatch(material.materialId);

//     if (!batch) {
//       throw new Error(`❌ No active batch for material: ${material.code}`);
//     }

//     // 🔥 3. розрахунок через batch
//     //  let materialQty = safeQty;

//     if (built.length) {
//       const meters = built.length / 1000; // мм → м
//       materialQty = meters * batch.weightPerUnit * safeQty;
//     }

//     materialQty = Math.round(materialQty * 100) / 100;

//     return [
//       [parentId, element.id, safeQty, element.baseUnit, now],
//       [element.id, material.materialId, materialQty, 'кг', now],
//     ];
//   }

//   // ----------------------------
//   // 🔧 ASSEMBLY / PRODUCT
//   // ----------------------------
//   return [[parentId, element.id, safeQty, element.baseUnit, now]];
// }

// function buildStructuredRow(
//   parentId: string,
//   line: string,
//   now: Date,
//   repo: ElementRepository,
// ): any[][] {
//   const parts = line.split(';').map((p) => p.trim());

//   const code = parts[0];
//   const name = parts[1];
//   const qty = Number(parts[2] || 1);

//   if (!code) throw new Error('Empty code');

//   // 🔥 1. знайти або створити
//   let el = repo.findByCode(code);

//   if (!el) {
//     const id = generateIdByType(ELEMENT_TYPES.ASSEMBLY);

//     repo.insert({
//       ID: id,
//       Code: code, // ✅ ТІЛЬКИ code
//       Name: name || code, // ✅ name окремо
//       Type: ELEMENT_TYPES.ASSEMBLY,
//       Category: 'assembly',
//       BaseUnit: 'шт',
//       CreatedAt: new Date(),
//     });

//     el = repo.findById(id);
//     if (!el) {
//       throw new Error('Failed to re-fetch inserted element: ' + code);
//     }
//   }

//   return [[parentId, el.id, qty, 'шт', now]];
// }

// function aggregateBOMRows(rows: any[][]): any[][] {
//   const map = new Map<string, any[]>();

//   for (const row of rows) {
//     const parentId = row[0];
//     const childId = row[1];
//     const qty = Number(row[2]);

//     const key = `${parentId}_${childId}`;

//     if (map.has(key)) {
//       const existing = map.get(key)!;
//       existing[2] += qty; // 🔥 сумуємо qty
//     } else {
//       // копіюємо, щоб не мутувати оригінал
//       map.set(key, [...row]);
//     }
//   }

//   return Array.from(map.values());
// }
