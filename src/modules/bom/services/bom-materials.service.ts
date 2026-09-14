// src/modules/bom/services/bom-materials.service.ts

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
    if (node.element.type === 'part') {
      const materialId = node.element.parentMaterialID;

      if (materialId) {
        const material = this.materialRepo.findById(materialId);

        if (material) {
          const length = Number(node.element.length ?? 0);
          const weightPerMeter = Number(material.weightPerMeter ?? 0);

          const qtyKg = Number(
            (node.totalQty * (length / 1000) * weightPerMeter).toFixed(3),
          );

          const existing = result.get(material.id);

          if (existing) {
            existing.qty += qtyKg;
          } else {
            result.set(material.id, {
              materialId: material.id,
              qty: qtyKg,
              unit: material.baseUnit,
            });
          }
        }
      }
    }

    // ВАЖНО:
    // дітей обходимо завжди, незалежно від того,
    // чи є у поточного вузла parentMaterialID.
    node.children.forEach((child) => {
      this.collectMaterials(child, result);
    });
  }
}
