// src\modules\bom\repositories\in-memory-bom.repository.ts
import { BOMRepository } from '../bom.repository.interface';
import { BOMRow } from '../model/bom-row.model';

export class InMemoryBOMRepository implements BOMRepository {
  constructor(private readonly rows: readonly BOMRow[]) {}

  getChildrenRows(parentId: string): BOMRow[] {
    return this.rows.filter((row) => row.parentId === String(parentId));
  }

  getParentsRows(childId: string): BOMRow[] {
    return this.rows.filter((row) => row.childId === String(childId));
  }
}
