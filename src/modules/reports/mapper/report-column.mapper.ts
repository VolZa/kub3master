import { ReportColumn } from '../model/report-column.model';

export function mapRowsToReportColumns(rows: any[][]): ReportColumn[] {
  const headers = rows[0];
  const data = rows.slice(1);

  const col = (name: string) => headers.indexOf(name);

  return data.map((row) => ({
    materialCode: String(row[col('MaterialCode')]),

    reportGroup: String(row[col('ReportGroup')]),
    reportColumn: String(row[col('ReportColumn')]),

    sort: Number(row[col('Sort')]),
    decimals: Number(row[col('Decimals')]),
    isActive: row[col('IsActive')] !== false,
    comment: row[col('Comment')] ? String(row[col('Comment')]) : undefined,
  }));
}
