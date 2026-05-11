import { ElementRepository } from '../../elements/element.repository';
import {
  getOrCreateAssembly,
  getOrCreateAssemblyWithName,
} from '../../elements/assembly.service';
import { insertBOMRows } from '../bom.repository';
import { TableRowInput } from '../model/table-row-input.model';
import { aggregateBOMRows, buildBOMRow } from '../bom.service';
import { ICatalogRepository } from '../../catalog/catalog.repository.interface';
import { deleteBOMTree } from '../bom.repository';
import { mapTableRowToStructured } from './mappers/table-row.mapper';

import { parseParent } from './parseParent';
// import { getOrCreateElementWithType } from '../../elements/element.factory';
import { buildName } from '../../../utils/buildName';

import { parseStructuredLine } from './parseStucturedLine';
import { parseSpec } from './parseSpec';
import { normalizeSpec } from './utils/spec.utils';
import { normalizeLine } from '../../../utils/normalize';
import { CatalogService } from '../../catalog/catalog.service';
import { getOrCreateElement } from '../../elements/element.factory';

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
