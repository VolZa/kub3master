// src/modules/material-consumption/engine/material-consumption.validator.ts

import { BOMTreeNode } from '../../bom/model/bom-tree-node.model';
import {
  CircularBOMError,
  InvalidQuantityError,
} from '../errors/material-consumption.error';

export class MaterialConsumptionValidator {
  validate(node: BOMTreeNode): void {
    this.validateNode(node, new Set<string>());
  }

  private validateNode(node: BOMTreeNode, path: Set<string>): void {
    const elementId = node.element.id;

    if (node.totalQty <= 0) {
      throw new InvalidQuantityError(elementId, node.totalQty);
    }

    if (path.has(elementId)) {
      throw new CircularBOMError(elementId);
    }

    const nextPath = new Set(path);
    nextPath.add(elementId);

    node.children.forEach((child) => {
      this.validateNode(child, nextPath);
    });
  }
}
// import { BOMTreeNode } from '../../bom/model/bom-tree-node.model';
// import {
//   InvalidQuantityError,
//   MissingMaterialError,
// } from '../errors/material-consumption.error';

// export class MaterialConsumptionValidator {
//   validate(node: BOMTreeNode): void {
//     this.validateNode(node);
//   }

//   private validateNode(node: BOMTreeNode): void {
//     if (node.totalQty <= 0) {
//       throw new InvalidQuantityError(node.element.id, node.totalQty);
//     }

//     node.children.forEach((child) => {
//       this.validateNode(child);
//     });
//   }
// }

// export class MaterialConsumptionValidator {
//   validate(node: BOMTreeNode): void {
//     this.validateNode(node);
//   }

//   private validateNode(node: BOMTreeNode): void {
//     const elementId = node.element.id;

//     if (node.totalQty <= 0) {
//       throw new InvalidQuantityError(elementId, node.totalQty);
//     }

//     if (node.element.type === 'material') {
//       this.validateMaterial(node);
//     }

//     node.children.forEach((child) => {
//       this.validateNode(child);
//     });
//   }

//   private validateMaterial(node: BOMTreeNode): void {
//     const materialId = node.element.id;

//     if (!materialId) {
//       throw new MissingMaterialError(materialId);
//     }
//   }
// }
