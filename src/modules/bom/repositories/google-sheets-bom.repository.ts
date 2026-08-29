import { getChildrenRows, getParentsRows } from '../bom.repository';

import { BOMRepository } from '../../bom/bom.repository.interface';
import { BOMRow } from '../model/bom-row.model';

export class GoogleSheetsBOMRepository implements BOMRepository {
  getChildrenRows(parentId: string): BOMRow[] {
    return getChildrenRows(parentId);
  }

  getParentsRows(childId: string): BOMRow[] {
    return getParentsRows(childId);
  }
}
