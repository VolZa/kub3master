// src/core/bootstrap/bootstrap.ts

import { createRepositories } from './repositories';
import { createBOMServices } from './bom';
import { createReportServices } from './reports';

export function createServices() {
  const repositories = createRepositories();

  const bom = createBOMServices(repositories);

  const reports = createReportServices(repositories, bom);

  return {
    repositories,

    services: {
      bom,

      reports,
    },
  };
}

// // src/core/bootstrap/bootstrap.ts
// import { GoogleSheetsElementRepository } from '../../modules/elements/element.repository';

// import { GoogleSheetsMaterialDataSource } from '../../domain/materials/googleSheetsMaterial.datasource';
// import { MaterialRepository } from '../../domain/materials/material.repository';

// import { GoogleSheetsReportLayoutDataSource } from '../../modules/reports/datasource/google-sheets-report-layout.datasource';
// import { mapRowsToReportLayout } from '../../modules/reports/mapper/report-layout.mapper';
// import { ReportLayoutRepository } from '../../modules/reports/repository/report-layout.repository';

// import { BOMExplorerService } from '../../modules/bom/services/bom-explorer.service';
// import { BOMMaterialsService } from '../../modules/bom/services/bom-materials.service';

// import { ProductReportDataService } from '../../modules/reports/services/product-report-data.service';
// import { SheetReportRowBuilder } from '../../modules/reports/services/sheet-report-row-builder.service';
// import { GoogleSheetsReportWriter } from '../../modules/reports/services/google-sheets-report-writer.service';

// import { Services } from './services.model';
// import { Repositories } from './repositories.model';

// export function createServices(): {
//   repositories: Repositories;
//   services: Services;
// } {
//   //---------------------------------
//   // repositories
//   //---------------------------------

//   const elementRepo = new GoogleSheetsElementRepository();

//   const materialDS = new GoogleSheetsMaterialDataSource();
//   const materialRepo = new MaterialRepository(materialDS.getRows());

//   const layoutDS = new GoogleSheetsReportLayoutDataSource();

//   const layoutRepo = new ReportLayoutRepository(
//     mapRowsToReportLayout(layoutDS.getRows()),
//   );

//   //---------------------------------
//   // services
//   //---------------------------------

//   const bomExplorer = new BOMExplorerService(elementRepo);

//   const bomMaterials = new BOMMaterialsService(bomExplorer, materialRepo);

//   const productReportData = new ProductReportDataService(
//     elementRepo,
//     bomMaterials,
//     materialRepo,
//     layoutRepo,
//   );

//   const reportRowBuilder = new SheetReportRowBuilder(layoutRepo);

//   const reportWriter = new GoogleSheetsReportWriter();

//   //---------------------------------

//   return {
//     repositories: {
//       elements: elementRepo,

//       materials: materialRepo,

//       reports: {
//         layout: layoutRepo,
//       },
//     },

//     services: {
//       bom: {
//         explorer: bomExplorer,

//         materials: bomMaterials,
//       },

//       reports: {
//         productData: productReportData,

//         rowBuilder: reportRowBuilder,

//         writer: reportWriter,
//       },
//     },
//   };
// }

// export function createServices() {
//   //--------------------------------------------------
//   // Repositories
//   //--------------------------------------------------

//   const elementRepo = new GoogleSheetsElementRepository();

//   const materialDS = new GoogleSheetsMaterialDataSource();
//   const materialRepo = new MaterialRepository(materialDS.getRows());

//   const layoutDS = new GoogleSheetsReportLayoutDataSource();
//   const layoutRepo = new ReportLayoutRepository(
//     mapRowsToReportLayout(layoutDS.getRows()),
//   );

//   //--------------------------------------------------
//   // BOM
//   //--------------------------------------------------

//   const bomExplorer = new BOMExplorerService(elementRepo);

//   const bomMaterials = new BOMMaterialsService(bomExplorer, materialRepo);

//   //--------------------------------------------------
//   // Reports
//   //--------------------------------------------------

//   const productReportData = new ProductReportDataService(
//     elementRepo,
//     bomMaterials,
//     materialRepo,
//     layoutRepo,
//   );

//   const reportRowBuilder = new SheetReportRowBuilder(layoutRepo);

//   const reportWriter = new GoogleSheetsReportWriter();

//   //--------------------------------------------------

//   return {
//     // repositories
//     elementRepo,
//     materialRepo,
//     layoutRepo,

//     // bom
//     bomExplorer,
//     bomMaterials,

//     // reports
//     productReportData,
//     reportRowBuilder,
//     reportWriter,
//   };
// }
