import { GoogleSheetsElementRepository } from '../../elements/element.repository';
import { GoogleSheetsBOMRepository } from '../repositories/google-sheets-bom.repository';

import { MaterialRepository } from '../../../domain/materials/material.repository';
import { GoogleSheetsMaterialDataSource } from '../../../infrastructure/sheets/material/GoogleSheetsMaterialDataSource';

import { BOMExplorerService } from '../services/bom-explorer.service';
import { BOMMaterialsService } from '../services/bom-materials.service';

import { sheetProvider } from '../../../app/factories/infrastructure.factory';

export function testP1Materials() {
  const elementRepo = new GoogleSheetsElementRepository();
  const bomRepo = new GoogleSheetsBOMRepository();

  const materialDS = new GoogleSheetsMaterialDataSource(sheetProvider);
  const materialRepo = new MaterialRepository(materialDS.getRows());

  const explorer = new BOMExplorerService(elementRepo, bomRepo);

  const materials = new BOMMaterialsService(explorer, materialRepo);

  const product = elementRepo.findByCode('П-1', '6');

  if (!product) {
    throw new Error('П-1 not found');
  }

  const result = materials.getMaterialRequirements(product.id);

  console.log(JSON.stringify(result, null, 2));

  return result;
}
