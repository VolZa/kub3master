import { describe, expect, it } from 'vitest';

import { BOMMatrixColumnDefinition } from '../model/bom-matrix-column-definition.model';
import { InMemoryBOMMatrixColumnsRepository } from '../repositories/in-memory-bom-matrix-columns.repository';

describe('InMemoryBOMMatrixColumnsRepository', () => {
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
      columnCode: 'R_4_BP-1',
      materialId: '3001',
      title: 'Арматура ø4 Вр-1',
      unit: 'кг',
      sortOrder: 10,
      isActive: true,
    },
    {
      id: '3',
      matrixCode: 'PRODUCT',
      columnCode: 'R_14_A500C',
      materialId: '3015',
      title: 'Арматура ø14 А500С',
      unit: 'кг',
      sortOrder: 240,
      isActive: true,
    },
    {
      id: '4',
      matrixCode: 'PRODUCT',
      columnCode: 'C_20_25',
      materialId: '3201',
      title: 'Бетон С20/25',
      unit: 'м3',
      sortOrder: 900,
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
      isActive: false,
    },
    {
      id: '6',
      matrixCode: 'PURCHASE',
      columnCode: 'R_12_A500C',
      materialId: '3014',
      title: 'Арматура ø12 А500С',
      unit: 'кг',
      sortOrder: 10,
      isActive: true,
    },
  ];

  const repository = new InMemoryBOMMatrixColumnsRepository(columns);

  describe('getAll()', () => {
    it('returns all columns', () => {
      const result = repository.getAll();

      expect(result).toHaveLength(6);
    });
  });

  describe('getActive()', () => {
    it('returns only active columns for the requested matrix', () => {
      const result = repository.getActive('PRODUCT');

      expect(result).toHaveLength(4);

      expect(result.every((column) => column.isActive)).toBe(true);

      expect(result.every((column) => column.matrixCode === 'PRODUCT')).toBe(
        true,
      );
    });

    it('returns columns sorted by SortOrder', () => {
      const result = repository.getActive('PRODUCT');

      expect(result.map((column) => column.sortOrder)).toEqual([
        10, 230, 240, 900,
      ]);
    });

    it('does not return columns from another matrix', () => {
      const result = repository.getActive('PRODUCT');

      expect(result.some((column) => column.matrixCode === 'PURCHASE')).toBe(
        false,
      );
    });
  });

  describe('findByMaterialId()', () => {
    it('finds an active column by material ID', () => {
      const result = repository.findByMaterialId('PRODUCT', '3014');

      expect(result?.columnCode).toBe('R_12_A500C');
      expect(result?.sortOrder).toBe(230);
    });

    it('finds the column in the requested matrix', () => {
      const result = repository.findByMaterialId('PURCHASE', '3014');

      expect(result?.matrixCode).toBe('PURCHASE');
      expect(result?.sortOrder).toBe(10);
    });

    it('does not return an inactive column', () => {
      const result = repository.findByMaterialId('PRODUCT', '3012');

      expect(result).toBeNull();
    });

    it('returns null when material is not configured', () => {
      const result = repository.findByMaterialId('PRODUCT', '9999');

      expect(result).toBeNull();
    });
  });

  //   describe('findByMaterialId()', () => {
  //     it('finds an active column by material ID', () => {
  //       const result = repository.findByMaterialId('PRODUCT', '3014');

  //       expect(result).toEqual({
  //         id: '1',
  //         matrixCode: 'PRODUCT',
  //         columnCode: 'R_12_A500C',
  //         materialId: '3014',
  //         title: 'Арматура ø12 А500С',
  //         unit: 'кг',
  //         sortOrder: 230,
  //         isActive: true,
  //       });
  //     });

  //     it('does not return an inactive column', () => {
  //       const result = repository.findByMaterialId('PRODUCT', '3012');

  //       expect(result).toBeNull();
  //     });

  //     it('does not return a column from another matrix', () => {
  //       const result = repository.findByMaterialId('PRODUCT', '3014');

  //       expect(result?.matrixCode).toBe('PRODUCT');
  //     });

  //     it('returns null when material is not configured', () => {
  //       const result = repository.findByMaterialId('PRODUCT', '9999');

  //       expect(result).toBeNull();
  //     });
  //   });
});
