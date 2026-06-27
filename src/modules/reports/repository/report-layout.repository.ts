import { ReportLayoutColumn } from '../model/report-layout-column.model';

export class ReportLayoutRepository {
  constructor(private readonly columns: ReportLayoutColumn[]) {}

  getColumns(): ReportLayoutColumn[] {
    return this.columns
      .filter((c) => c.isActive)
      .sort((a, b) => a.sort - b.sort);
  }

  findByMaterialId(materialId: string): ReportLayoutColumn | null {
    return (
      this.columns.find((c) => c.isActive && c.materialId === materialId) ??
      null
    );
  }
}
