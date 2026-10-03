/**
 * src/modules/reports/report-filter.ts
 *
 * Призначення:
 * - описує фільтри вибірки для формування звітів;
 * - не залежить від HTML-форми;
 * - може використовуватися різними типами звітів.
 */

export interface ReportFilter {
  /**
   * Код будинку.
   * Не заданий — усі будинки.
   */
  houseCode?: string;

  /**
   * Код виробу.
   * Не заданий — усі вироби.
   */
  productCode?: string;

  /**
   * Початкова дата виготовлення.
   * Формат: YYYY-MM-DD.
   */
  dateFrom?: string;

  /**
   * Кінцева дата виготовлення.
   * Формат: YYYY-MM-DD.
   */
  dateTo?: string;
}
