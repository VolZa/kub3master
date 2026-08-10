// src\domain\project-document-dependencies\project-document-dependency.repository.ts
import { ProjectDocumentDependency } from './project-document-dependency.model';

export class ProjectDocumentDependencyRepository {
  constructor(private readonly items: readonly ProjectDocumentDependency[]) {}

  getAll(): ProjectDocumentDependency[] {
    return [...this.items];
  }

  findByProjectDocumentId(
    projectDocumentID: string,
  ): ProjectDocumentDependency[] {
    return this.items
      .filter((d) => d.projectDocumentID === projectDocumentID)
      .sort((a, b) => a.priority - b.priority);
  }
}
// import { ProjectDocumentDependency } from './project-document-dependency.model';
// export class ProjectDocumentDependencyRepository {
//   constructor(private readonly items: readonly ProjectDocumentDependency[]) {}

//   findByDocument(projectDocumentID: string): ProjectDocumentDependency[] {
//     return this.items
//       .filter((d) => d.projectDocumentID === projectDocumentID)
//       .sort((a, b) => a.priority - b.priority);
//   }
// }
