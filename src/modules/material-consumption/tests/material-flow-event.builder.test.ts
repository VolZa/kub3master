import { describe, expect, it } from 'vitest';

import { BOMTreeNode } from '../../bom/model/bom-tree-node.model';
import { ElementFull } from '../../elements/element.model';

import { MaterialFlowEventBuilder } from '../engine/material-flow-event.builder';
import { UnsupportedUnitError } from '../errors/material-consumption.error';

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

const context = {
  context: 'PRODUCTION' as const,
  originType: 'BOM' as const,
  originId: 'TEST-BOM-BUILDER',
  productId: 'PRODUCT-001',
};

describe('MaterialFlowEventBuilder', () => {
  it('should build MaterialFlowEvent for a valid material node', () => {
    // Arrange

    const material = createElement({
      id: '3001',
      code: 'R_4_BP-1',
      name: 'Арматура ø4 Вр-1',
      baseUnit: 'кг',
    });

    const node = createNode(material, 8);

    const builder = new MaterialFlowEventBuilder();

    // Act

    const event = builder.build(node, context);

    // Assert

    expect(event).toEqual({
      context: 'PRODUCTION',
      originType: 'BOM',
      originId: 'TEST-BOM-BUILDER',
      productId: 'PRODUCT-001',
      materialId: '3001',
      quantity: 8,
      unit: 'кг',
    });
  });

  it('should return null for a non-material node', () => {
    // Arrange

    const assembly = createElement({
      id: 'ASSEMBLY-001',
      code: 'ASM-001',
      name: 'Тестова збірка',
      type: 'assembly',
      category: '',
      profileType: undefined,
      baseUnit: '',
    });

    const node = createNode(assembly, 1);

    const builder = new MaterialFlowEventBuilder();

    // Act

    const event = builder.build(node, context);

    // Assert

    expect(event).toBeNull();
  });

  it('should throw an error when material ID is missing', () => {
    // Arrange

    const material = createElement({
      id: '',
      code: 'R_4_BP-1',
      baseUnit: 'кг',
    });

    const node = createNode(material, 8);

    const builder = new MaterialFlowEventBuilder();

    // Act / Assert

    expect(() => builder.build(node, context)).toThrow(
      'Material element ID is required.',
    );
  });

  it('should throw UnsupportedUnitError for unsupported unit', () => {
    // Arrange

    const material = createElement({
      id: '3001',
      code: 'R_4_BP-1',
      baseUnit: 'шт',
    });

    const node = createNode(material, 8);

    const builder = new MaterialFlowEventBuilder();

    // Act / Assert

    expect(() => builder.build(node, context)).toThrow(UnsupportedUnitError);
  });

  it('should preserve the quantity and unit from the BOM node', () => {
    // Arrange

    // const material = createElement({
    //   id: '3001',
    //   code: 'R_6_A500C',
    //   name: 'Арматура ø6 А500С',
    //   baseUnit: 'кг',
    // });

    //  const node = createNode(material, 12.5);

    const material = createElement({
      id: '3401',
      code: 'CONCRETE',
      name: 'Бетонна суміш',
      type: 'material',
      category: 'concrete_mix',
      baseUnit: 'м3',
    });

    const node = createNode(material, 1.317, [], 'м3');

    const builder = new MaterialFlowEventBuilder();

    // Act

    const event = builder.build(node, context);

    // Assert

    expect(event).not.toBeNull();

    expect(event?.quantity).toBe(1.317);
    expect(event?.unit).toBe('м3');
    expect(event?.materialId).toBe('3401');
  });
});
