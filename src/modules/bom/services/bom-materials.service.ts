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
    if (node.element.type === 'material') {
      const material = this.materialRepo.findById(node.element.id);
      if (!material) throw new Error(`Canonical Material not found: ${node.element.id}`);
      this.addRequirement(result, material.id, node.totalQty, node.unit);
      return;
    }
    if (node.element.type === 'part') {
      const materialId = node.element.parentMaterialID;

      // The explicit edge already supplies consumption for this Part's Material.
      const explicitMaterial = node.children.some(child =>
        child.element.type === 'material' && child.element.id === materialId);
      if (materialId && !explicitMaterial) {
        const material = this.materialRepo.findById(materialId);

        if (material) {
          const length = Number(node.element.length ?? 0);
          const weightPerMeter = Number(material.weightPerMeter ?? 0);

          const qtyKg = Number(
            (node.totalQty * (length / 1000) * weightPerMeter).toFixed(3),
          );

          this.addRequirement(result, material.id, qtyKg, material.baseUnit);
        }
      }
    }

    // ВАЖЛИВО:
    // дітей обходимо завжди, незалежно від того,
    // чи є у поточного вузла parentMaterialID.
    node.children.forEach((child) => {
      this.collectMaterials(child, result);
    });
  }

  private addRequirement(result: Map<string, MaterialRequirement>, materialId: string, qty: number, unit: string): void {
    const existing = result.get(materialId);
    if (existing) {
      if (existing.unit !== unit) throw new Error(`Conflicting units for Material: ${materialId}`);
      existing.qty += qty;
    } else result.set(materialId, { materialId, qty, unit });
  }
}
