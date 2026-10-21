import type { MaterialConsumptionReportWebRequest } from '../modules/reports/report-web-input';
import type { CurrentReportOutput } from '../infrastructure/reporting/current-report-output';

export function validateMaterialReportWebInput(input: unknown): MaterialConsumptionReportWebRequest {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('INVALID_INPUT');
  const value = input as Record<string, any>;
  if (value.reportType !== 'material-consumption' || value.calculationMethod !== 'normative' || value.format !== 'google-sheet') throw new Error('NOT_IMPLEMENTED');
  const lossPercents = { rebar: 0, rolled: 0, concrete: 0 };
  const result: MaterialConsumptionReportWebRequest = { reportType: 'material-consumption', calculationMethod: 'normative', format: 'google-sheet', lossPercents };
  for (const key of ['houseCode', 'productCode', 'dateFrom', 'dateTo'] as const) {
    if (value[key] === undefined) continue;
    if (typeof value[key] !== 'string' || !value[key].trim()) throw new Error('INVALID_INPUT');
    result[key] = value[key].trim();
  }
  for (const date of [result.dateFrom, result.dateTo]) {
    if (date !== undefined && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) throw new Error('INVALID_REPORT_DATE');
  }
  if (result.dateFrom && result.dateTo && result.dateFrom > result.dateTo) throw new Error('INVALID_REPORT_PERIOD');
  for (const key of ['rebar', 'rolled', 'concrete'] as const) {
    const percent = value.lossPercents?.[key];
    if (typeof percent !== 'number' || !Number.isFinite(percent) || percent < 0 || percent > 100) throw new Error('INVALID_LOSS_NORM');
    lossPercents[key] = percent;
  }
  return result;
}

export function runMaterialReportWeb(input: unknown, dependencies: {
  houseExists(code: string): boolean;
  output(): Pick<CurrentReportOutput, 'generate'>;
}) {
  try {
    const request = validateMaterialReportWebInput(input);
    if (request.houseCode && !dependencies.houseExists(request.houseCode)) throw new Error('HOUSE_NOT_FOUND');
    return dependencies.output().generate(request);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const codes = ['NOT_IMPLEMENTED', 'INVALID_INPUT', 'INVALID_REPORT_DATE', 'INVALID_REPORT_PERIOD', 'INVALID_LOSS_NORM',
      'HOUSE_NOT_FOUND', 'PRODUCT_NOT_FOUND', 'AMBIGUOUS_PRODUCT_CODE', 'INCOMPLETE_BOM', 'MATERIAL_NOT_FOUND',
      'UNDEFINED_LOSS_GROUP', 'MISSING_LOSS_NORM', 'DUPLICATE_MANUFACTURING_ID', 'REPORT_BUSY', 'REPORT_RECOVERY_REQUIRED'];
    const code = codes.find(c => detail.startsWith(c)) ?? 'REPORT_FAILED';
    const explanations: Record<string, string> = {
      HOUSE_NOT_FOUND: 'Вибраний будинок або будинок включеного факту не знайдено.',
      PRODUCT_NOT_FOUND: 'Не вдалося визначити виріб для включеного факту виготовлення.',
      AMBIGUOUS_PRODUCT_CODE: 'Код виробу неоднозначний у документах проєкту.',
      INCOMPLETE_BOM: 'BOM виробу неповний або некоректний. Матеріали не підставлялися.',
      INVALID_LOSS_NORM: 'Для кожної групи потрібне число від 0 до 100.',
      INVALID_REPORT_DATE: 'Вкажіть коректну дату у форматі YYYY-MM-DD.',
      INVALID_REPORT_PERIOD: 'Початок періоду пізніший за його завершення.',
      INVALID_INPUT: 'Некоректні параметри запиту.',
      REPORT_BUSY: 'Інший звіт зараз записується. Автоматичного повтору немає.',
      UNDEFINED_LOSS_GROUP: 'Для матеріалу не визначено групу нормативних втрат.',
    };
    const message = code === 'REPORT_RECOVERY_REQUIRED'
      ? 'Потрібно перевірити REPORTING і відновлення попереднього звіту. Не повторюйте запуск.'
      : code === 'NOT_IMPLEMENTED' ? 'Підтримується лише нормативний звіт витрати матеріалів у Google Sheet.'
      : code === 'REPORT_FAILED' ? 'Результат операції може бути невизначеним. Перевірте REPORTING перед новим запуском.'
      : `${explanations[code] ?? 'Звіт не сформовано.'} ${detail}`;
    return { status: 'ERROR' as const, code, message };
  }
}
