import { describe, expect, it } from 'vitest';

import { BOMTreeNode } from '../../bom/model/bom-tree-node.model';
import { ElementFull } from '../../elements/element.model';

import {
  MaterialFlowEventBuilder,
  MaterialFlowEventBuilderContext,
} from '../engine/material-flow-event.builder';
import { MaterialFlowEventVisitor } from '../engine/material-flow-event.visitor';

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

function createContext(): MaterialFlowEventBuilderContext {
  return {
    context: 'PRODUCTION',
    originType: 'BOM',
    originId: 'TEST-BOM-VISITOR',
    productId: 'PRODUCT-001',
  };
}

describe('MaterialFlowEventVisitor', () => {
  it('should add event returned by the builder', () => {
    // Arrange

    const material = createElement({
      id: '3001',
      code: 'R_4_BP-1',
      name: 'Арматура ø4 Вр-1',
    });

    const node = createNode(material, 8);

    const visitor = new MaterialFlowEventVisitor(
      new MaterialFlowEventBuilder(),
      createContext(),
    );

    // Act

    visitor.visit(node);

    const events = visitor.getEvents();

    // Assert

    expect(events).toHaveLength(1);

    expect(events[0]).toEqual({
      context: 'PRODUCTION',
      originType: 'BOM',
      originId: 'TEST-BOM-VISITOR',
      productId: 'PRODUCT-001',
      materialId: '3001',
      quantity: 8,
      unit: 'кг',
    });
  });

  it('should ignore non-material nodes', () => {
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

    const visitor = new MaterialFlowEventVisitor(
      new MaterialFlowEventBuilder(),
      createContext(),
    );

    // Act

    visitor.visit(node);

    // Assert

    expect(visitor.getEvents()).toHaveLength(0);
  });

  it('should collect events from multiple material nodes', () => {
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

    const visitor = new MaterialFlowEventVisitor(
      new MaterialFlowEventBuilder(),
      createContext(),
    );

    // Act

    visitor.visit(createNode(materialA, 5));
    visitor.visit(createNode(materialB, 3));

    const events = visitor.getEvents();

    // Assert

    expect(events).toHaveLength(2);

    expect(events).toEqual(
      expect.arrayContaining([
        {
          context: 'PRODUCTION',
          originType: 'BOM',
          originId: 'TEST-BOM-VISITOR',
          productId: 'PRODUCT-001',
          materialId: '3001',
          quantity: 5,
          unit: 'кг',
        },
        {
          context: 'PRODUCTION',
          originType: 'BOM',
          originId: 'TEST-BOM-VISITOR',
          productId: 'PRODUCT-001',
          materialId: '3002',
          quantity: 3,
          unit: 'кг',
        },
      ]),
    );
  });

  it('should return a copy of the events collection', () => {
    // Arrange

    const material = createElement({
      id: '3001',
      code: 'R_4_BP-1',
    });

    const visitor = new MaterialFlowEventVisitor(
      new MaterialFlowEventBuilder(),
      createContext(),
    );

    visitor.visit(createNode(material, 8));

    // Act

    const events = visitor.getEvents();

    events.pop();

    // Assert

    expect(visitor.getEvents()).toHaveLength(1);
  });
});
