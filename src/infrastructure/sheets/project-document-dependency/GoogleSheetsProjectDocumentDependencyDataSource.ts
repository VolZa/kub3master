/**
 * ==========================================================
 * ERP КУБ
 * Module: ProjectDocumentDependency
 * File: GoogleSheetsProjectDocumentDependencyDataSource.ts
 * Path: src\infrastructure\sheets\project-document-dependency\GoogleSheetsProjectDocumentDependencyDataSource.ts
 *
 * DataSource таблиці 21_ProjectDocumentDependencies.
 * ==========================================================
 */
// src\modules\project-document-dependencie\project-document-dependency.row.ts
import { GoogleSheetsDataSource } from '../GoogleSheetsDataSource';
import { SheetKey } from '../SheetKey';
import { SheetProvider } from '../SheetProvider';

import { ProjectDocumentDependencyRow } from '../../../modules/project-document-dependency/project-document-dependency.row';
import { PROJECT_DOCUMENT_HEADERS } from '../../../modules/project-document/project-document.headers';
import { ProjectDocumentRow } from 'modules/project-document/project-document.row';
import { PROJECT_DOCUMENT_DEPENDENCY_HEADERS } from 'modules/project-document-dependency/project-document-dependency.headers';

export class GoogleSheetsProjectDocumentDependencyDataSource extends GoogleSheetsDataSource<ProjectDocumentDependencyRow> {
  constructor(sheetProvider: SheetProvider) {
    super(
      sheetProvider,
      SheetKey.PROJECT_DOCUMENT_DEPENDENCIES,
      PROJECT_DOCUMENT_DEPENDENCY_HEADERS,
    );
  }
}
