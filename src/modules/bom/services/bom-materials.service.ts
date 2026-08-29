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
    // ============================================================
    // 1. MATERIAL
    // Наприклад:
    // 3401 C_20_25 → 3201 C_20_25
    // ============================================================

    if (node.element.type === 'material') {
      const parentMaterialId = node.element.parentMaterialID;

      if (parentMaterialId) {
        const material = this.materialRepo.findById(parentMaterialId);

        if (material) {
          this.addRequirement(
            result,
            material.id,
            node.totalQty,
            material.baseUnit,
          );
        }
      }
    }

    // ============================================================
    // 2. PART
    // Наприклад:
    // 4002 R_6_A500C_L145
    //        ↓
    // 3011 R_6_A500C
    //
    // qty × length × weightPerMeter
    // ============================================================

    if (node.element.type === 'part') {
      const parentMaterialId = node.element.parentMaterialID;

      if (parentMaterialId) {
        const material = this.materialRepo.findById(parentMaterialId);

        if (material) {
          const length = Number(node.element.length ?? 0);
          const weightPerMeter = Number(material.weightPerMeter ?? 0);

          const qtyKg = Number(
            (node.totalQty * (length / 1000) * weightPerMeter).toFixed(3),
          );

          console.log(
            'PART',
            node.element.code,
            'qty=',
            node.totalQty,
            'length=',
            length,
            'wpm=',
            weightPerMeter,
            '→ kg=',
            qtyKg,
          );

          this.addRequirement(result, material.id, qtyKg, 'кг');
        }
      }
    }

    // ============================================================
    // 3. ОБХІД ДЕРЕВА
    // Важливо: children обходимо незалежно від типу поточного вузла.
    // ============================================================

    node.children.forEach((child) => {
      this.collectMaterials(child, result);
    });
  }

  private addRequirement(
    result: Map<string, MaterialRequirement>,
    materialId: string,
    qty: number,
    unit: string,
  ): void {
    const existing = result.get(materialId);

    if (existing) {
      existing.qty = Number((existing.qty + qty).toFixed(3));
    } else {
      result.set(materialId, {
        materialId,
        qty,
        unit,
      });
    }
  }
}
// src\modules\bom\services\bom-materials.service.ts
// import { MaterialRepository } from '../../../domain/materials/material.repository';
// import { BOMTreeNode } from '../model/bom-tree-node.model';
// import { MaterialRequirement } from '../model/material-requirement.model';
// import { BOMExplorerService } from './bom-explorer.service';

// export class BOMMaterialsService {
//   constructor(
//     private readonly bomExplorer: BOMExplorerService,
//     private readonly materialRepo: MaterialRepository,
//   ) {}

//   getMaterialRequirements(rootId: string): MaterialRequirement[] {
//     const tree = this.bomExplorer.getTree(rootId);

//     const result = new Map<string, MaterialRequirement>();

//     this.collectMaterials(tree, result);

//     return [...result.values()];
//   }

//   private collectMaterials(
//     node: BOMTreeNode,
//     result: Map<string, MaterialRequirement>,
//   ): void {
//     if (node.element.type === 'material') {
//       if (!node.element.parentMaterialID) {
//         return;
//       }

//       const material = this.materialRepo.findById(
//         node.element.parentMaterialID,
//       );

//       if (!material) {
//         return;
//       }

//       const existing = result.get(material.id);

//       if (existing) {
//         existing.qty += node.totalQty;
//       } else {
//         result.set(material.id, {
//           materialId: material.id,
//           qty: node.totalQty,
//           unit: node.unit,
//         });
//       }
//     }

//     node.children.forEach((child) => this.collectMaterials(child, result));
//   }
// }
// // export class BOMMaterialsService {
// //   constructor(
// //     private readonly bomExplorer: BOMExplorerService,
// //     private readonly materialRepo: MaterialRepository,
// //   ) {}
// //   getMaterialRequirements(rootId: string): MaterialRequirement[] {
// //     const tree = this.bomExplorer.getTree(rootId);

// //     const result = new Map<string, MaterialRequirement>();

// //     this.collectMaterials(tree, result);

// //     return [...result.values()];
// //   }
// //   private collectMaterials(
// //     node: BOMTreeNode,
// //     result: Map<string, MaterialRequirement>,
// //   ): void {
// //     if (node.element.type === 'material') {
// //       if (!node.element.parentMaterialID) {
// //         return;
// //       }

// //       const material = this.materialRepo.findById(
// //         node.element.parentMaterialID,
// //       );

// //       if (!material) {
// //         return;
// //       }

// //       const existing = result.get(material.id);

// //       if (existing) {
// //         existing.qty += node.totalQty;
// //       } else {
// //         result.set(material.id, {
// //           materialId: material.id,
// //           //?
// //           // materialCode: material.code,
// //           // materialName: material.name,

// //           qty: node.totalQty,

// //           unit: node.element.baseUnit,
// //         });
// //       }
// //     }

// //     if (node.element.type === 'part') {
// //       if (!node.element.parentMaterialID) {
// //         return;
// //       }

// //       const material = this.materialRepo.findById(
// //         node.element.parentMaterialID,
// //       );

// //       if (!material) {
// //         return;
// //       }

// //       const length = Number(node.element.length ?? 0);
// //       const weightPerMeter = Number(material.weightPerMeter ?? 0);

// //       const qtyKg = Number(
// //         (node.totalQty * (length / 1000) * weightPerMeter).toFixed(3),
// //       );

// //       const existing = result.get(material.id);

// //       console.log(
// //         'PART',
// //         node.element.code,
// //         'qty=',
// //         node.totalQty,
// //         'length=',
// //         node.element.length,
// //         'wpm=',
// //         material.weightPerMeter,
// //       );

// //       if (existing) {
// //         existing.qty += qtyKg;
// //       } else {
// //         result.set(material.id, {
// //           materialId: material.id,
// //           // materialCode: material.code,
// //           // materialName: material.name,

// //           qty: qtyKg,

// //           unit: 'кг',
// //         });
// //       }
// //     }
// //     node.children.forEach((child) => this.collectMaterials(child, result));
// //   }
// // }
