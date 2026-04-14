// import { ElementRepository } from '../element.repository';
// import { ElementCacheItem } from '../element.model';

// export class MockElementRepository implements ElementRepository {
//   private items: Map<string, ElementCacheItem> = new Map();
//   private idCounter = 1000;

//   findByCode(code: string): ElementShort | null {
//     return this.items.get(code) || null;
//   }

//   save(element: ElementShort): ElementShort {
//     if (!element.id) {
//       element.id = String(this.idCounter++);
//     }

//     this.items.set(element.code, element);

//     return element;
//   }
// }

import { ElementRepository } from '../element.repository';
import { ElementFull } from '../element.model';

export class MockElementRepository implements ElementRepository {
  private storage = new Map<string, any>();

  findById(id: string): ElementFull | null {
    return this.storage.get(id) || null;
  }
  findByCode(code: string) {
    return this.storage.get(code) || null;
  }

  insert(row: any) {
    console.log('MOCK INSERT:', row);

    this.storage.set(row.code, row);
  }
}
