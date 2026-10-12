/**
 * src/modules/bom/tests/bom-expansion.test.ts
 *
 * Модуль: BOM
 * Layer: Test
 *
 * Відповідальність:
 * - перевіряє розгортання BOM конкретного Product;
 * - працює тільки на читання;
 * - не змінює Google Sheets.
 */
import { componentId } from '../expansion/bom-expansion.model';
import { getBOMExpansionService } from '../../../app/factories/bom-expansion.factory';



import { BOMProductSpecificationService } from '../specification/bom-product-specification.service';
import { BOMProductSpecificationGroupService } from '../specification/bom-product-specification-group.service';

export function testExpandProductP31(): void {
  const productId = '2027';

  // Snapshot factory: 00_Elements читається один раз.

  // 01_BOM читається один раз.

  // Подальша робота — тільки з RAM.

  // Full snapshot: 05_Materials читається через існуючу фабрику.

  const service = getBOMExpansionService();

  const expansion = service.expandProduct(productId);
  if (!expansion.ok) throw new Error(JSON.stringify(expansion.diagnostics));
  const rows = expansion.lines;

  const specificationService = new BOMProductSpecificationService();

  const specification = specificationService.aggregate(rows);

  const groupService = new BOMProductSpecificationGroupService();

  const grouped = groupService.group(specification);

  console.log(`Assemblies: ${grouped.assemblies.length}`);

  console.log(`Parts: ${grouped.parts.length}`);

  console.log(`Materials: ${grouped.materials.length}`);

  console.log(`Product Specification: ${specification.length} rows`);

  console.log('--- ASSEMBLIES ---');

  for (const row of grouped.assemblies) {
    console.log(`${row.elementCode} | ${row.qty} ${row.unit}`);
  }

  console.log('--- PARTS ---');

  for (const row of grouped.parts) {
    console.log(`${row.elementCode} | ${row.qty} ${row.unit}`);
  }

  console.log('--- MATERIALS ---');

  for (const row of grouped.materials) {
    console.log(`${row.elementCode} | ${row.qty} ${row.unit}`);
  }

  for (const row of specification) {
    console.log(
      [
        row.elementCode,
        row.elementName,
        row.qty,
        row.unit,
        row.elementType,
      ].join(' | '),
    );
  }

  const specificationRod = specification.find(
    (row) => row.elementId === '4013',
  );

  if (!specificationRod) {
    throw new Error('R_12_A500C_L800 not found in specification');
  }

  if (specificationRod.qty !== 44 || specificationRod.unit !== 'шт') {
    throw new Error(
      `Unexpected R_12_A500C_L800 specification: ` +
        `${specificationRod.qty} ${specificationRod.unit}`,
    );
  }

  console.log('✓ Product specification: ' + 'R_12_A500C_L800 = 44 шт');

  const materialRod = specification.find((row) => row.elementId === '3014');

  if (!materialRod) {
    throw new Error('Material 3014 not found in specification');
  }

  if (
    Math.abs(materialRod.qty - 31.24) > 0.000001 ||
    materialRod.unit !== 'кг'
  ) {
    throw new Error(
      `Unexpected R_12_А500С specification: ` +
        `${materialRod.qty} ${materialRod.unit}`,
    );
  }

  console.log('✓ Product specification: ' + 'R_12_А500С = 31.24 кг');

  console.log(`BOM Expansion: ${rows.length} rows`);

  for (const row of rows) {
    console.log(
      [
        `L${row.level}`,
        row.edge.parent.element.code,
        '→',
        (row.edge.child.kind === 'ELEMENT' ? row.edge.child.element.code : row.edge.child.material.code),
        `direct=${row.edge.directQty}`,
        `total=${row.totalQty}`,
        row.edge.unit,
        `path=${row.path.map(componentId).join(' → ')}`,
      ].join(' | '),
    );
  }

  const rodRows = rows.filter((row) => row.edge.child.kind === 'ELEMENT' && row.edge.child.elementId === '4013');

  console.log('R_12_A500C_L800 rows:', rodRows);

  if (rodRows.length !== 2) {
    throw new Error(`Expected 2 R_12_A500C_L800 rows, got ${rodRows.length}`);
  }

  const quantities = rodRows.map((row) => row.totalQty).sort((a, b) => a - b);

  const expected = [10, 34];

  if (quantities[0] !== expected[0] || quantities[1] !== expected[1]) {
    throw new Error(`Unexpected quantities: ${quantities.join(', ')}`);
  }

  console.log('✓ R_12_A500C_L800 totals: 34 + 10');

  console.log('✓ testExpandProductP31 passed');
}
