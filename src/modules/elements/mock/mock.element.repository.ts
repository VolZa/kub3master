// import { ElementRepository } from '../element.repository';
// import { ElementShort } from '../element.model';

// export class MockElementRepository implements ElementRepository {
//   private items: Map<string, ElementShort> = new Map();
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
