// src/core/bootstrap/repositories.ts

import { Repositories } from './repositories.model';

import { GoogleSheetsElementRepository } from '../../modules/elements/element.repository';

import { GoogleSheetsMaterialDataSource } from '../../infrastructure/sheets/materials/GoogleSheetsMaterialDataSource';
import { MaterialRepository } from '../../domain/materials/material.repository';

import { GoogleSheetsReportLayoutDataSource } from '../../modules/reports/datasource/google-sheets-report-layout.datasource';
import { mapRowsToReportLayout } from '../../modules/reports/mapper/report-layout.mapper';
import { ReportLayoutRepository } from '../../modules/reports/repository/report-layout.repository';
import { sheetProvider } from '../../app/factories/infrastructure.factory';

export function createRepositories(): Repositories {
  const elements = new GoogleSheetsElementRepository();

  //   const materialDS = new GoogleSheetsMaterialDataSource();
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

    materials,

    reports,
  };
}
