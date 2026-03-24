import { ElementCacheItem } from '../elements/element.model';

export function mapElementToBOMItem(child: ElementCacheItem) {
  return {
    unit: child.baseUnit,
  };
}
