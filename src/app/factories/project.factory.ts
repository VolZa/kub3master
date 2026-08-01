/**
 * ==========================================================
 * ERP КУБ
 * Module: Projects
 * File: project.factory.ts
 * Path: src/app/factories/project.factory.ts
 *
 * Factory для створення репозиторію проектів.
 * ==========================================================
 */

import { GoogleSheetsProjectDataSource } from '../../infrastructure/sheets/project/GoogleSheetsProjectDataSource';
import { ProjectInMemoryRepository } from '../../domain/projects/project-inmemory.repository';
import { sheetProvider } from './infrastructure.factory';

let repository: ProjectInMemoryRepository | null = null;

export function getProjectRepository(): ProjectInMemoryRepository {
  if (!repository) {
    const dataSource = new GoogleSheetsProjectDataSource(sheetProvider);
    const rows = dataSource.getRows();
    console.log(`Project rows: ${rows.length}`);

    repository = new ProjectInMemoryRepository(rows);
  }

  return repository;
}
