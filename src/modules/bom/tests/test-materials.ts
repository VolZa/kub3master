import { GoogleSheetsElementRepository } from '../../elements/element.repository';

import { GoogleSheetsMaterialDataSource } from '../../../domain/materials/googleSheetsMaterial.datasource';

import { MaterialRepository } from '../../../domain/materials/material.repository';

import { BOMExplorerService } from '../services/bom-explorer.service';

import { BOMMaterialsService } from '../services/bom-materials.service';

export function testMaterials() {
  const elementRepo = new GoogleSheetsElementRepository();

  const materialDS = new GoogleSheetsMaterialDataSource();

  const materialRepo = new MaterialRepository(materialDS.getRows());

  const explorer = new BOMExplorerService(elementRepo);

  const service = new BOMMaterialsService(explorer, materialRepo);

  const result = service.getMaterialRequirements(
    '2024', // П-1.1
  );

  console.log(JSON.stringify(result, null, 2));
}
