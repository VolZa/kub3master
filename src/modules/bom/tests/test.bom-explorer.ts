// src/modules/bom/tests/testBOMExplorer.ts

import { GoogleSheetsElementRepository } from '../../elements/element.repository';
import { BOMExplorerService } from '../services/bom-explorer.service';

export function testBOMExplorer() {
  const elementRepo = new GoogleSheetsElementRepository();

  const service = new BOMExplorerService(elementRepo);

  const product = elementRepo.findByCode('П-1.1');

  if (!product) {
    throw new Error('П-1.1 not found');
  }

  const result = service.getChildren(product.id);

  //   console.log(JSON.stringify(result, null, 2));
  console.log(
    result.map((x) => ({
      qty: x.bom.qty,
      code: x.element.code,
      type: x.element.type,
    })),
  );

  return result.length;
}

// import { GoogleSheetsElementRepository } from '../../elements/element.repository';
// import { BOMExplorerService } from '../services/bom-explorer.service';

// export function testBOMExplorer() {
//   const elementRepo = new GoogleSheetsElementRepository();

//   const service = new BOMExplorerService(elementRepo);

//   const product = elementRepo.findByCode('П-1.1');

//   if (!product) {
//     throw new Error('П-1.1 not found');
//   }

//   const result = service.getChildren(product.id);

//   console.log(JSON.stringify(result, null, 2));
// }
