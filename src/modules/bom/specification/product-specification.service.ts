/**
 * Path: C:/www/26/03/kub3master-ts/src/modules/bom/specification/product-specification.service.ts
 * Module: BOM
 * Layer: Application / Presentation
 * Responsibility: group one typed expansion into a product specification using the shared aggregator.
 */
import { BOMExpansionService } from '../expansion/bom-expansion.service';
import { BOMProductSpecificationService } from './bom-product-specification.service';
import { BOMProductSpecificationGroupService } from './bom-product-specification-group.service';
import type { ProductSpecification, ProductSpecificationRow } from './product-specification.model';
import type { BOMProductSpecificationRow } from './bom-product-specification.row';

export class ProductSpecificationService {
  constructor(private readonly bomExpansionService: BOMExpansionService) {}
  public getSpecification(productId: string): ProductSpecification {
    const expansion = this.bomExpansionService.expandProduct(productId);
    if (!expansion.ok) throw new Error(expansion.diagnostics.map((d) => `${d.code}: ${d.message}`).join('\n'));
    const grouped = new BOMProductSpecificationGroupService()
      .group(new BOMProductSpecificationService().aggregate(expansion.lines));
    const mapRow = (row: BOMProductSpecificationRow): ProductSpecificationRow => ({
      elementId: row.elementId, code: row.elementCode, name: row.elementName,
      elementType: row.elementType as ProductSpecificationRow['elementType'], qty: row.qty, unit: row.unit,
    });
    return { productId: expansion.root.elementId, productCode: expansion.root.element.code,
      assemblies: grouped.assemblies.map(mapRow), parts: grouped.parts.map(mapRow),
      materials: grouped.materials.map(mapRow) };
  }
}
