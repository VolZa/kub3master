import { GoogleSheetsElementRepository } from '../../elements/element.repository';

import { GoogleSheetsMaterialDataSource } from '../../../domain/materials/googleSheetsMaterial.datasource';
import { MaterialRepository } from '../../../domain/materials/material.repository';

import { GoogleSheetsReportColumnDataSource } from '../../../modules/reports/report-column.datasource';
import { mapRowsToReportColumns } from '../mapper/report-column.mapper';
import { ReportColumnRepository } from '../repository/report-column.repository';

import { BOMExplorerService } from '../../bom/services/bom-explorer.service';
import { BOMMaterialsService } from '../../bom/services/bom-materials.service';

import { ProductMatrixService } from '../services/product-matrix.service';
import { normalizeCode } from 'utils/normalize';

export function testProductMatrix() {
  // Elements
  const elementRepo = new GoogleSheetsElementRepository();

  // Materials
  const materialDS = new GoogleSheetsMaterialDataSource();
  const materialRepo = new MaterialRepository(materialDS.getRows());

  // Report columns
  const reportDS = new GoogleSheetsReportColumnDataSource();
  const reportColumns = mapRowsToReportColumns(reportDS.getRows());

  const reportRepo = new ReportColumnRepository(reportColumns);

  // BOM
  const explorer = new BOMExplorerService(elementRepo);

  const materialService = new BOMMaterialsService(explorer, materialRepo);

  // Matrix
  const matrixService = new ProductMatrixService(
    elementRepo,
    materialService,
    materialRepo,
    reportRepo,
  );

  const matrix = matrixService.getProductReportData('2024'); // П-1.1

  console.log(JSON.stringify(matrix, null, 2));
  materialRepo.getAll().forEach((m) => {
    console.log('MATERIAL', m.code, '=>', normalizeCode(m.code));
  });
}
