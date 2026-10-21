import { getMaterialConsumptionReportUseCase } from './material-consumption-report.factory';
import { CurrentReportOutput } from '../../infrastructure/reporting/current-report-output';
import { GasCurrentReportStore, GoogleSheetsCurrentReportWriter } from '../../infrastructure/reporting/current-report-writer';

/** Prepared composition only; not exported as a public GAS handler or invoked automatically. */
export function getCurrentReportOutput(): CurrentReportOutput {
  return new CurrentReportOutput(getMaterialConsumptionReportUseCase(),
    new GoogleSheetsCurrentReportWriter(new GasCurrentReportStore()));
}
