/**
 * ==========================================================
 * ERP КУБ
 * Module: Projects
 * File: GoogleSheetsProjectDocumentDataSource.ts
 * Path: src\infrastructure\sheets\project-documents\GoogleSheetsProjectDocumentDataSource.ts
 *
 * DataSource таблиці 19_ProjectDocuments.
 * ==========================================================
 */

import { GoogleSheetsDataSource } from '../GoogleSheetsDataSource';
import { SheetKey } from '../SheetKey';
import { SheetProvider } from '../SheetProvider';
import { ProjectDocumentRow } from 'domain/project-documents/project-document.model';

export class GoogleSheetsProjectDocumentDataSource extends GoogleSheetsDataSource<ProjectDocumentRow> {
  constructor(sheetProvider: SheetProvider) {
    super(sheetProvider, SheetKey.PROJECT_DOCUMENTS);
  }
}
