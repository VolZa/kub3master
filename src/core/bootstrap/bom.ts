// src/core/bootstrap/bom.ts

import { Repositories } from './repositories.model';

import { BOMExplorerService } from '../../modules/bom/services/bom-explorer.service';
import { BOMMaterialsService } from '../../modules/bom/services/bom-materials.service';

export function createBOMServices(repositories: Repositories) {
  const explorer = new BOMExplorerService(repositories.elements);

  const materials = new BOMMaterialsService(explorer, repositories.materials);

  return {
    explorer,

    materials,
  };
}
