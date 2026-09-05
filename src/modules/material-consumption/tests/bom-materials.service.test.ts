import { describe, expect, it } from 'vitest';

import { BOMMaterialsService } from '../../bom/services/bom-materials.service';
import { BOMExplorerService } from '../../bom/services/bom-explorer.service';
import { InMemoryBOMRepository } from '../../bom/repositories/in-memory-bom.repository';

import { ElementRepository } from '../../elements/element.repository';
import { ElementFull } from '../../elements/element.model';
import { MaterialRepository } from '../../../domain/materials/material.repository';

import { BOMRow } from '../../bom/model/bom-row.model';
import { ElementType } from 'config/config';

function element(
  id: string,
  type: string,
  code: string,
  options: Partial<ElementFull> = {},
): ElementFull {
  return {
    id,
    type,
    code,
    baseUnit: 'шт',
    parentMaterialID: '',
    length: '',
    ...options,
  } as ElementFull;
}

describe('BOMMaterialsService — П-1', () => {
  it('calculates all material requirements for П-1', () => {
    /*
     * ---------------------------------------------------------
     * 1. BOM П-1
     * ---------------------------------------------------------
     */

    const rows: BOMRow[] = [
      // П-1
      {
        parentId: '2021',
        childId: '2007',
        qty: 1,
        unit: 'шт',
      },
      {
        parentId: '2021',
        childId: '2008',
        qty: 8,
        unit: 'шт',
      },
      {
        parentId: '2021',
        childId: '2019',
        qty: 1,
        unit: 'шт',
      },
      {
        parentId: '2021',
        childId: '2020',
        qty: 1,
        unit: 'шт',
      },
      {
        parentId: '2021',
        childId: '2009',
        qty: 4,
        unit: 'шт',
      },
      {
        parentId: '2021',
        childId: '2012',
        qty: 24,
        unit: 'шт',
      },
      {
        parentId: '2021',
        childId: '2016',
        qty: 8,
        unit: 'шт',
      },
      {
        parentId: '2021',
        childId: '3401',
        qty: 1.317,
        unit: 'м3',
      },

      // МК-1
      {
        parentId: '2007',
        childId: '2006',
        qty: 1,
        unit: 'шт',
      },
      {
        parentId: '2007',
        childId: '2002',
        qty: 6,
        unit: 'шт',
      },
      {
        parentId: '2007',
        childId: '2003',
        qty: 6,
        unit: 'шт',
      },

      // ИМ-2
      {
        parentId: '2006',
        childId: '2004',
        qty: 2,
        unit: 'шт',
      },
      {
        parentId: '2006',
        childId: '2005',
        qty: 2,
        unit: 'шт',
      },

      // Д-2-1
      {
        parentId: '2004',
        childId: '4006',
        qty: 1,
        unit: 'шт',
      },

      // Д-2-2
      {
        parentId: '2005',
        childId: '4006',
        qty: 1,
        unit: 'шт',
      },

      // КР1-1-149
      {
        parentId: '2002',
        childId: '4002',
        qty: 6,
        unit: 'шт',
      },
      {
        parentId: '2002',
        childId: '4003',
        qty: 1,
        unit: 'шт',
      },
      {
        parentId: '2002',
        childId: '2001',
        qty: 1,
        unit: 'шт',
      },
      {
        parentId: '2002',
        childId: '4004',
        qty: 1,
        unit: 'шт',
      },

      // КР1-2-149
      {
        parentId: '2003',
        childId: '4005',
        qty: 6,
        unit: 'шт',
      },
      {
        parentId: '2003',
        childId: '4003',
        qty: 1,
        unit: 'шт',
      },
      {
        parentId: '2003',
        childId: '2001',
        qty: 1,
        unit: 'шт',
      },
      {
        parentId: '2003',
        childId: '4004',
        qty: 1,
        unit: 'шт',
      },

      // ГСк-1
      {
        parentId: '2001',
        childId: '4001',
        qty: 1,
        unit: 'шт',
      },

      // КП-1
      {
        parentId: '2008',
        childId: '4007',
        qty: 1,
        unit: 'шт',
      },
      {
        parentId: '2008',
        childId: '4008',
        qty: 2,
        unit: 'шт',
      },

      // ВСП-П-1
      {
        parentId: '2019',
        childId: '4017',
        qty: 16,
        unit: 'шт',
      },
      {
        parentId: '2019',
        childId: '4018',
        qty: 12,
        unit: 'шт',
      },

      // СП-П-1
      {
        parentId: '2020',
        childId: '4019',
        qty: 2,
        unit: 'шт',
      },
      {
        parentId: '2020',
        childId: '4020',
        qty: 10,
        unit: 'шт',
      },
      {
        parentId: '2020',
        childId: '4021',
        qty: 2,
        unit: 'шт',
      },
      {
        parentId: '2020',
        childId: '4022',
        qty: 10,
        unit: 'шт',
      },

      // ГС-0
      {
        parentId: '2009',
        childId: '4009',
        qty: 1,
        unit: 'шт',
      },

      // ГС-2
      {
        parentId: '2012',
        childId: '4013',
        qty: 1,
        unit: 'шт',
      },

      // ГС-3
      {
        parentId: '2016',
        childId: '4013',
        qty: 1,
        unit: 'шт',
      },
    ];

    /*
     * ---------------------------------------------------------
     * 2. Елементи
     * ---------------------------------------------------------
     */

    const elements = new Map<string, ElementFull>();

    const add = (e: ElementFull) => elements.set(e.id, e);

    // Product
    add(
      element('2021', 'product', 'П-1', {
        baseUnit: 'шт',
      }),
    );

    // Assemblies
    add(element('2007', 'assembly', 'МК-1'));
    add(element('2006', 'assembly', 'ИМ-2'));
    add(element('2004', 'assembly', 'Д-2-1'));
    add(element('2005', 'assembly', 'Д-2-2'));

    add(element('2002', 'assembly', 'КР1-1-149'));
    add(element('2003', 'assembly', 'КР1-2-149'));
    add(element('2001', 'assembly', 'ГСк-1'));

    add(element('2008', 'assembly', 'КП-1'));
    add(element('2019', 'assembly', 'ВСП-П-1'));
    add(element('2020', 'assembly', 'СП-П-1'));

    add(element('2009', 'assembly', 'ГС-0'));
    add(element('2012', 'assembly', 'ГС-2'));
    add(element('2016', 'assembly', 'ГС-3'));

    // Parts
    add(
      element('4006', 'part', 'ANGLE_100_63_8_L440', {
        length: 440,
        parentMaterialID: '3029',
      }),
    );

    add(
      element('4002', 'part', 'R_6_A500C_L145', {
        length: 145,
        parentMaterialID: '3011',
      }),
    );

    add(
      element('4003', 'part', 'R_6_A500C_L1180', {
        length: 1180,
        parentMaterialID: '3011',
      }),
    );

    add(
      element('4004', 'part', 'R_14_A500C_L1160', {
        length: 1160,
        parentMaterialID: '3015',
      }),
    );

    add(
      element('4005', 'part', 'R_6_A500C_L130', {
        length: 130,
        parentMaterialID: '3011',
      }),
    );

    add(
      element('4001', 'part', 'R_12_A500C_L400', {
        length: 400,
        parentMaterialID: '3014',
      }),
    );

    add(
      element('4007', 'part', 'R_12_A500C_L1015', {
        length: 1015,
        parentMaterialID: '3014',
      }),
    );

    add(
      element('4008', 'part', 'R_4_BP-1_L340', {
        length: 340,
        parentMaterialID: '3001',
      }),
    );

    add(
      element('4017', 'part', 'R_12_A500C_L2800', {
        length: 2800,
        parentMaterialID: '3014',
      }),
    );

    add(
      element('4018', 'part', 'R_12_A500C_L1850', {
        length: 1850,
        parentMaterialID: '3014',
      }),
    );

    add(
      element('4019', 'part', 'R_6_A500C_L2960', {
        length: 2960,
        parentMaterialID: '3011',
      }),
    );

    add(
      element('4020', 'part', 'R_4_BP-1_L2960', {
        length: 2960,
        parentMaterialID: '3001',
      }),
    );

    add(
      element('4021', 'part', 'R_6_A500C_L2920', {
        length: 2920,
        parentMaterialID: '3011',
      }),
    );

    add(
      element('4022', 'part', 'R_4_BP-1_L2920', {
        length: 2920,
        parentMaterialID: '3001',
      }),
    );

    add(
      element('4009', 'part', 'R_12_A240C_L950', {
        length: 950,
        parentMaterialID: '3005',
      }),
    );

    add(
      element('4013', 'part', 'R_12_A500C_L800', {
        length: 800,
        parentMaterialID: '3014',
      }),
    );

    // Concrete element
    add(
      element('3401', 'material', 'C_20_25', {
        baseUnit: 'м3',
        parentMaterialID: '3201',
      }),
    );

    /*
     * ---------------------------------------------------------
     * 3. ElementRepository
     * ---------------------------------------------------------
     */

    const elementRepo = {
      findById(id: string): ElementFull | null {
        return elements.get(id) ?? null;
      },

      findByCode(): ElementFull | null {
        return null;
      },

      findByCodeNormalized(): ElementFull | null {
        return null;
      },

      insert(): void {},

      updateType(): void {},

      findByCodeInDocuments(): ElementFull | null {
        return null;
      },

      findByTypeInDocuments(
        type: ElementType,
        projectDocumentIDs: readonly string[],
      ): ElementFull[] {
        return [];
      },
    } as ElementRepository;

    /*
     * ---------------------------------------------------------
     * 4. MaterialRepository
     * ---------------------------------------------------------
     */

    const materialData = new Map([
      [
        '3011',
        {
          id: '3011',
          code: 'R_6_A500C',
          name: 'R_6_A500C',
          category: 'rebar',
          profileType: 'round',
          weightPerMeter: 0.222,
          baseUnit: 'кг',
          isActive: true,
        },
      ],
      [
        '3014',
        {
          id: '3014',
          code: 'R_12_A500C',
          name: 'R_12_A500C',
          category: 'rebar',
          profileType: 'round',
          weightPerMeter: 0.888,
          baseUnit: 'кг',
          isActive: true,
        },
      ],
      [
        '3015',
        {
          id: '3015',
          code: 'R_14_A500C',
          name: 'R_14_A500C',
          category: 'rebar',
          profileType: 'round',
          weightPerMeter: 1.21,
          baseUnit: 'кг',
          isActive: true,
        },
      ],
      [
        '3001',
        {
          id: '3001',
          code: 'R_4_BP-1',
          name: 'R_4_BP-1',
          category: 'rebar',
          profileType: 'round',
          weightPerMeter: 0.0986460093227195,
          baseUnit: 'кг',
          isActive: true,
        },
      ],
      [
        '3005',
        {
          id: '3005',
          code: 'R_12_A240C',
          name: 'R_12_A240C',
          category: 'rebar',
          profileType: 'round',
          weightPerMeter: 0.888,
          baseUnit: 'кг',
          isActive: true,
        },
      ],
      [
        '3029',
        {
          id: '3029',
          code: 'ANGLE_100_63_8',
          name: 'ANGLE_100_63_8',
          category: 'steel',
          profileType: 'angle',
          weightPerMeter: 9.87,
          baseUnit: 'кг',
          isActive: true,
        },
      ],
      [
        '3201',
        {
          id: '3201',
          code: 'C_20_25',
          name: 'Бетон С20/25',
          category: 'concrete',
          profileType: '',
          baseUnit: 'м3',
          isActive: true,
        },
      ],
    ]);

    const materialRepo = {
      findById(id: string) {
        return materialData.get(id) ?? null;
      },
    } as MaterialRepository;

    /*
     * ---------------------------------------------------------
     * 5. Services
     * ---------------------------------------------------------
     */

    const bomRepo = new InMemoryBOMRepository(rows);

    const explorer = new BOMExplorerService(elementRepo, bomRepo);

    const service = new BOMMaterialsService(explorer, materialRepo);

    /*
     * ---------------------------------------------------------
     * 6. Розрахунок
     * ---------------------------------------------------------
     */

    const result = service.getMaterialRequirements('2021');

    const actual = new Map(
      result.map((item) => [
        item.materialId,
        {
          qty: item.qty,
          unit: item.unit,
        },
      ]),
    );

    /*
     * ---------------------------------------------------------
     * 7. Перевірка
     * ---------------------------------------------------------
     */

    expect(actual.get('3029')).toEqual({
      qty: 17.372,
      unit: 'кг',
    });

    expect(actual.get('3011')).toEqual({
      qty: 7.952,
      unit: 'кг',
    });

    expect(actual.get('3014')).toEqual({
      qty: 93.702,
      unit: 'кг',
    });

    expect(actual.get('3015')).toEqual({
      qty: 16.844,
      unit: 'кг',
    });

    expect(actual.get('3001')).toEqual({
      qty: 6.337,
      unit: 'кг',
    });

    expect(actual.get('3005')).toEqual({
      qty: 3.374,
      unit: 'кг',
    });

    expect(actual.get('3201')).toEqual({
      qty: 1.317,
      unit: 'м3',
    });

    expect(result).toHaveLength(7);
  });
});
