import { ElementRepository } from '../element.repository';

export class MockElementRepository implements ElementRepository {
  private storage = new Map<string, any>();

  findByCode(code: string) {
    return this.storage.get(code) || null;
  }

  insert(row: any) {
    console.log('MOCK INSERT:', row);

    this.storage.set(row.code, row);
  }
}
