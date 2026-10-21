import { GoogleSheetsElementRepository } from '../../elements/element.repository';

import { GoogleSheetsMaterialDataSource } from '../../../infrastructure/sheets/material/GoogleSheetsMaterialDataSource';

import { MaterialRepository } from '../../../domain/materials/material.repository';

import { BOMExplorerService } from '../services/bom-explorer.service';

import { BOMMaterialsService } from '../services/bom-materials.service';
import { sheetProvider } from 'app/factories/infrastructure.factory';
import { GoogleSheetsBOMRepository } from '../repositories/google-sheets-bom.repository';

export function testMaterials() {
  const elementRepo = new GoogleSheetsElementRepository();
  const bomRepo = new GoogleSheetsBOMRepository();

  const materialDS = new GoogleSheetsMaterialDataSource(sheetProvider);

  const materialRepo = new MaterialRepository(materialDS.getRows());

  const explorer = new BOMExplorerService(elementRepo, bomRepo, materialRepo);

  const service = new BOMMaterialsService(explorer, materialRepo);

  const result = service.getMaterialRequirements(
    '2024', // П-1.1
  );

  console.log(JSON.stringify(result, null, 2));
}
