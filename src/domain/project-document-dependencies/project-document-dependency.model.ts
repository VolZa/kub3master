// src\domain\project-document-dependencies\project-document-dependency.model.ts
export interface ProjectDocumentDependency {
  id: string;

  projectDocumentID: string;

  dependsOnProjectDocumentID: string;

  priority: number;
}
