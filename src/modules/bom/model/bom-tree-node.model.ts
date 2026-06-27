import { ElementFull } from '../../elements/element.model';

export interface BOMTreeNode {
  element: ElementFull;
  qty: number;
  totalQty: number; // накопичена кількість від кореня
  children: BOMTreeNode[];
}
