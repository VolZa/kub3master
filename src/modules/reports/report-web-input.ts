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

export interface MaterialConsumptionReportWebRequest {
  reportType: 'material-consumption';
  calculationMethod: 'normative';
  format: 'google-sheet';
  houseCode?: string;
  productCode?: string;
  dateFrom?: string;
  dateTo?: string;
  lossPercents: MaterialLossPercents;
}

/** Additive allowance: TotalQty = BaseQty * (1 + LossPercent / 100).
 * rebar -> rebar; plate/angle/pipe -> rolled; concrete_mix -> concrete.
 * wire and cement have no implicit loss group. Values must be explicit, 0..100.
 */
export type { MaterialLossPercents as LossPercents } from '../../domain/materials/material-loss.model';
import type { MaterialLossPercents } from '../../domain/materials/material-loss.model';

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

  lossPercents: MaterialLossPercents;

  /**
   * Тип звіту.
   */
  reportType: ReportType;

  /**
   * Формат результату.
   */
  format: ReportFormat;
}
