/**
 * ==========================================================
 * ERP КУБ
 * Module: Project
 * File: GoogleSheetsProjectDataSource.ts
 * Path: src/infrastructure/sheets/project/GoogleSheetsProjectDataSource.ts
 *
 * Google Sheets DataSource для читання таблиці 18_Projects.
 * ==========================================================
 */

import { GoogleSheetsDataSource } from '../GoogleSheetsDataSource';
import { SheetKey } from '../SheetKey';
import { SheetProvider } from '../SheetProvider';

import { ProjectRow } from '../../../modules/project/project.row';
import { PROJECT_HEADERS } from '../../../modules/project/project.headers';

export class GoogleSheetsProjectDataSource extends GoogleSheetsDataSource<ProjectRow> {
  constructor(sheetProvider: SheetProvider) {
    super(sheetProvider, SheetKey.PROJECTS, PROJECT_HEADERS);
  }
}
