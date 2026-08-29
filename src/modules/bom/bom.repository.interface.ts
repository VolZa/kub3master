import { BOMRow } from './model/bom-row.model';

export interface BOMRepository {
  getChildrenRows(parentId: string): BOMRow[];
  getParentsRows(childId: string): BOMRow[];
}
