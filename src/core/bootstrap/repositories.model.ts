// src/core/bootstrap/repositories.model.ts

import { GoogleSheetsElementRepository } from '../../modules/elements/element.repository';
import { MaterialRepository } from '../../domain/materials/material.repository';
import { ReportLayoutRepository } from '../../modules/reports/repository/report-layout.repository';

export interface Repositories {
  elements: GoogleSheetsElementRepository;

  materials: MaterialRepository;

  reports: {
    layout: ReportLayoutRepository;
  };
}
