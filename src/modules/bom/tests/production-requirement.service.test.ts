import { describe, expect, it, vi } from 'vitest';

import { MaterialRequirement } from '../model/material-requirement.model';
import { ProductRequirement } from '../model/product-requirement.model';
import { BOMMaterialsService } from '../services/bom-materials.service';
import { ProductionRequirementService } from '../services/production-requirement.service';

describe('ProductionRequirementService', () => {
  it('should calculate material requirements for one product', () => {
    // Arrange

    const materials: MaterialRequirement[] = [
      {
        materialId: '3011',
        qty: 5.28,
        unit: 'кг',
      },
      {
        materialId: '3014',
        qty: 4.32,
        unit: 'кг',
      },
      {
        materialId: '3015',
        qty: 16.8,
        unit: 'кг',
      },
      {
        materialId: '3029',
        qty: 17.36,
        unit: 'кг',
      },
    ];

    const materialsService = {
      getMaterialRequirements: vi.fn().mockReturnValue(materials),
    } as unknown as BOMMaterialsService;

    const service = new ProductionRequirementService(materialsService);

    const products: ProductRequirement[] = [
      {
        productId: '2007',
        qty: 1,
      },
    ];

    // Act

    const result = service.calculate(products);

    // Assert

    expect(result).toEqual(materials);

    expect(materialsService.getMaterialRequirements).toHaveBeenCalledWith(
      '2007',
    );
  });

  it('should multiply material requirements by product quantity', () => {
    // Arrange

    const materials: MaterialRequirement[] = [
      {
        materialId: '3011',
        qty: 5.28,
        unit: 'кг',
      },
      {
        materialId: '3014',
        qty: 4.32,
        unit: 'кг',
      },
    ];

    const materialsService = {
      getMaterialRequirements: vi.fn().mockReturnValue(materials),
    } as unknown as BOMMaterialsService;

    const service = new ProductionRequirementService(materialsService);

    const products: ProductRequirement[] = [
      {
        productId: '2007',
        qty: 3,
      },
    ];

    // Act

    const result = service.calculate(products);

    // Assert

    expect(result).toEqual([
      {
        materialId: '3011',
        qty: 15.84,
        unit: 'кг',
      },
      {
        materialId: '3014',
        qty: 12.96,
        unit: 'кг',
      },
    ]);
  });

  it('should aggregate the same material from different products', () => {
    // Arrange

    const materialsService = {
      getMaterialRequirements: vi
        .fn()
        .mockImplementation((productId: string) => {
          if (productId === 'PRODUCT-A') {
            return [
              {
                materialId: '3011',
                qty: 5,
                unit: 'кг',
              },
              {
                materialId: '3014',
                qty: 2,
                unit: 'кг',
              },
            ];
          }

          if (productId === 'PRODUCT-B') {
            return [
              {
                materialId: '3011',
                qty: 3,
                unit: 'кг',
              },
              {
                materialId: '3015',
                qty: 4,
                unit: 'кг',
              },
            ];
          }

          return [];
        }),
    } as unknown as BOMMaterialsService;

    const service = new ProductionRequirementService(materialsService);

    const products: ProductRequirement[] = [
      {
        productId: 'PRODUCT-A',
        qty: 2,
      },
      {
        productId: 'PRODUCT-B',
        qty: 3,
      },
    ];

    // Act

    const result = service.calculate(products);

    // Assert

    expect(result).toEqual([
      {
        materialId: '3011',
        qty: 19,
        unit: 'кг',
      },
      {
        materialId: '3014',
        qty: 4,
        unit: 'кг',
      },
      {
        materialId: '3015',
        qty: 12,
        unit: 'кг',
      },
    ]);
  });

  it('should return an empty array when there are no products', () => {
    // Arrange

    const materialsService = {
      getMaterialRequirements: vi.fn(),
    } as unknown as BOMMaterialsService;

    const service = new ProductionRequirementService(materialsService);

    // Act

    const result = service.calculate([]);

    // Assert

    expect(result).toEqual([]);

    expect(materialsService.getMaterialRequirements).not.toHaveBeenCalled();
  });
});
