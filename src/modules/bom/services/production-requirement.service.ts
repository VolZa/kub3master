// src\modules\bom\services\production-requirement.service.ts
import { MaterialRequirement } from '../model/material-requirement.model';
import { ProductRequirement } from '../model/product-requirement.model';
import { BOMMaterialsService } from './bom-materials.service';

// BOM
//  ├── старий ProductionRequirementService
//  │   замінимо на новий
//  └── новий MaterialConsumptionEngine
export class ProductionRequirementService {
  constructor(private readonly materialsService: BOMMaterialsService) {}

  calculate(products: ProductRequirement[]): MaterialRequirement[] {
    const result = new Map<string, MaterialRequirement>();

    products.forEach((product) => {
      const materials = this.materialsService.getMaterialRequirements(
        product.productId,
      );

      materials.forEach((m) => {
        const existing = result.get(m.materialId);

        const qty = m.qty * product.qty;

        if (existing) {
          existing.qty += qty;
        } else {
          result.set(m.materialId, {
            ...m,
            qty,
          });
        }
      });
    });

    return [...result.values()];
  }
}
