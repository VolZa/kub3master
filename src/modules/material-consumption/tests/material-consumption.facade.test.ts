// src/modules/material-consumption/tests/material-consumption.facade.test.ts

import { describe, expect, it } from 'vitest';

import { BOMTreeNode } from '../../bom/model/bom-tree-node.model';
import { ElementFull } from '../../elements/element.model';

import { MaterialConsumptionFacade } from '../engine/material-consumption.facade';
import { BOMTraverser } from '../engine/bom-traverser';
import { MaterialFlowEventBuilder } from '../engine/material-flow-event.builder';
import { MaterialConsumptionValidator } from '../engine/material-consumption.validator';

function createElement(overrides: Partial<ElementFull> = {}): ElementFull {
  return {
    id: 'TEST-1',
    code: 'TEST',
    prefixName: '',
    name: 'Test element',
    type: 'material',
    category: 'rebar',
    profileType: 'round',
    baseUnit: 'кг',
    isActive: true,
    createdAt: new Date(),

    ...overrides,
  };
}

// function createNode(
//   element: ElementFull,
//   totalQty: number,
//   children: BOMTreeNode[] = [],
// ): BOMTreeNode {
//   return {
//     element,
//     qty: totalQty,
//     totalQty,
//     children,
//   };
// }

function createNode(
  element: ElementFull,
  totalQty: number,
  children: BOMTreeNode[] = [],
  unit: string = element.baseUnit,
): BOMTreeNode {
  return {
    element,
    qty: totalQty,
    unit,
    totalQty,
    children,
  };
}

describe('MaterialConsumptionFacade', () => {
  it('should create MaterialFlowEvent for a material node', () => {
    // Arrange

    const material = createElement({
      id: '3001',
      code: 'R_4_BP-1',
      name: 'Арматура ø4 Вр-1',
    });

    const root = createNode(material, 12);

    const facade = new MaterialConsumptionFacade(
      new MaterialConsumptionValidator(),
      new BOMTraverser(),
      new MaterialFlowEventBuilder(),
    );

    // Act

    const flow = facade.calculate(root, {
      context: 'PRODUCTION',
      originType: 'BOM',
      originId: 'TEST-BOM-001',
      productId: 'PRODUCT-001',
    });

    // Assert

    expect(flow).toHaveLength(1);

    expect(flow[0]).toEqual({
      context: 'PRODUCTION',
      originType: 'BOM',
      originId: 'TEST-BOM-001',
      productId: 'PRODUCT-001',
      materialId: '3001',
      quantity: 12,
      unit: 'кг',
    });
  });

  it('should collect materials from nested BOM nodes', () => {
    // Arrange

    const materialA = createElement({
      id: '3001',
      code: 'R_4_BP-1',
      name: 'Арматура ø4 Вр-1',
    });

    const materialB = createElement({
      id: '3002',
      code: 'R_6_A500C',
      name: 'Арматура ø6 А500С',
    });

    const assembly = createElement({
      id: 'ASSEMBLY-001',
      code: 'ASM-001',
      name: 'Тестова збірка',
      type: 'assembly',
      category: '',
      profileType: undefined,
      baseUnit: '',
    });

    const root: BOMTreeNode = createNode(assembly, 1, [
      createNode(materialA, 5),
      createNode(materialB, 3),
    ]);

    const facade = new MaterialConsumptionFacade(
      new MaterialConsumptionValidator(),
      new BOMTraverser(),
      new MaterialFlowEventBuilder(),
    );

    // Act

    const flow = facade.calculate(root, {
      context: 'PRODUCTION',
      originType: 'BOM',
      originId: 'TEST-BOM-002',
      productId: 'PRODUCT-001',
    });

    // Assert

    expect(flow).toHaveLength(2);

    expect(flow).toEqual(
      expect.arrayContaining([
        {
          context: 'PRODUCTION',
          originType: 'BOM',
          originId: 'TEST-BOM-002',
          productId: 'PRODUCT-001',
          materialId: '3001',
          quantity: 5,
          unit: 'кг',
        },
        {
          context: 'PRODUCTION',
          originType: 'BOM',
          originId: 'TEST-BOM-002',
          productId: 'PRODUCT-001',
          materialId: '3002',
          quantity: 3,
          unit: 'кг',
        },
      ]),
    );
  });

  it('should collect material through a part node', () => {
    // Arrange

    const material = createElement({
      id: '3001',
      code: 'R_6_A500C',
      name: 'Арматура ø6 А500С',
    });

    const part = createElement({
      id: 'PART-001',
      code: 'GS-1',
      name: 'Гнутий стержень',
      type: 'part',
      category: 'rebar',
      profileType: 'round',
      baseUnit: 'шт',
      length: 1200,
    });

    const assembly = createElement({
      id: 'ASSEMBLY-001',
      code: 'ASM-001',
      name: 'Тестова збірка',
      type: 'assembly',
      category: '',
      profileType: undefined,
      baseUnit: '',
    });

    const root: BOMTreeNode = createNode(assembly, 1, [
      createNode(part, 4, [createNode(material, 8)]),
    ]);

    const facade = new MaterialConsumptionFacade(
      new MaterialConsumptionValidator(),
      new BOMTraverser(),
      new MaterialFlowEventBuilder(),
    );

    // Act

    const flow = facade.calculate(root, {
      context: 'PRODUCTION',
      originType: 'BOM',
      originId: 'TEST-BOM-003',
      productId: 'PRODUCT-001',
    });

    // Assert

    expect(flow).toHaveLength(1);

    expect(flow[0]).toEqual({
      context: 'PRODUCTION',
      originType: 'BOM',
      originId: 'TEST-BOM-003',
      productId: 'PRODUCT-001',
      materialId: '3001',
      quantity: 8,
      unit: 'кг',
    });
  });
});

