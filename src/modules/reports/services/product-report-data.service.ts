import { BOMMaterialsService } from '../../bom/services/bom-materials.service';
import { ElementRepository } from '../../elements/element.repository';

import { ProductReportData } from '../model/product-report-data.model';
import { ReportLayoutRepository } from '../repository/report-layout.repository';
import { MaterialRepository } from '../../../domain/materials/material.repository';

export class ProductReportDataService {
  constructor(
    private readonly elementRepo: ElementRepository,
    private readonly materialsService: BOMMaterialsService,
    private readonly materialRepo: MaterialRepository, // ← нова залежність
    private readonly layoutRepo: ReportLayoutRepository,
  ) {}

  getProductReportData(productId: string): ProductReportData {
    const product = this.elementRepo.findById(productId);

    if (!product) {
      throw new Error(`Product not found: ${productId}`);
    }

    const materials = this.materialsService.getMaterialRequirements(productId);

    const items = materials
      .map((requirement) => {
        const material = this.materialRepo.findById(requirement.materialId);

        if (!material) {
          throw new Error(`Material not found: ${requirement.materialId}`);
        }

        const layout = this.layoutRepo.findByMaterialId(material.id);

        if (!layout) {
          return null;
        }

        return {
          materialId: material.id,

          materialCode: material.code,
          materialName: material.name,

          reportGroup: layout.reportGroup,
          reportColumn: layout.reportColumn,

          qty: requirement.qty,
          unit: requirement.unit,

          sort: layout.sort,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => a.sort - b.sort);

    return {
      productId: product.id,
      productCode: product.code,
      productName: product.name,

      items,
    };
  }
}
