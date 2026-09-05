import { describe, expect, it, vi } from 'vitest';

import { ProjectMaterialMatrixReportService } from '../services/project-material-matrix-report.service';

import { BOMMaterialMatrix } from '../../bom/model/bom-material-matrix.model';

describe('ProjectMaterialMatrixReportService', () => {
  it('будує матрицю проекту та передає її Writer', () => {
    const matrix: BOMMaterialMatrix = {
      projectId: '1',

      columns: [
        {
          id: '3014',
          matrixCode: 'PRODUCT',
          columnCode: 'R_12_A500C',
          materialId: '3014',
          title: 'R 12 A500C',
          unit: 'kg',
          sortOrder: 230,
          isActive: true,
          comment: '',
        },
      ],

      rows: [
        {
          productId: '2021',
          productCode: 'П-1',
          values: {
            '3014': 93.702,
          },
        },
      ],
    };

    const build = vi.fn(() => matrix);
    const write = vi.fn();

    const projectMaterialMatrixService = {
      build,
    };

    const writer = {
      write,
    };

    const service = new ProjectMaterialMatrixReportService(
      projectMaterialMatrixService as never,
      writer as never,
    );

    service.generate('1');

    expect(build).toHaveBeenCalledTimes(1);
    expect(build).toHaveBeenCalledWith('1');

    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(matrix);
  });
});
