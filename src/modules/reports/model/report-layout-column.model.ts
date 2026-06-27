export interface ReportLayoutColumn {
  materialId: string;

  materialCode: string;

  reportGroup: string;
  reportColumn: string;

  sort: number;
  decimals: number;

  isActive: boolean;

  comment?: string;
}
