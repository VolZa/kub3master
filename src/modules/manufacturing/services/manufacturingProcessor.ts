import { ManufacturingMapper } from '../mapping/manufacturingMapper';
import { ManufacturingResolver } from './manufacturingResolver';

import { ManufacturingRow } from '../../../infrastructure/sheets/manufacturing/manufacturing.row';
import { ManufacturingProcessingResult } from '../types/manufacturingProcessingResult';
import { ResolvedManufacturing } from '../types/resolvedManufacturing';
import { ManufacturingProcessingError } from '../types/manufacturingProcessingError';

export class ManufacturingProcessor {
  constructor(private readonly resolver: ManufacturingResolver) {}

  public process(
    rows: readonly ManufacturingRow[],
  ): ManufacturingProcessingResult {
    const items: ResolvedManufacturing[] = [];
    const errors: ManufacturingProcessingError[] = [];

    rows.forEach((row, index) => {
      const rowNumber = index + 3;

      const input = ManufacturingMapper.mapRowToInput(row);

      const result = this.resolver.resolve(input);

      if (result.success) {
        items.push(result.value);
        return;
      }

      errors.push({
        rowNumber,
        productCode: input.productCode,
        houseCode: input.houseCode,
        reason: result.reason,
      });
    });

    return {
      items,
      errors,
    };
  }
}

// import { ManufacturingMapper } from '../mapping/manufacturingMapper';
// import { ManufacturingResolver } from './manufacturingResolver';

// import { ManufacturingRow } from '../../../infrastructure/sheets/manufacturing/manufacturing.row';
// import { ManufacturingProcessingResult } from '../types/manufacturingProcessingResult';

// import { ResolvedManufacturing } from '../types/resolvedManufacturing';
// import { ManufacturingProcessingError } from '../types/manufacturingProcessingError';

// export class ManufacturingProcessor {
//   constructor(private readonly resolver: ManufacturingResolver) {}

//   public process(
//   rows: readonly ManufacturingRow[],
// ): ManufacturingProcessingResult {
//   const items: ResolvedManufacturing[] = [];
//   const errors: ManufacturingProcessingError[] = [];

//   rows.forEach((row, index) => {
//     const rowNumber = index + 3;

//     const input =
//       ManufacturingMapper.mapRowToInput(row);

//     const result = this.resolver.resolve(input);

//     if (result.success) {
//       items.push(result.value);
//       return;
//     }

//     errors.push({
//       rowNumber,
//       productCode: input.productCode,
//       houseCode: input.houseCode,
//       reason: result.reason,
//     });
//   });

//   return {
//     items,
//     errors,
//   };
// }

//     return {
//       items,
//       errors,
//     };
//   }
// }
