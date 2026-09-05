import { describe, expect, it } from 'vitest';

import { BOMMaterialMatrixService } from '../services/bom-material-matrix.service';
import { BOMMatrixColumnDefinition } from '../model/bom-matrix-column-definition.model';
import { InMemoryBOMMatrixColumnsRepository } from '../repositories/in-memory-bom-matrix-columns.repository';
import { MaterialRequirement } from '../model/material-requirement.model';
import { ElementFull } from '../../elements/element.model';

describe('BOMMaterialMatrixService', () => {
  /*
   * ---------------------------------------------------------
   * 1. Test products
   * ---------------------------------------------------------
   */

  const product1 = {
    id: '1001',
    code: 'П-1',
    type: 'product',
  } as ElementFull;

  const product2 = {
    id: '1002',
    code: 'П-2',
    type: 'product',
  } as ElementFull;

  /*
   * ---------------------------------------------------------
   * 2. BOMMatrixColumns
   * ---------------------------------------------------------
   *
   * Навмисно записуємо НЕ в порядку SortOrder.
   */

  const columns: BOMMatrixColumnDefinition[] = [
    {
      id: '1',
      matrixCode: 'PRODUCT',
      columnCode: 'R_12_A500C',
      materialId: '3014',
      title: 'Арматура ø12 А500С',
      unit: 'кг',
      sortOrder: 230,
      isActive: true,
    },
    {
      id: '2',
      matrixCode: 'PRODUCT',
      columnCode: 'R_6_A500C',
      materialId: '3011',
      title: 'Арматура ø6 А500С',
      unit: 'кг',
      sortOrder: 200,
      isActive: true,
    },
    {
      id: '3',
      matrixCode: 'PRODUCT',
      columnCode: 'C_20_25',
      materialId: '3201',
      title: 'Бетон С20/25',
      unit: 'м3',
      sortOrder: 900,
      isActive: true,
    },
    {
      id: '4',
      matrixCode: 'PRODUCT',
      columnCode: 'R_14_A500C',
      materialId: '3015',
      title: 'Арматура ø14 А500С',
      unit: 'кг',
      sortOrder: 240,
      isActive: true,
    },
    {
      id: '5',
      matrixCode: 'PRODUCT',
      columnCode: 'R_8_A500C',
      materialId: '3012',
      title: 'Арматура ø8 А500С',
      unit: 'кг',
      sortOrder: 210,
      isActive: true,
    },
  ];

  const columnsRepository = new InMemoryBOMMatrixColumnsRepository(columns);

  /*
   * ---------------------------------------------------------
   * 3. BOMMaterialsService mock
   * ---------------------------------------------------------
   *
   * П-1 використовує:
   *   A500C Ø6
   *   A500C Ø12
   *   бетон
   *
   * П-2 використовує:
   *   A500C Ø8
   *   A500C Ø12
   *
   * Тобто матриця повинна мати 4 колонки.
   */

  const requirements = new Map<string, MaterialRequirement[]>([
    [
      '1001',
      [
        {
          materialId: '3011',
          qty: 7.952,
          unit: 'кг',
        },
        {
          materialId: '3014',
          qty: 93.702,
          unit: 'кг',
        },
        {
          materialId: '3201',
          qty: 1.317,
          unit: 'м3',
        },
      ],
    ],

    [
      '1002',
      [
        {
          materialId: '3012',
          qty: 12.5,
          unit: 'кг',
        },
        {
          materialId: '3014',
          qty: 50.25,
          unit: 'кг',
        },
      ],
    ],
  ]);

  const bomMaterialsService = {
    getMaterialRequirements(productId: string): MaterialRequirement[] {
      return requirements.get(productId) ?? [];
    },
  } as any;

  /*
   * ---------------------------------------------------------
   * 4. Service
   * ---------------------------------------------------------
   */

  const service = new BOMMaterialMatrixService(
    bomMaterialsService,
    columnsRepository,
  );

  /*
   * ---------------------------------------------------------
   * 5. Tests
   * ---------------------------------------------------------
   */

  it('builds matrix for all products', () => {
    const result = service.build([product1, product2]);

    expect(result.rows).toHaveLength(2);
  });

  it('includes only materials actually used in the project BOM', () => {
    const result = service.build([product1, product2]);

    expect(result.columns.map((column) => column.materialId)).toEqual([
      '3011',
      '3012',
      '3014',
      '3201',
    ]);
  });

  it('keeps columns ordered by SortOrder', () => {
    const result = service.build([product1, product2]);

    expect(result.columns.map((column) => column.sortOrder)).toEqual([
      200, 210, 230, 900,
    ]);
  });

  it('creates one row per product', () => {
    const result = service.build([product1, product2]);

    expect(result.rows.map((row) => row.productCode)).toEqual(['П-1', 'П-2']);
  });

  it('places material quantities into the correct columns', () => {
    const result = service.build([product1, product2]);

    expect(result.rows[0].values).toEqual({
      R_6_A500C: 7.952,
      R_12_A500C: 93.702,
      C_20_25: 1.317,
    });

    expect(result.rows[1].values).toEqual({
      R_8_A500C: 12.5,
      R_12_A500C: 50.25,
    });
  });

  it('does not create values for unused materials', () => {
    const result = service.build([product1, product2]);

    expect(result.rows[0].values.R_8_A500C).toBeUndefined();
    expect(result.rows[1].values.R_6_A500C).toBeUndefined();
    expect(result.rows[1].values.C_20_25).toBeUndefined();
  });

  it('ignores material requirements without configured matrix columns', () => {
    requirements.set('1001', [
      ...requirements.get('1001')!,
      {
        materialId: '9999',
        qty: 123,
        unit: 'кг',
      },
    ]);

    const result = service.build([product1, product2]);

    expect(result.columns.some((column) => column.materialId === '9999')).toBe(
      false,
    );

    expect(result.rows[0].values).not.toHaveProperty('9999');
  });
});
