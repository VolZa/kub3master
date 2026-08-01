/**
 * ==========================================================
 * ERP КУБ
 * Module: Projects
 * File: project-document.repository.ts
 * Path: src\domain\project-documents\project-document.repository.ts
 *
 * Контракт репозиторію документів проекту.
 * ==========================================================
 */

import { ProjectDocument } from './project-document.model';

export interface IProjectDocumentRepository {
  /**
   * Повернути всі документи проекту.
   */
  findAll(): readonly Readonly<ProjectDocument>[];

  /**
   * Знайти документ проекту за ID.
   */
  findById(id: string): Readonly<ProjectDocument> | undefined;

  /**
   * Знайти документ проекту за бізнес-кодом.
   */
  findByProjectAndCode(
    projectID: string,
    documentCode: string,
  ): Readonly<ProjectDocument> | undefined;

  findByProjectID(projectID: string): readonly Readonly<ProjectDocument>[];
}
