import { ElementShort } from '../elements/element.model';

export function mapElementToBOMItem(child: ElementShort) {
  return {
    unit: child.baseUnit,
  };
}
