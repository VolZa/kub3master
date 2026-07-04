import { createServices } from '../../../core/bootstrap/bootstrap';

export function testProductReport() {
  const app = createServices();

  const report = app.services.reports.productData.getProductReportData('2024');

  const row = app.services.reports.rowBuilder.build(report);

  app.services.reports.writer.write(row);
}
