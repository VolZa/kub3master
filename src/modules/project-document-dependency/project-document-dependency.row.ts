// src\modules\project-document-dependencie\project-document-dependency.row.ts
export interface ProjectDocumentDependencyRow {
  ID: string;

  ProjectDocumentID: string;

  DependsOnProjectDocumentID: string;

  Priority: number;
}
