import { ElementFull } from '../../elements/element.model';
import { BOMMatrixColumnDefinition } from '../model/bom-matrix-column-definition.model';
import { BOMMaterialMatrixRow } from '../model/bom-material-matrix.model';
import { BOMMaterialsService } from './bom-materials.service';
import { BOMMatrixColumnsRepository } from '../repositories/bom-matrix-columns.repository';

export class BOMMaterialMatrixService {
  constructor(
    private readonly bomMaterialsService: BOMMaterialsService,
    private readonly columnsRepository: BOMMatrixColumnsRepository,
  ) {}

  build(
    products: readonly ElementFull[],
    matrixCode = 'PRODUCT',
  ): {
    columns: BOMMatrixColumnDefinition[];
    rows: BOMMaterialMatrixRow[];
  } {
    const configuredColumns = this.columnsRepository.getActive(matrixCode);

    const columnByMaterialId = new Map(
      configuredColumns.map((column) => [column.materialId, column]),
    );

    const usedMaterialIds = new Set<string>();

    const rows: BOMMaterialMatrixRow[] = [];

    for (const product of products) {
      const requirements = this.bomMaterialsService.getMaterialRequirements(
        product.id,
      );

      const values: Record<string, number> = {};

      // for (const requirement of requirements) {
      //   const column = columnByMaterialId.get(requirement.materialId);

      //   if (!column) {
      //     continue;
      //   }

      //   usedMaterialIds.add(requirement.materialId);

      //   values[column.columnCode] = requirement.qty;
      // }
      for (const requirement of requirements) {
        const column = columnByMaterialId.get(requirement.materialId);

        if (!column) {
          continue;
        }

        usedMaterialIds.add(requirement.materialId);

        values[requirement.materialId] = requirement.qty;
      }

      rows.push({
        productId: product.id,
        productCode: product.code,
        values,
      });
    }

    const columns = configuredColumns.filter((column) =>
      usedMaterialIds.has(column.materialId),
    );

    return {
      columns,
      rows,
    };
  }
}
