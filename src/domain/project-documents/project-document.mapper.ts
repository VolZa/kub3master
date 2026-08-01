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

import { ProjectDocument } from './project-document.model';
import { ProjectDocumentRow } from '../../modules/project-document/project-document.row';

export function toProjectDocument(row: ProjectDocumentRow): ProjectDocument {
  return {
    id: row.ID,
    documentCode: row.DocumentCode,
    name: row.Name,
    projectID: row.ProjectID,
  };
}
