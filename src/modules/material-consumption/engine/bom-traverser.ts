// src/modules/material-consumption/engine/bom-traverser.ts

import { BOMTreeNode } from '../../bom/model/bom-tree-node.model';

export interface BOMTraversalVisitor {
  visit(node: BOMTreeNode): void;
}

export class BOMTraverser {
  traverse(root: BOMTreeNode, visitor: BOMTraversalVisitor): void {
    visitor.visit(root);

    root.children.forEach((child) => {
      this.traverse(child, visitor);
    });
  }
}
