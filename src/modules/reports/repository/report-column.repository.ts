import { ReportColumn } from '../model/report-column.model';

// import { normalizeCode } from '../../../utils/normalize';

export class ReportColumnRepository {
  constructor(private readonly columns: ReportColumn[]) {}

  findByMaterialId(id: string): ReportColumn | null {
    return this.columns.find((c) => c.isActive && c.materialId === id) ?? null;
  }

  getActiveColumns(): ReportColumn[] {
    return this.columns
      .filter((c) => c.isActive)
      .sort((a, b) => a.sort - b.sort);
  }
  // findByMaterialCode(code: string): ReportColumn | null {
  //   const normalized = normalizeCode(code);

  //   return (
  //     this.columns.find(
  //       (c) => c.isActive && normalizeCode(c.materialCode) === normalized,
  //     ) ?? null
  //   );
  // }
}
