import { describe, expect, it } from 'vitest';

import { BOMTreeNode } from '../../bom/model/bom-tree-node.model';
import { ElementFull } from '../../elements/element.model';

import { MaterialConsumptionValidator } from '../engine/material-consumption.validator';
import {
  CircularBOMError,
  InvalidQuantityError,
} from '../errors/material-consumption.error';

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

describe('MaterialConsumptionValidator', () => {
  it('should accept a valid BOM', () => {
    // Arrange

    const material = createElement({
      id: '3001',
      code: 'R_4_BP-1',
      name: 'Арматура ø4 Вр-1',
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

    const root = createNode(assembly, 1, [createNode(material, 5)]);

    const validator = new MaterialConsumptionValidator();

    // Act / Assert

    expect(() => validator.validate(root)).not.toThrow();
  });

  it('should throw InvalidQuantityError for zero quantity', () => {
    // Arrange

    const material = createElement({
      id: '3001',
      code: 'R_4_BP-1',
    });

    const root = createNode(material, 0);

    const validator = new MaterialConsumptionValidator();

    // Act / Assert

    expect(() => validator.validate(root)).toThrow(InvalidQuantityError);
  });

  it('should throw InvalidQuantityError for negative quantity', () => {
    // Arrange

    const material = createElement({
      id: '3001',
      code: 'R_4_BP-1',
    });

    const root = createNode(material, -5);

    const validator = new MaterialConsumptionValidator();

    // Act / Assert

    expect(() => validator.validate(root)).toThrow(InvalidQuantityError);
  });

  it('should throw CircularBOMError for circular BOM', () => {
    // Arrange

    const assemblyA = createElement({
      id: 'ASSEMBLY-A',
      code: 'ASM-A',
      name: 'Збірка A',
      type: 'assembly',
      category: '',
      profileType: undefined,
      baseUnit: '',
    });

    const assemblyB = createElement({
      id: 'ASSEMBLY-B',
      code: 'ASM-B',
      name: 'Збірка B',
      type: 'assembly',
      category: '',
      profileType: undefined,
      baseUnit: '',
    });

    const nodeA: BOMTreeNode = {
      element: assemblyA,
      qty: 1,
      totalQty: 1,
      children: [],
      unit: '',
    };

    const nodeB: BOMTreeNode = {
      element: assemblyB,
      qty: 1,
      totalQty: 1,
      children: [nodeA],
      unit: '',
    };

    // Створюємо цикл:
    //
    // A → B → A

    nodeA.children.push(nodeB);

    const validator = new MaterialConsumptionValidator();

    // Act / Assert

    expect(() => validator.validate(nodeA)).toThrow(CircularBOMError);
  });
});
