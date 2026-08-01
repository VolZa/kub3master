/**
 * ==========================================================
 * ERP КУБ
 * Module: ProjectDocument
 * File: GoogleSheetsProjectDocumentDataSource.ts
 * Path: src\infrastructure\sheets\project-document\GoogleSheetsProjectDocumentDataSource.ts
 *
 * DataSource таблиці 19_ProjectDocuments.
 * ==========================================================
 */

import { GoogleSheetsDataSource } from '../GoogleSheetsDataSource';
import { SheetKey } from '../SheetKey';
import { SheetProvider } from '../SheetProvider';

import { ProjectDocumentRow } from '../../../modules/project-document/project-document.row';
import { PROJECT_DOCUMENT_HEADERS } from '../../../modules/project-document/project-document.headers';

export class GoogleSheetsProjectDocumentDataSource extends GoogleSheetsDataSource<ProjectDocumentRow> {
  constructor(sheetProvider: SheetProvider) {
    super(sheetProvider, SheetKey.PROJECT_DOCUMENTS, PROJECT_DOCUMENT_HEADERS);
  }
}
