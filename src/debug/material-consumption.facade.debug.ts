// src/debug/material-consumption.facade.debug.ts

import { ElementFull } from '../modules/elements/element.model';
import { BOMTreeNode } from '../modules/bom/model/bom-tree-node.model';
import { MaterialConsumptionFacade } from '../modules/material-consumption/engine/material-consumption.facade';
import { BOMTraverser } from '../modules/material-consumption/engine/bom-traverser';
import { MaterialFlowEventBuilder } from '../modules/material-consumption/engine/material-flow-event.builder';
import { MaterialConsumptionValidator } from '../modules/material-consumption/engine/material-consumption.validator';

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

export function debugMaterialConsumptionFacade(): void {
  console.log('========== MaterialConsumptionFacade TEST =========');

  // --------------------------------------------------
  // Arrange
  // --------------------------------------------------

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

  // --------------------------------------------------
  // Act
  // --------------------------------------------------

  const flow = facade.calculate(root, {
    context: 'PRODUCTION',
    originType: 'BOM',
    originId: 'TEST-BOM-001',
    productId: 'PRODUCT-001',
  });

  // --------------------------------------------------
  // Assert
  // --------------------------------------------------

  if (flow.length !== 1) {
    throw new Error(`Expected 1 MaterialFlowEvent, got ${flow.length}`);
  }

  const event = flow[0];

  if (event.materialId !== '3001') {
    throw new Error(`Expected materialId "3001", got "${event.materialId}"`);
  }

  if (event.quantity !== 12) {
    throw new Error(`Expected quantity 12, got ${event.quantity}`);
  }

  if (event.unit !== 'кг') {
    throw new Error(`Expected unit "кг", got "${event.unit}"`);
  }

  if (event.context !== 'PRODUCTION') {
    throw new Error(`Expected context "PRODUCTION", got "${event.context}"`);
  }

  if (event.originType !== 'BOM') {
    throw new Error(`Expected originType "BOM", got "${event.originType}"`);
  }

  if (event.originId !== 'TEST-BOM-001') {
    throw new Error(
      `Expected originId "TEST-BOM-001", got "${event.originId}"`,
    );
  }

  if (event.productId !== 'PRODUCT-001') {
    throw new Error(
      `Expected productId "PRODUCT-001", got "${event.productId}"`,
    );
  }

  console.log('Material Flow:', JSON.stringify(flow, null, 2));

  console.log('✅ MaterialConsumptionFacade TEST PASSED');
}
// src/debug/material-consumption.facade.debug.ts

// import { ElementFull } from '../modules/elements/element.model';
// import { BOMTreeNode } from '../modules/bom/model/bom-tree-node.model';
// import { MaterialConsumptionFacade } from '../modules/material-consumption/engine/material-consumption.facade';
// import { BOMTraverser } from '../modules/material-consumption/engine/bom-traverser';
// import { MaterialFlowEventBuilder } from '../modules/material-consumption/engine/material-flow-event.builder';
// import { MaterialConsumptionValidator } from '../modules/material-consumption/engine/material-consumption.validator';

// function createElement(overrides: Partial<ElementFull> = {}): ElementFull {
//   return {
//     id: 'TEST-1',
//     code: 'TEST',
//     prefixName: '',
//     name: 'Test element',
//     type: 'material',
//     category: 'rebar',
//     profileType: 'round',
//     baseUnit: 'кг',
//     isActive: true,
//     createdAt: new Date(),
//     ...overrides,
//   };
// }

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

// export function debugMaterialConsumptionFacade(): void {
//   console.log('========== MaterialConsumptionFacade ==========');

//   const material = createElement({
//     id: '3001',
//     code: 'R_4_BP-1',
//     name: 'Арматура ø4 Вр-1',
//     type: 'material',
//     category: 'rebar',
//     profileType: 'round',
//     baseUnit: 'кг',
//   });

//   const root = createNode(material, 12);

//   const facade = new MaterialConsumptionFacade(
//     new MaterialConsumptionValidator(),
//     new BOMTraverser(),
//     new MaterialFlowEventBuilder(),
//   );

//   const flow = facade.calculate(root, {
//     context: 'PRODUCTION',
//     originType: 'BOM',
//     originId: 'TEST-BOM-001',
//     productId: 'PRODUCT-001',
//   });

//   console.log('Material Flow:', JSON.stringify(flow, null, 2));

//   if (flow.length !== 1) {
//     throw new Error(`Expected 1 MaterialFlowEvent, got ${flow.length}`);
//   }

//   const event = flow[0];

//   if (event.materialId !== '3001') {
//     throw new Error(`Expected materialId 3001, got ${event.materialId}`);
//   }

//   if (event.quantity !== 12) {
//     throw new Error(`Expected quantity 12, got ${event.quantity}`);
//   }

//   if (event.unit !== 'кг') {
//     throw new Error(`Expected unit кг, got ${event.unit}`);
//   }

//   console.log('✅ MaterialConsumptionFacade test passed.');
// }
