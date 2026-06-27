import { MaterialRepository } from '../../../domain/materials/material.repository';
import { BOMTreeNode } from '../model/bom-tree-node.model';
import { MaterialRequirement } from '../model/material-requirement.model';
import { BOMExplorerService } from './bom-explorer.service';

export class BOMMaterialsService {
  constructor(
    private readonly bomExplorer: BOMExplorerService,
    private readonly materialRepo: MaterialRepository,
  ) {}
  getMaterialRequirements(rootId: string): MaterialRequirement[] {
    const tree = this.bomExplorer.getTree(rootId);

    const result = new Map<string, MaterialRequirement>();

    this.collectMaterials(tree, result);

    return [...result.values()];
  }
  private collectMaterials(
    node: BOMTreeNode,
    result: Map<string, MaterialRequirement>,
  ): void {
    if (node.element.type === 'material') {
      if (!node.element.parentMaterialID) {
        return;
      }

      const material = this.materialRepo.findById(
        node.element.parentMaterialID,
      );

      if (!material) {
        return;
      }

      const existing = result.get(material.id);

      if (existing) {
        existing.qty += node.totalQty;
      } else {
        result.set(material.id, {
          materialId: material.id,
          //?
          // materialCode: material.code,
          // materialName: material.name,

          qty: node.totalQty,

          unit: node.element.baseUnit,
        });
      }
    }

    if (node.element.type === 'part') {
      if (!node.element.parentMaterialID) {
        return;
      }

      const material = this.materialRepo.findById(
        node.element.parentMaterialID,
      );

      if (!material) {
        return;
      }

      const length = Number(node.element.length ?? 0);

      const weightPerMeter = Number(material.weightPerMeter ?? 0);

      const qtyKg = Number(
        (node.totalQty * (length / 1000) * weightPerMeter).toFixed(3),
      );

      const existing = result.get(material.id);

      console.log(
        'PART',
        node.element.code,
        'qty=',
        node.totalQty,
        'length=',
        node.element.length,
        'wpm=',
        material.weightPerMeter,
      );

      if (existing) {
        existing.qty += qtyKg;
      } else {
        result.set(material.id, {
          materialId: material.id,
          // materialCode: material.code,
          // materialName: material.name,

          qty: qtyKg,

          unit: 'кг',
        });
      }
    }
    node.children.forEach((child) => this.collectMaterials(child, result));
  }
}
