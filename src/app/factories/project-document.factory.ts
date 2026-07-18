/**
 * ==========================================================
 * ERP КУБ
 * Module: Projects
 * File: project-document.factory.ts
 * Path: src\app\factories\project-document.factory.ts
 *
 * Factory для створення репозиторію документів проектів.
 * ==========================================================
 */

import { GoogleSheetsProjectDocumentDataSource } from 'infrastructure/sheets/project-documents/GoogleSheetsProjectDocumentDataSource';
import { sheetProvider } from './infrastructure.factory';
import { ProjectDocumentInMemoryRepository } from 'domain/project-documents/project-document-inmemory.repository';

let repository: ProjectDocumentInMemoryRepository | null = null;

export function getProjectDocumentRepository(): ProjectDocumentInMemoryRepository {
  if (!repository) {
    const dataSource = new GoogleSheetsProjectDocumentDataSource(sheetProvider);
    const rows = dataSource.getRows();
    console.log(`ProjectDocument rows: ${rows.length}`);

    repository = new ProjectDocumentInMemoryRepository(rows);
  }

  return repository;
}
