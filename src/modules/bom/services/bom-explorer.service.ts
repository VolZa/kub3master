import { ElementRepository } from '../../elements/element.repository';
import { BOMNode } from '../model/bom-node.model';
import { getChildrenRows } from '../bom.repository';
import { BOMTreeNode } from '../model/bom-tree-node.model';

export class BOMExplorerService {
  constructor(private readonly elementRepo: ElementRepository) {}

  getChildren(parentId: string): BOMNode[] {
    return getChildrenRows(parentId)
      .map((bom) => {
        const element = this.elementRepo.findById(bom.childId);

        if (!element) {
          return null;
        }

        return {
          bom,
          element,
        };
      })
      .filter((x): x is BOMNode => x !== null);
  }

  getTree(rootId: string): BOMTreeNode {
    return this.buildNode(rootId, 1, 1);
  }

  private buildNode(
    elementId: string,
    qty: number,
    parentTotalQty: number,
  ): BOMTreeNode {
    const element = this.elementRepo.findById(elementId);

    if (!element) {
      throw new Error(`Element not found: ${elementId}`);
    }

    // const childrenRows = getChildren(elementId);
    const childrenRows = this.getChildren(elementId);

    // const children = childrenRows.map((row) =>
    //   this.buildNode(row.childId, row.qty),
    // );
    // const children = childrenRows.map((node) =>
    //   this.buildNode(node.bom.childId, node.bom.qty),
    // );
    const totalQty = qty * parentTotalQty;
    const children = childrenRows.map((node: BOMNode) =>
      this.buildNode(node.bom.childId, node.bom.qty, totalQty),
    );
    return {
      element,
      qty,
      totalQty,
      children,
    };
  }
}
