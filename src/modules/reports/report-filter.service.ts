/**
 * ==========================================================
 * ERP КУБ
 * Module: Reports
 * File: report-filter.service.ts
 * Path: src/modules/reports/report-filter.service.ts
 *
 * Призначення:
 * Застосовує ReportFilter до фактів виготовлення Manufacturing.
 *
 * Відповідальність:
 * - фільтр за будинком;
 * - фільтр за виробом;
 * - фільтр за періодом.
 *
 * Не відповідає за:
 * - читання Google Sheets;
 * - формування звіту;
 * - розрахунок витрат матеріалів.
 * ==========================================================
 */

import { Manufacturing } from '../../domain/manufacturing/manufacturing.model';
import { ReportFilter } from './report-filter';

export class ReportFilterService {
  public filterManufacturing(
    items: readonly Manufacturing[],
    filter: ReportFilter,
  ): Manufacturing[] {
    return items.filter((item) => this.matchesManufacturing(item, filter));
  }

  private matchesManufacturing(
    item: Manufacturing,
    filter: ReportFilter,
  ): boolean {
    if (filter.houseCode && item.houseCode !== filter.houseCode) {
      return false;
    }

    if (filter.productCode && item.productCode !== filter.productCode) {
      return false;
    }

    if (filter.dateFrom && item.date < this.startOfDay(filter.dateFrom)) {
      return false;
    }

    if (filter.dateTo && item.date > this.endOfDay(filter.dateTo)) {
      return false;
    }

    return true;
  }

  private startOfDay(date: string): Date {
    const result = new Date(`${date}T00:00:00`);
    return result;
  }

  private endOfDay(date: string): Date {
    const result = new Date(`${date}T23:59:59.999`);
    return result;
  }
}
