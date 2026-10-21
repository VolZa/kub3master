import type { MaterialConsumptionReportRequest } from '../../modules/reports/material-consumption/material-consumption-report.dto';
import type { MaterialConsumptionReportUseCase } from '../../modules/reports/material-consumption/material-consumption-report.use-case';
import { kyivDate } from '../../modules/reports/material-consumption/material-consumption-report.use-case';
import { GroupedByProductPresenter } from '../../modules/reports/material-consumption/grouped-by-product.presenter';
import { GoogleSheetsGroupedReportRenderer } from './grouped-report-renderer';
import { GoogleSheetsCurrentReportWriter } from './current-report-writer';
import { reportSnapshot } from './report-snapshot';

export class CurrentReportOutput {
  constructor(private readonly useCase: Pick<MaterialConsumptionReportUseCase, 'execute'>,
    private readonly writer: GoogleSheetsCurrentReportWriter) {}
  generate(request: MaterialConsumptionReportRequest, now = new Date()) {
    const dataset = this.useCase.execute(request);
    if (!dataset.products.length) return { status: 'EMPTY' as const };
    const view = new GroupedByProductPresenter().present(dataset);
    const date = kyivDate(now);
    const table = new GoogleSheetsGroupedReportRenderer().render(view, request, date);
    table.snapshot = reportSnapshot(dataset, request, date);
    return this.writer.write(table);
  }
}
