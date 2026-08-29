import { GoogleSheetsElementRepository } from '../../elements/element.repository';

import { BOMExplorerService } from '../services/bom-explorer.service';
import { BOMMaterialsService } from '../services/bom-materials.service';
import { ProductionRequirementService } from '../services/production-requirement.service';

import { GoogleSheetsMaterialDataSource } from '../../../infrastructure/sheets/material/GoogleSheetsMaterialDataSource';
import { MaterialRepository } from '../../../domain/materials/material.repository';
import { sheetProvider } from '../../../app/factories/infrastructure.factory';
import { GoogleSheetsBOMRepository } from '../repositories/google-sheets-bom.repository';

export function testProductionRequirement() {
  const elementRepo = new GoogleSheetsElementRepository();
  const bomRepo = new GoogleSheetsBOMRepository();

  const materialDS = new GoogleSheetsMaterialDataSource(sheetProvider);
  const materialRepo = new MaterialRepository(materialDS.getRows());

  const bomExplorer = new BOMExplorerService(elementRepo, bomRepo);

  const bomMaterials = new BOMMaterialsService(bomExplorer, materialRepo);

  const service = new ProductionRequirementService(bomMaterials);

  const result = service.calculate([
    {
      productId: '2024', // П-1.1
      qty: 10,
    },
  ]);

  console.log(JSON.stringify(result, null, 2));
}