it('should calculate MaterialFlow through the complete BOM chain', () => {
  // Arrange

  const materialA = createElement({
    id: '3001',
    code: 'R_4_BP-1',
    name: 'Арматура ø4 Вр-1',
  });

  const materialB = createElement({
    id: '3002',
    code: 'R_6_A500C',
    name: 'Арматура ø6 А500С',
  });

  const nestedAssembly = createElement({
    id: 'ASSEMBLY-002',
    code: 'ASM-002',
    name: 'Вкладена збірка',
    type: 'assembly',
    category: '',
    profileType: undefined,
    baseUnit: '',
  });

  const rootAssembly = createElement({
    id: 'ASSEMBLY-001',
    code: 'ASM-001',
    name: 'Коренева збірка',
    type: 'assembly',
    category: '',
    profileType: undefined,
    baseUnit: '',
  });

  //   const root: BOMTreeNode = createNode(rootAssembly, 1, [
  //     createNode(materialA, 5),

  //     createNode(nestedAssembly, 2, [createNode(materialB, 3)]),
  //   ]);

  const nestedMaterialB = createNode(materialB, 3);

  nestedMaterialB.totalQty = 6;

  const root: BOMTreeNode = createNode(rootAssembly, 1, [
    createNode(materialA, 5),
    createNode(nestedAssembly, 2, [nestedMaterialB]),
  ]);

  const facade = new MaterialConsumptionFacade(
    new MaterialConsumptionValidator(),
    new BOMTraverser(),
    new MaterialFlowEventBuilder(),
  );

  // Act

  const flow = facade.calculate(root, {
    context: 'PRODUCTION',
    originType: 'BOM',
    originId: 'TEST-BOM-COMPLETE',
    productId: 'PRODUCT-001',
  });

  // Assert

  expect(flow).toHaveLength(2);

  expect(flow).toEqual(
    expect.arrayContaining([
      {
        context: 'PRODUCTION',
        originType: 'BOM',
        originId: 'TEST-BOM-COMPLETE',
        productId: 'PRODUCT-001',
        materialId: '3001',
        quantity: 5,
        unit: 'кг',
      },
      {
        context: 'PRODUCTION',
        originType: 'BOM',
        originId: 'TEST-BOM-COMPLETE',
        productId: 'PRODUCT-001',
        materialId: '3002',
        quantity: 6,
        unit: 'кг',
      },
    ]),
  );
});

it('should not aggregate material events', () => {
  // Arrange

  const material = createElement({
    id: '3001',
    code: 'R_4_BP-1',
    name: 'Арматура ø4 Вр-1',
    baseUnit: 'кг',
  });

  const rootAssembly = createElement({
    id: 'ASSEMBLY-001',
    code: 'ASM-001',
    name: 'Тестова збірка',
    type: 'assembly',
    category: '',
    profileType: undefined,
    baseUnit: '',
  });

  const root: BOMTreeNode = createNode(rootAssembly, 1, [
    createNode(material, 5),
    createNode(material, 3),
  ]);

  const facade = new MaterialConsumptionFacade(
    new MaterialConsumptionValidator(),
    new BOMTraverser(),
    new MaterialFlowEventBuilder(),
  );

  // Act

  const flow = facade.calculate(root, {
    context: 'PRODUCTION',
    originType: 'BOM',
    originId: 'TEST-BOM-004',
    productId: 'PRODUCT-001',
  });

  // Assert

  expect(flow).toHaveLength(2);

  expect(flow[0]).toEqual({
    context: 'PRODUCTION',
    originType: 'BOM',
    originId: 'TEST-BOM-004',
    productId: 'PRODUCT-001',
    materialId: '3001',
    quantity: 5,
    unit: 'кг',
  });

  expect(flow[1]).toEqual({
    context: 'PRODUCTION',
    originType: 'BOM',
    originId: 'TEST-BOM-004',
    productId: 'PRODUCT-001',
    materialId: '3001',
    quantity: 3,
    unit: 'кг',
  });
});
