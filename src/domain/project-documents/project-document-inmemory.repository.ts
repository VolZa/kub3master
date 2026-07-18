/**
 * ==========================================================
 * ERP КУБ
 * Module: Projects
 * File: project-document.model.ts
 * Path: src/domain/project-documents/project-document.model.ts
 *
 * Доменна модель документа проекту.
 * Відповідає таблиці Google Sheets: 19_ProjectDocuments.
 * ==========================================================
 */

import { ProjectDocument, ProjectDocumentRow } from './project-document.model';
import { toProjectDocument } from './project-document.mapper';
import { IProjectDocumentRepository } from './project-document.repository';

export class ProjectDocumentInMemoryRepository implements IProjectDocumentRepository {
  private projectDocuments: ProjectDocument[];

  constructor(rows: ProjectDocumentRow[] = []) {
    this.projectDocuments = rows.map(toProjectDocument);
  }

  findAll(): readonly ProjectDocument[] {
    return this.projectDocuments;
  }

  findById(id: string): Readonly<ProjectDocument> | undefined {
    return this.projectDocuments.find((doc) => doc.id === id);
  }

  findByCode(code: string): Readonly<ProjectDocument> | undefined {
    return this.projectDocuments.find((doc) => doc.code === code);
  }
}
