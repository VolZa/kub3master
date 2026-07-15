/**
 * ==========================================================
 * ERP КУБ
 * Module: Projects
 * File: project-document.model.ts
 * Path: src/domain/projects/project-document.model.ts
 *
 * Доменна модель документа проекту.
 * Відповідає таблиці Google Sheets: 19_ProjectDocuments.
 * ==========================================================
 */

export interface ProjectDocumentRow {
  ID: string;
  ProjectID: string;
  Code: string;
  Name: string;
}

export interface ProjectDocument {
  id: string;
  projectID: string;
  code: string;
  name: string;
}
