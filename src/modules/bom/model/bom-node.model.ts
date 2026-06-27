import { BOMRow } from './bom-row.model';
import { ElementFull } from '../../elements/element.model';

export interface BOMNode {
  bom: BOMRow;
  element: ElementFull;
}
