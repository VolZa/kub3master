import { ElementRepository } from '../../elements/element.repository';
import { getOrCreateElement } from '../../elements/element.factory';
import { getOrCreateAssembly } from '../../elements/assembly.service';
import { parseSpec } from './parseSpec';
import { insertBOMRows } from '../bom.repository';
import { TableRowInput } from '../model/table-row-input.model';

export function buildBOMFromTable(
  rows: TableRowInput[],
  rootCode: string,
  repo: ElementRepository,
) {
  console.log('TABLE ROWS:', JSON.stringify(rows, null, 2));
  const root = getOrCreateAssembly(rootCode, repo);

  let currentParent = root;

  const now = new Date();
  const rawRows: any[][] = [];

  for (const row of rows) {
    try {
      // 🔥 1. новий верхній assembly (заголовок типу КР1-1-39)
      if (!row.qty && !row.designation) {
        currentParent = getOrCreateAssembly(row.name, repo);
        continue;
      }

      // 🔥 2. вкладений assembly (ГСк-2-5)
      if (row.designation) {
        const childAssembly = getOrCreateAssembly(row.designation, repo);

        rawRows.push([
          currentParent.id,
          childAssembly.id,
          row.qty ?? 1,
          'шт',
          now,
        ]);

        // 🔥 змінюємо контекст
        currentParent = childAssembly;

        continue;
      }

      // 🔥 3. звичайна деталь
      const parsed = parseSpec(row.name);

      const element = getOrCreateElement(parsed, repo);

      rawRows.push([
        currentParent.id,
        element.id,
        row.qty ?? 1,
        element.baseUnit,
        now,
      ]);
    } catch (e) {
      console.error('❌ ROW ERROR:', row, e);
    }
  }

  insertBOMRows(rawRows);

  return rawRows.length;
}
