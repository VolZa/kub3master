// src\modules\bom\model\bom-tree-node.model.ts
import { ElementFull } from '../../elements/element.model';

export interface BOMTreeNode {
  element: ElementFull;

  qty: number;
  unit: string;

  totalQty: number;
  // totalUnit: string;

  children: BOMTreeNode[];
}
