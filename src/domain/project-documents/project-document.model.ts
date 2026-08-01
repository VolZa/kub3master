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

export interface ProjectDocument {
  id: string;
  documentCode: string;
  name: string;
  projectID: string;
}
