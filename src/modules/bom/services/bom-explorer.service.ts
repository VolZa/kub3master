//src\modules\bom\services\bom-explorer.service.ts
import { ElementRepository } from '../../elements/element.repository';
import { BOMNode, type BOMEntity } from '../model/bom-node.model';
import { BOMTreeNode } from '../model/bom-tree-node.model';
import { BOMRepository } from '../bom.repository.interface';
import { BOMRow } from '../model/bom-row.model';
import type { MaterialRepository } from '../../../domain/materials/material.repository';

export class BOMExplorerService {
  constructor(
    private readonly elementRepo: ElementRepository,
    private readonly bomRepo: BOMRepository,
    private readonly materialRepo: Pick<MaterialRepository, 'findById'>,
  ) {}

  private resolve(id: string): BOMEntity | null {
    const element = this.elementRepo.findById(id);
    const material = this.materialRepo.findById(id);
    if (element && material) throw new Error(`Ambiguous Element/Material ID: ${id}`);
    if (material) return { ...material, type: 'material' };
    if (element?.type === 'material') throw new Error(`Legacy Material Element is not canonical: ${id}`);
    return element;
  }

  getChildren(parentId: string): BOMNode[] {
    if (this.resolve(parentId)?.type === 'material') return [];
    return this.bomRepo
      .getChildrenRows(parentId)
      .map((bom: BOMRow) => {
        const element = this.resolve(bom.childId);

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
    const element = this.resolve(rootId);

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
    const element = this.resolve(elementId);

    if (!element) {
      throw new Error(`Element not found: ${elementId}`);
    }

    // Canonical Materials are terminal even if malformed outgoing rows exist.
    const childrenRows = element.type === 'material' ? [] : this.getChildren(elementId);
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
