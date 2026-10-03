/**
 * src/modules/reports/report-web-input.ts
 *
 * Призначення:
 * - описує параметри, які надходять із веб-форми звітів;
 * - не є моделлю конкретного звіту;
 * - використовується як вхідний DTO для ReportService.
 */

export type ReportScope = 'product' | 'period' | 'all';

export type ConsumptionBasis =
  | 'normative'
  | 'normative_7'
  | 'batch'
  | 'batch_7';

export type ReportType =
  | 'material-consumption'
  | 'bom-vertical'
  | 'product-specification';

export type ReportFormat = 'google-sheet';

export interface ReportWebInput {
  /**
   * Область даних, для яких формується звіт.
   */
  scope: ReportScope;

  /**
   * Будинок.
   * undefined — усі будинки.
   */
  houseCode?: string;

  /**
   * Код конкретного виробу.
   * Використовується при scope = product.
   */
  productCode?: string;

  /**
   * Початок періоду.
   * Використовується при scope = period або all.
   *
   * Формат: YYYY-MM-DD
   */
  dateFrom?: string;

  /**
   * Кінець періоду.
   * Формат: YYYY-MM-DD
   */
  dateTo?: string;

  /**
   * Основа розрахунку витрат матеріалів.
   */
  consumptionBasis: ConsumptionBasis;

  /**
   * Тип звіту.
   */
  reportType: ReportType;

  /**
   * Формат результату.
   */
  format: ReportFormat;
}
