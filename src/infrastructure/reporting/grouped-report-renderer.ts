import type { GroupedByProductView } from '../../modules/reports/material-consumption/grouped-by-product.presenter';
import type { MaterialConsumptionReportRequest } from '../../modules/reports/material-consumption/material-consumption-report.dto';

export interface ReportTable {
  snapshot?: import('./report-snapshot').ReportSnapshot;
  values: (string | number)[][];
  formats: string[][];
  groupRows: { heading: number; start: number; count: number }[];
  productCount: number;
  materialRowCount: number;
}
/** Serial dates are timezone-independent Sheets date values; only display is formatted. */
function serial(date: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error('INVALID_REPORT_DATE');
  return Date.parse(date) / 86400000 + 25569;
}
export class GoogleSheetsGroupedReportRenderer {
  render(view: GroupedByProductView, request: MaterialConsumptionReportRequest, generatedDate: string): ReportTable {
    const values: ReportTable['values'] = [], formats: string[][] = [];
    const add = (row: (string | number)[], fmt: string[] = []) => {
      values.push([...row, ...Array(6 - row.length).fill('')]);
      formats.push(Array.from({ length: 6 }, (_, i) => fmt[i] ?? '@'));
    };
    add(['ВІДОМІСТЬ НОРМАТИВНИХ ВИТРАТ МАТЕРІАЛІВ']);
    add(['Будинок', request.houseCode || 'Усі будинки']);
    add(['Виріб', request.productCode || 'Усі вироби']);
    add(['Період від', request.dateFrom ? serial(request.dateFrom) : 'Не обмежено'], ['@', 'dd-mm-yyyy']);
    add(['Період до', request.dateTo ? serial(request.dateTo) : 'Не обмежено'], ['@', 'dd-mm-yyyy']);
    add(['Дата формування', serial(generatedDate)], ['@', 'dd-mm-yyyy']);
    add(['Метод розрахунку', 'Нормативний']);
    for (const [label, key] of [['Втрати арматури, %', 'rebar'], ['Втрати прокату, %', 'rolled'], ['Втрати бетону, %', 'concrete']] as const) {
      const value = request.lossPercents[key];
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) throw new Error('INVALID_LOSS_NORM');
      add([label, value], ['@', '0.########']);
    }
    add([]);
    add(['Найменування', 'Од.', 'Чиста потреба', 'Норма втрат, %', 'Втрати', 'Нормативна витрата']);
    const groupRows: ReportTable['groupRows'] = [];
    let materialRowCount = 0;
    for (const group of view.groups) {
      if (!group.rows.length) throw new Error('EMPTY_PRODUCT_MATERIALS');
      const heading = values.length + 1;
      add([`${group.productName} (${group.productCode}) — ${group.productQty} шт.`]);
      const start = values.length + 1;
      for (const row of group.rows) {
        if (![row.baseQty, row.lossPercent, row.lossQty, row.totalQty].every(v => typeof v === 'number' && Number.isFinite(v))) throw new Error('INVALID_REPORT_NUMBER');
        const unit = row.unit === 'м3' ? 'м³' : row.unit;
        const fmt = unit === 'м³' ? '0.00000' : unit === 'кг' ? '0.000' : '0.########';
        add([row.name, unit, row.baseQty, row.lossPercent, row.lossQty, row.totalQty], ['@', '@', fmt, '0.########', fmt, fmt]);
        materialRowCount++;
      }
      groupRows.push({ heading, start, count: group.rows.length });
    }
    return { values, formats, groupRows, productCount: view.groups.length, materialRowCount };
  }
}
