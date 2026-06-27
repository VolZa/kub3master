export interface ReportColumn {
  materialCode: string;

  reportGroup: string;
  reportColumn: string;

  sort: number;
  decimals: number;
  isActive: boolean;

  comment?: string;
}
