// src/core/bootstrap/repositories.ts

import { Repositories } from './repositories.model';

import { GoogleSheetsElementRepository } from '../../modules/elements/element.repository';

import { GoogleSheetsMaterialDataSource } from '../../infrastructure/sheets/material/GoogleSheetsMaterialDataSource';
import { MaterialRepository } from '../../domain/materials/material.repository';

import { GoogleSheetsReportLayoutDataSource } from '../../modules/reports/datasource/google-sheets-report-layout.datasource';
import { mapRowsToReportLayout } from '../../modules/reports/mapper/report-layout.mapper';
import { ReportLayoutRepository } from '../../modules/reports/repository/report-layout.repository';

import { GoogleSheetsBOMRepository } from '../../modules/bom/repositories/google-sheets-bom.repository';

import { sheetProvider } from '../../app/factories/infrastructure.factory';

export function createRepositories(): Repositories {
  const elements = new GoogleSheetsElementRepository();

  const bom = new GoogleSheetsBOMRepository();

  const materialDS = new GoogleSheetsMaterialDataSource(sheetProvider);
  const materials = new MaterialRepository(materialDS.getRows());

  const layoutDS = new GoogleSheetsReportLayoutDataSource();

  const reports = {
    layout: new ReportLayoutRepository(
      mapRowsToReportLayout(layoutDS.getRows()),
    ),
  };

  return {
    elements,

    bom,

    materials,

    reports,
  };
}
// src/core/bootstrap/repositories.ts

// import { Repositories } from './repositories.model';

// import { GoogleSheetsElementRepository } from '../../modules/elements/element.repository';

// import { GoogleSheetsMaterialDataSource } from '../../infrastructure/sheets/material/GoogleSheetsMaterialDataSource';
// import { MaterialRepository } from '../../domain/materials/material.repository';

// import { GoogleSheetsReportLayoutDataSource } from '../../modules/reports/datasource/google-sheets-report-layout.datasource';
// import { mapRowsToReportLayout } from '../../modules/reports/mapper/report-layout.mapper';
// import { ReportLayoutRepository } from '../../modules/reports/repository/report-layout.repository';
// import { sheetProvider } from '../../app/factories/infrastructure.factory';
// import { GoogleSheetsBOMRepository } from '../../modules/bom/repositories/google-sheets-bom.repository';

// export function createRepositories(): Repositories {

//   const elements = new GoogleSheetsElementRepository();
//   const bom = new GoogleSheetsBOMRepository();

//   //   const materialDS = new GoogleSheetsMaterialDataSource();
//   const materialDS = new GoogleSheetsMaterialDataSource(sheetProvider);
//   const materials = new MaterialRepository(materialDS.getRows());

//   const layoutDS = new GoogleSheetsReportLayoutDataSource();

//   const reports = {
//     layout: new ReportLayoutRepository(
//       mapRowsToReportLayout(layoutDS.getRows()),
//     ),
//   };

//   return {
//     elements,

//     materials,

//     reports,
//     bom,
//   };
// }
