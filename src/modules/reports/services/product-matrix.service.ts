import { BOMMaterialsService } from '../../bom/services/bom-materials.service';
import { ElementRepository } from '../../elements/element.repository';
import { ReportColumnRepository } from '../repository/report-column.repository';
import { ProductReportData } from '../model/product-matrix.model';
import { normalizeCode } from 'utils/normalize';
import { MaterialRepository } from 'domain/materials/material.repository';

export class ProductMatrixService {
  constructor(
    private readonly elementRepo: ElementRepository,
    private readonly materialsService: BOMMaterialsService,
    private readonly materialRepo: MaterialRepository,
    private readonly reportColumnRepo: ReportColumnRepository,
  ) {}

  getProductReportData(productId: string): ProductReportData {
    const product = this.elementRepo.findById(productId);

    if (!product) {
      throw new Error(`Product not found: ${productId}`);
    }

    const materials = this.materialsService.getMaterialRequirements(productId);

    const cells = materials
      .map((material) => {
        // const column = this.reportColumnRepo.findByMaterialCode(
        //   material.materialCode,
        // );
        const column = this.reportColumnRepo.findByMaterialId(
          material.materialId,
        );

        if (!column) {
          return null;
        }
        const materialInfo = this.materialRepo.findById(material.materialId);

        if (!materialInfo) {
          return null;
        }

        return {
          materialId: material.materialId,
          materialCode: normalizeCode(materialInfo.code),
          materialName: materialInfo.name,

          reportGroup: column.reportGroup,
          reportColumn: column.reportColumn,

          qty: Number(material.qty.toFixed(column.decimals)),
          unit: material.unit,

          sort: column.sort,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a!.sort - b!.sort);

    return {
      productCode: product.code,
      productName: product.name,

      cells: cells as any,
    };
  }
}
