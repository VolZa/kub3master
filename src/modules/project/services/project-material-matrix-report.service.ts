import { ProjectMaterialMatrixService } from './project-material-matrix.service';
import { ProjectMaterialMatrixWriter } from '../../../infrastructure/reporting/project-material-matrix-writer';

export class ProjectMaterialMatrixReportService {
  constructor(
    private readonly projectMaterialMatrixService: ProjectMaterialMatrixService,
    private readonly writer: ProjectMaterialMatrixWriter,
  ) {}

  // generate(projectId: string): void {
  //   const matrix = this.projectMaterialMatrixService.build(projectId);

  //   this.writer.write(matrix);
  // }

  generate(projectId: string): void {
    const matrix = this.projectMaterialMatrixService.build(projectId);

    console.log(
      'MATRIX COLUMNS:',
      JSON.stringify(
        matrix.columns.map((column) => ({
          materialId: column.materialId,
          columnCode: column.columnCode,
        })),
      ),
    );

    console.log('MATRIX FIRST ROW:', JSON.stringify(matrix.rows[0]));

    this.writer.write(matrix);
  }
}
