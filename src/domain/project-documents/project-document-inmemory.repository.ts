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

import { ProjectDocument } from './project-document.model';
import { toProjectDocument } from './project-document.mapper';
import { IProjectDocumentRepository } from './project-document.repository';
import { ProjectDocumentRow } from '../../modules/project-document/project-document.row';

export class ProjectDocumentInMemoryRepository implements IProjectDocumentRepository {
  private projectDocuments: ProjectDocument[];

  constructor(rows: readonly ProjectDocumentRow[] = []) {
    this.projectDocuments = rows.map(toProjectDocument);
  }

  findAll(): readonly ProjectDocument[] {
    return this.projectDocuments;
  }

  findById(id: string): Readonly<ProjectDocument> | undefined {
    return this.projectDocuments.find((doc) => doc.id === id);
  }

  findByProjectID(projectID: string): readonly Readonly<ProjectDocument>[] {
    return this.projectDocuments.filter((doc) => doc.projectID === projectID);
  }

  findByProjectAndCode(
    projectID: string,
    documentCode: string,
  ): Readonly<ProjectDocument> | undefined {
    return this.projectDocuments.find(
      (doc) => doc.projectID === projectID && doc.documentCode === documentCode,
    );
  }
}
