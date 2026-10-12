/**
 * Path: C:/www/26/03/kub3master-ts/src/modules/reports/bom-vertical/bom-vertical-report.service.ts
 * Module: Reports
 * Layer: Application / Presentation
 * Responsibility: present typed expansion occurrences without aggregating or recalculating BOM.
 */
import type { ExpandedBOMLine } from '../../bom/expansion/bom-expansion.model';
import { componentId } from '../../bom/expansion/bom-expansion.model';
import type { BOMVerticalReportRow } from './bom-vertical-report.model';

export class BOMVerticalReportService {
  public buildRows(lines: readonly ExpandedBOMLine[]): BOMVerticalReportRow[] {
    return lines.map((line) => {
      const ref = line.edge.child;
      const value = ref.kind === 'ELEMENT' ? ref.element : ref.material;
      return { level: line.level, parentId: line.edge.parent.elementId,
        parentCode: line.edge.parent.element.code, elementId: componentId(ref),
        code: value.code, name: value.name,
        elementType: ref.kind === 'ELEMENT' ? ref.element.type : 'material',
        directQty: line.edge.directQty, totalQty: line.totalQty, unit: line.edge.unit,
        path: line.path.map(componentId) };
    });
  }
}
