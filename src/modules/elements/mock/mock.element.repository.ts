import { ElementRepository } from '../element.repository';
import { ElementFull, ElementRow } from '../element.model';
import { mapElementRowToDomain } from '../element.mapper';
import { ElementType } from '../../../config/config';

export class MockElementRepository implements ElementRepository {
  private rows: ElementRow[] = [];

  constructor(initialRows: ElementRow[] = []) {
    this.rows = initialRows;
  }

  // ------------------------
  // FIND BY ID
  // ------------------------
  findById(id: string): ElementFull | null {
    const row = this.rows.find((r) => String(r.ID) === String(id));
    return row ? mapElementRowToDomain(row) : null;
  }

  // ------------------------
  // FIND BY CODE
  // ------------------------
  findByCode(code: string): ElementFull | null {
    const row = this.rows.find((r) => r.Code === code);
    return row ? mapElementRowToDomain(row) : null;
  }

  // ------------------------
  // 🔥 NORMALIZED SEARCH
  // ------------------------
  findByCodeNormalized(code: string): ElementFull | null {
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

    const target = norm(code);

    const row = this.rows.find((r) => norm(r.Code) === target);

    return row ? mapElementRowToDomain(row) : null;
  }

  // ------------------------
  // INSERT
  // ------------------------
  insert(row: ElementRow): void {
    this.rows.push(row);
  }
  updateType(id: string, type: ElementType): void {
    const row = this.rows.find((r) => r.ID === id);
    if (!row) return;

    row.Type = type;
  }
  // ------------------------
  // (опціонально) для дебагу
  // ------------------------
  getAll(): ElementFull[] {
    return this.rows.map((r) => mapElementRowToDomain(r));
  }
}
