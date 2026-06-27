import { BOMMaterialsService } from '../../bom/services/bom-materials.service';
import { ElementRepository } from '../../elements/element.repository';
import { ReportColumnRepository } from '../repository/report-column.repository';
import { ProductMatrix } from '../model/product-matrix.model';
import { normalizeCode } from 'utils/normalize';

export class ProductMatrixService {
  constructor(
    private readonly elementRepo: ElementRepository,
    private readonly materialsService: BOMMaterialsService,
    private readonly reportColumnRepo: ReportColumnRepository,
  ) {}

  getProductMatrix(productId: string): ProductMatrix {
    const product = this.elementRepo.findById(productId);

    if (!product) {
      throw new Error(`Product not found: ${productId}`);
    }

    const materials = this.materialsService.getMaterialRequirements(productId);

    const cells = materials
      .map((material) => {
        const column = this.reportColumnRepo.findByMaterialCode(
          material.materialCode,
        );

        if (!column) {
          return null;
        }

        return {
          materialCode: normalizeCode(material.materialCode),

          reportGroup: column.reportGroup,
          reportColumn: column.reportColumn,

          qty: material.qty,
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
