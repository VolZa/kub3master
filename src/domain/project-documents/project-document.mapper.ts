/**
 * ==========================================================
 * ERP КУБ
 * Module: Projects
 * File: project-document.mapper.ts
 * Path: src\domain\project-documents\project-document.mapper.ts
 *
 * Mapper між ProjectDocumentRow та ProjectDocument.
 * ==========================================================
 */

import { ProjectDocument, ProjectDocumentRow } from './project-document.model';

export function toProjectDocument(row: ProjectDocumentRow): ProjectDocument {
  return {
    id: row.ID,
    code: row.Code,
    name: row.Name,
    projectID: row.ProjectID,
  };
}
