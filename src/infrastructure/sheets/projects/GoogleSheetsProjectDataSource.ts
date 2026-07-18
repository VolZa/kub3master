/**
 * ==========================================================
 * ERP КУБ
 * Module: Projects
 * File: GoogleSheetsProjectDataSource.ts
 * Path: src/infrastructure/sheets/projects/GoogleSheetsProjectDataSource.ts
 *
 * Google Sheets DataSource для читання таблиці 18_Projects.
 * ==========================================================
 */

import { GoogleSheetsDataSource } from '../GoogleSheetsDataSource';
import { SheetKey } from '../SheetKey';
import { SheetProvider } from '../SheetProvider';
import { ProjectRow } from 'domain/projects/project.model';

export class GoogleSheetsProjectDataSource extends GoogleSheetsDataSource<ProjectRow> {
  constructor(sheetProvider: SheetProvider) {
    super(sheetProvider, SheetKey.PROJECTS);
  }
}
