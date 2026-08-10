// src\domain\project-documents\project-document-resolver.ts
// Саме він знає логіку
import { ProjectDocumentDependencyRepository } from '../project-document-dependencies';
export class ProjectDocumentResolver {
  constructor(
    private readonly repository: ProjectDocumentDependencyRepository,
  ) {}

  resolve(projectDocumentID: string): string[] {
    const result = [projectDocumentID];

    const deps = this.repository.findByProjectDocumentId(projectDocumentID);

    deps.forEach((d) => {
      result.push(d.dependsOnProjectDocumentID);
    });

    return result;
  }
}
