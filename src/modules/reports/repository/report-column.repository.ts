import { ReportColumn } from '../model/report-column.model';

import { normalizeCode } from '../../../utils/normalize';

// findByMaterialCode(code: string): ReportColumn | null {
//   const normalized = normalizeCode(code);

//   return (
//     this.columns.find(
//       (c) =>
//         c.isActive &&
//         normalizeCode(c.materialCode) === normalized,
//     ) ?? null
//   );
// }

export class ReportColumnRepository {
  constructor(private readonly columns: ReportColumn[]) {}

  // findByMaterialCode(code: string): ReportColumn | null {
  //   return (
  //     this.columns.find((c) => c.isActive && c.materialCode === code) ?? null
  //   );
  // }
  findByMaterialCode(code: string): ReportColumn | null {
    const normalized = normalizeCode(code);

    return (
      this.columns.find(
        (c) => c.isActive && normalizeCode(c.materialCode) === normalized,
      ) ?? null
    );
  }

  // findByMaterialCode(code: string): ReportColumn | null {
  //   console.log('LOOKUP:', code);

  //   const found =
  //     this.columns.find((c) => c.isActive && c.materialCode === code) ?? null;

  //   console.log('FOUND:', found);

  //   return found;
  // }

  // getAll(): ReportColumn[] {
  //   return [...this.columns].sort((a, b) => a.sort - b.sort);
  // }
}
