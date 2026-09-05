import { getProjectMaterialMatrixReportService } from '../../app/factories/project-material-matrix-report.factory';

export function generateProjectMaterialMatrixReport(projectId: string): void {
  const service = getProjectMaterialMatrixReportService();

  service.generate(projectId);
}
