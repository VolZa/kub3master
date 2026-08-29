// import { ElementRepository } from '../../elements/element.repository';
// import { BOMNode } from '../model/bom-node.model';
// import { getChildrenRows } from '../bom.repository';
// import { BOMTreeNode } from '../model/bom-tree-node.model';

// export class BOMExplorerService {
//   constructor(private readonly elementRepo: ElementRepository) {}

//   getChildren(parentId: string): BOMNode[] {
//     return getChildrenRows(parentId)
//       .map((bom) => {
//         const element = this.elementRepo.findById(bom.childId);

//         if (!element) {
//           return null;
//         }

//         return {
//           bom,
//           element,
//         };
//       })
//       .filter((x): x is BOMNode => x !== null);
//   }
import { ElementRepository } from '../../elements/element.repository';
import { BOMNode } from '../model/bom-node.model';
import { BOMTreeNode } from '../model/bom-tree-node.model';
import { BOMRepository } from '../bom.repository.interface';
import { BOMRow } from '../model/bom-row.model';

export class BOMExplorerService {
  constructor(
    private readonly elementRepo: ElementRepository,
    private readonly bomRepo: BOMRepository,
  ) {}

  getChildren(parentId: string): BOMNode[] {
    return this.bomRepo
      .getChildrenRows(parentId)
      .map((bom: BOMRow) => {
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

  //=============================== ^^це замінено^^

  // решта класу без змін
  getTree(rootId: string): BOMTreeNode {
    const element = this.elementRepo.findById(rootId);

    if (!element) {
      throw new Error(`Element not found: ${rootId}`);
    }

    return this.buildNode(rootId, 1, element.baseUnit, 1);
  }

  private buildNode(
    elementId: string,
    qty: number,
    unit: string,
    parentTotalQty: number,
  ): BOMTreeNode {
    const element = this.elementRepo.findById(elementId);

    if (!element) {
      throw new Error(`Element not found: ${elementId}`);
    }

    const childrenRows = this.getChildren(elementId);
    const totalQty = qty * parentTotalQty;

    const children = childrenRows.map((node: BOMNode) =>
      this.buildNode(node.bom.childId, node.bom.qty, node.bom.unit, totalQty),
    );

    return {
      element,
      qty,
      unit,
      totalQty,
      children,
    };
  }
}
