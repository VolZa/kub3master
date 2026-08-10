/**
 * ==========================================================
 * ERP КУБ
 * Module: Projects
 * File: project-document-dependency.factory.ts
 * Path: src\app\factories\project-document-dependency.factory.ts
 *
 * Factory для створення репозиторію документів проектів.
 * ==========================================================
 */

import { GoogleSheetsProjectDocumentDependencyDataSource } from 'infrastructure/sheets/project-document-dependency/GoogleSheetsProjectDocumentDependencyDataSource';

import { sheetProvider } from './infrastructure.factory';

import { ProjectDocumentDependencyRepository } from 'domain/project-document-dependencies/project-document-dependency.repository';
import { mapRowsToProjectDocumentDependencies } from 'domain/project-document-dependencies/project-document-dependency.mapper';

let repository: ProjectDocumentDependencyRepository | null = null;

export function getProjectDocumentDependencyRepository(): ProjectDocumentDependencyRepository {
  if (!repository) {
    const dataSource = new GoogleSheetsProjectDocumentDependencyDataSource(
      sheetProvider,
    );
    const rows = dataSource.getRows();
    console.log(`ProjectDocument rows: ${rows.length}`);

    const items = mapRowsToProjectDocumentDependencies(rows);

    repository = new ProjectDocumentDependencyRepository(items);
  }

  return repository;
}
