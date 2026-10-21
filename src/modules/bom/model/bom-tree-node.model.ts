// src\modules\bom\model\bom-tree-node.model.ts
import type { BOMEntity } from './bom-node.model';

export interface BOMTreeNode {
  element: BOMEntity;

  qty: number;
  unit: string;

  totalQty: number;
  // totalUnit: string;

  children: BOMTreeNode[];
}
