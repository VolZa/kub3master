//🏗️
import { parseSpec } from './parsers/parseSpec';
import { parseTableText } from '../../utils/parseTableText';
import { deleteBOMTree, insertBOMRows } from './bom.repository';
import { TableRowInput } from './model/table-row-input.model';
import { ElementRepository } from '../elements/element.repository';

import { buildByKind } from '../../modules/elements/builders/builder.dispatcher';

import { parseParent } from './parsers/parseParent';
import { getOrCreateAssemblyWithName } from '../elements/assembly.service';

import { MaterialRepository } from '../../domain/materials/material.repository';
import { MaterialBatchRepository } from '../../domain/materials/material-batch.repository';
import { getOrCreateElementFromBuilt } from '../elements/element.factory';
import { CatalogHelper } from '../catalog/catalog.helper';
import { buildAssemblyName } from 'modules/elements/builders/name.builder';

export function buildBOMRow(
  parentId: string,
  row: TableRowInput,
  now: Date,
  repo: ElementRepository,
  catalogHelper: CatalogHelper,
  materialRepo: MaterialRepository,
): any[][] {
  const prefix = row.prefix;
  const qty = row.qty ?? 1;

  const parent = repo.findById(parentId);

  if (!parent) {
    throw new Error(`Parent not found: ${parentId}`);
  }
  // console.log('🔥 buildBOMRow with row:', row, 'parent:', parent);
  // 🔥 1. EXISTING
  const existingElement = repo.findByCode(row.code, parent.projectDocumentID);

  console.log('Existing element for code', row.code, existingElement);
  // 🔹 Якщо елемент вже існує, просто повертаємо зв'язок Parent → Child
  if (existingElement) {
    return [
      [
        parentId,
        existingElement.id,
        qty,
        existingElement.baseUnit,
        now,
        parent.code,
        existingElement.code,
      ],
    ];
  }

  // пошук в матеріалах
  const material = materialRepo.findByCode(row.code);

  if (material) {
    return [
      [
        parentId,
        material.id,
        qty,
        material.baseUnit,
        now,
        parent.code,
        material.code,
      ],
    ];
  }

  // 🔥 2. PARSE
  const parsed = parseSpec(row.spec, row.prefix);

  if (parsed.kind === 'assembly' || parsed.kind === 'unknown') {
    throw new Error(`❌ Element not found in 00_Elements: ${row.code}`);
  }

  const built = buildByKind(parsed);
  console.log('buildBOMRow 🔥 2. PARSE Built element from parsed spec:', built);

  const element = getOrCreateElementFromBuilt(
    {
      ...built,
      prefixName: prefix,
    },
    repo,
    catalogHelper,
    materialRepo,
  );
  console.log('Built element:', element);

  // 🔹 1. Parent → Child
  const baseRow = [
    parentId,
    element.id,
    qty,
    element.baseUnit,
    now,
    parent.code,
    element.code,
  ];

  // 🔥 2. PART → MATERIAL
  if (element.type === 'part') {
    console.log(
      'PART → MATERIAL element.parentMaterialID:',
      element.parentMaterialID,
    );
    const material = materialRepo.findById(element.parentMaterialID || '');

    if (!material) {
      throw new Error(`❌ Material not found for ${element.code}`);
    }

    if (!material.weightPerMeter) {
      throw new Error(`❌ No weightPerMeter for ${material.code}`);
    }

    let materialQty = qty;

    if (built.length) {
      const meters = built.length / 1000;
      materialQty = meters * material.weightPerMeter;
    }

    materialQty = Math.round(materialQty * 100) / 100;

    return [
      baseRow,
      [
        element.id,
        material.id,
        materialQty,
        'кг',
        now,
        element.code,
        material.code,
      ],
    ];
  }

  // 🔥 DEFAULT (assembly / product)
  return [baseRow];
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
  parent: {
    code: string;
    prefix: string;
    name: string;
    projectDocumentID?: string;
  },
  rows: TableRowInput[],
  elementRepo: ElementRepository,
  catalogHelper: CatalogHelper,
  materialRepo: MaterialRepository,
  materialBatchRepo: MaterialBatchRepository,
) {
  console.log('👉 START buildBOMFromTable');

  const root = getOrCreateAssemblyWithName(
    parent.code,
    parent.projectDocumentID || '', // 🔥
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
        // materialBatchRepo,
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

// 🔥 допоміжна функція для визначення типу батьківського елемента
function detectParentTypeFromInput(lines: string[]): 'product' | 'assembly' {
  return lines.some((line) => line.toLowerCase().includes('бетон'))
    ? 'product'
    : 'assembly';
}
import {
  getCatalogRepository,
  getElementRepository,
  getMaterialBatchRepository,
  getMaterialRepository,
} from '../../app/factories';

export function buildBOMFromText(data: Input) {
  console.log('🔥 START buildBOMFromText');

  const elementRepo = getElementRepository();

  const catalogRepo = getCatalogRepository();
  const catalogHelper = new CatalogHelper(catalogRepo);

  const materialRepo = getMaterialRepository();

  const materialBatchRepo = getMaterialBatchRepository();

  // 🔹 Parent
  const parsedParent = parseParent(data.parentCode);
  validateParentCode(parsedParent.code);

  // 🔹 Table
  const tableRows = parseTableText(data.specification);

  console.log('TABLE ROWS:', JSON.stringify(tableRows, null, 2));

  return buildBOMFromTable(
    parsedParent,
    tableRows,
    elementRepo,
    catalogHelper,
    materialRepo,
    materialBatchRepo,
  );
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
