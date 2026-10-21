import { getManufacturingRepository } from './manufacturing.factory';
import { getHouseRepository } from './house.factory';
import { getProjectDocumentRepository } from './project-document.factory';
import { getElementRepository } from './element.factory';
import { getMaterialRepository } from './material.factory';
import { getBOMExpansionService } from './bom-expansion.factory';
import { MaterialConsumptionReportUseCase } from '../../modules/reports/material-consumption/material-consumption-report.use-case';

/** Read composition only. No GAS entrypoint or output writer is registered. */
export function getMaterialConsumptionReportUseCase(): MaterialConsumptionReportUseCase {
  return new MaterialConsumptionReportUseCase({
    manufacturing: getManufacturingRepository(), houses: getHouseRepository(),
    documents: getProjectDocumentRepository(), elements: getElementRepository(),
    materials: getMaterialRepository(), expansion: getBOMExpansionService(),
  });
}
