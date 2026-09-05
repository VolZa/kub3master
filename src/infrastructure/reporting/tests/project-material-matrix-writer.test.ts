// src/infrastructure/reporting/tests/project-material-matrix-writer.test.ts

import { describe, expect, it, vi } from 'vitest';

import { ProjectMaterialMatrixWriter } from '../project-material-matrix-writer';

import { BOMMaterialMatrix } from '../../../modules/bom/model/bom-material-matrix.model';

describe('ProjectMaterialMatrixWriter', () => {
  it('записує матрицю у правильному порядку колонок', () => {
    const setValues = vi.fn();

    const sheet = {
      clearContents: vi.fn(),
      getRange: vi.fn(() => ({
        setValues,
      })),
    };

    const spreadsheet = {
      getSheetByName: vi.fn(() => sheet),
    };

    const matrix: BOMMaterialMatrix = {
      projectId: '1',

      columns: [
        {
          id: '3001',
          matrixCode: 'PRODUCT',
          columnCode: 'R_4_BP-1',
          materialId: '3001',
          title: 'R 4 BP-1',
          unit: 'kg',
          sortOrder: 10,
          isActive: true,
          comment: '',
        },
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
            '3001': 6.337,
            '3014': 93.702,
          },
        },
      ],
    };

    const writer = new ProjectMaterialMatrixWriter(spreadsheet as never);

    writer.write(matrix);

    expect(spreadsheet.getSheetByName).toHaveBeenCalled();

    expect(sheet.clearContents).toHaveBeenCalled();

    // Заголовок
    expect(setValues).toHaveBeenNthCalledWith(1, [
      ['ProjectID', 'ProductID', 'ProductCode', 'R_4_BP-1', 'R_12_A500C'],
    ]);

    // Дані
    expect(setValues).toHaveBeenNthCalledWith(2, [
      ['1', '2021', 'П-1', 6.337, 93.702],
    ]);
  });

  it('записує 0, якщо матеріал відсутній у values', () => {
    const setValues = vi.fn();

    const sheet = {
      clearContents: vi.fn(),
      getRange: vi.fn(() => ({
        setValues,
      })),
    };

    const spreadsheet = {
      getSheetByName: vi.fn(() => sheet),
    };

    const matrix: BOMMaterialMatrix = {
      projectId: '1',

      columns: [
        {
          id: '3001',
          matrixCode: 'PRODUCT',
          columnCode: 'R_4_BP-1',
          materialId: '3001',
          title: 'R 4 BP-1',
          unit: 'kg',
          sortOrder: 10,
          isActive: true,
          comment: '',
        },
      ],

      rows: [
        {
          productId: '2021',
          productCode: 'П-1',
          values: {},
        },
      ],
    };

    const writer = new ProjectMaterialMatrixWriter(spreadsheet as never);

    writer.write(matrix);

    expect(setValues).toHaveBeenNthCalledWith(2, [['1', '2021', 'П-1', 0]]);
  });

  it('викидає помилку, якщо аркуш не знайдено', () => {
    const spreadsheet = {
      getSheetByName: vi.fn(() => null),
    };

    const writer = new ProjectMaterialMatrixWriter(spreadsheet as never);

    const matrix: BOMMaterialMatrix = {
      projectId: '1',
      columns: [],
      rows: [],
    };

    expect(() => writer.write(matrix)).toThrow(
      'Аркуш "ВідомістьВитрат" не знайдено.',
    );
  });
});
