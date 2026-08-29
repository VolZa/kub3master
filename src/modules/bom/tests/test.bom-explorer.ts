// src/modules/bom/tests/testBOMExplorer.ts

import { GoogleSheetsElementRepository } from '../../elements/element.repository';
import { GoogleSheetsBOMRepository } from '../repositories/google-sheets-bom.repository';
import { BOMExplorerService } from '../services/bom-explorer.service';

export function testBOMExplorer() {
  // const elementRepo = new GoogleSheetsElementRepository();

  // const service = new BOMExplorerService(elementRepo);

  const elementRepo = new GoogleSheetsElementRepository();

  const bomRepo = new GoogleSheetsBOMRepository();

  const service = new BOMExplorerService(elementRepo, bomRepo);

  const product = elementRepo.findByCode('П-1.1', '6'); // Specify the projectDocumentID if needed

  if (!product) {
    throw new Error('П-1.1  6  not found');
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
