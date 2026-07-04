import { normalizeCode } from '../../../utils/normalize';
import { ReportLayoutColumn } from '../model/report-layout-column.model';

export function mapRowsToReportLayout(rows: any[][]): ReportLayoutColumn[] {
  const headers = rows[0];
  const data = rows.slice(1);

  const col = (name: string) => {
    const i = headers.indexOf(name);

    if (i === -1) {
      throw new Error(`Column not found: ${name}`);
    }

    return i;
  };

  return data.map(
    (row): ReportLayoutColumn => ({
      materialId: String(row[col('MaterialID')]),

      // тільки для відображення
      materialCode: normalizeCode(String(row[col('MaterialCode')])),

      reportGroup: String(row[col('ReportGroup')]).trim(),
      reportColumn: String(row[col('ReportColumn')]).trim(),

      sort: Number(row[col('Sort')]),
      decimals: Number(row[col('Decimals')]),

      isActive:
        row[col('IsActive')] === true || row[col('IsActive')] === 'TRUE',

      comment: row[col('Comment')] ? String(row[col('Comment')]) : undefined,
    }),
  );
}
