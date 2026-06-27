import { ElementRepository } from '../../elements/element.repository';
import { BOMMaterialsService } from './bom-materials.service';
import { ProductReport } from '../model/product-report.model';

export class ProductReportService {
  constructor(
    private readonly elementRepo: ElementRepository,
    private readonly materialsService: BOMMaterialsService,
  ) {}

  getReport(productId: string): ProductReport {
    const product = this.elementRepo.findById(productId);

    if (!product) {
      throw new Error(`Product not found: ${productId}`);
    }

    return {
      productId: product.id,
      productCode: product.code,
      productName: product.name,

      materials: this.materialsService.getMaterialRequirements(productId),
    };
  }
}
