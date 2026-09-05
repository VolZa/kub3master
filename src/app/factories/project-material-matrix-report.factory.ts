// src/app/factories/project-material-matrix-report.factory.ts

import { getElementRepository } from './element.factory';
import { getBOMRepository } from './bom.factory';
import { getMaterialRepository } from './material.factory';
import { getBOMMatrixColumnsRepository } from './bom-matrix-columns.factory';
import { getProjectDocumentRepository } from './project-document.factory';
import { sheetProvider } from './infrastructure.factory';

import { ProjectProductsService } from '../../modules/project/services/project-products.service';
import { ProjectMaterialMatrixService } from '../../modules/project/services/project-material-matrix.service';
import { ProjectMaterialMatrixReportService } from '../../modules/project/services/project-material-matrix-report.service';

import { BOMExplorerService } from '../../modules/bom/services/bom-explorer.service';
import { BOMMaterialsService } from '../../modules/bom/services/bom-materials.service';
import { BOMMaterialMatrixService } from '../../modules/bom/services/bom-material-matrix.service';

import { ProjectMaterialMatrixWriter } from '../../infrastructure/reporting/project-material-matrix-writer';

export function getProjectMaterialMatrixReportService(): ProjectMaterialMatrixReportService {
  const elementRepository = getElementRepository();
  const bomRepository = getBOMRepository();
  const materialRepository = getMaterialRepository();
  const columnsRepository = getBOMMatrixColumnsRepository();
  const projectDocumentRepository = getProjectDocumentRepository();

  const projectProductsService = new ProjectProductsService(
    projectDocumentRepository,
    elementRepository,
  );

  const bomExplorerService = new BOMExplorerService(
    elementRepository,
    bomRepository,
  );

  const bomMaterialsService = new BOMMaterialsService(
    bomExplorerService,
    materialRepository,
  );

  const bomMaterialMatrixService = new BOMMaterialMatrixService(
    bomMaterialsService,
    columnsRepository,
  );

  const projectMaterialMatrixService = new ProjectMaterialMatrixService(
    projectProductsService,
    bomMaterialMatrixService,
  );

  const writer = new ProjectMaterialMatrixWriter(sheetProvider);

  return new ProjectMaterialMatrixReportService(
    projectMaterialMatrixService,
    writer,
  );
}
