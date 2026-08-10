/**
 * ==========================================================
 * ERP КУБ
 * Module: ProjectDocumentDependencies
 * File: project-document-dependency.resolver.ts
 * Path: src\modules\project-document-dependency\project-document-dependency.resolver.ts
 *
 * Визначає перелік документів, у яких необхідно шукати елементи.
 * ==========================================================
 */
import { ProjectDocumentDependencyRepository } from '../../domain/project-document-dependencies/project-document-dependency.repository';

export class ProjectDocumentResolver {
  constructor(
    private readonly repository: ProjectDocumentDependencyRepository,
  ) {}

  resolve(projectDocumentID: string): string[] {
    const result = new Set<string>();

    result.add(projectDocumentID);

    const dependencies =
      this.repository.findByProjectDocumentId(projectDocumentID);

    for (const dependency of dependencies) {
      result.add(dependency.dependsOnProjectDocumentID);
    }

    return [...result];
  }
}

// import { ProjectDocumentDependencyRepository } from '../../domain/project-document-dependencies/project-document-dependency.repository';

// export class ProjectDocumentResolver {
//   constructor(
//     private readonly repository: ProjectDocumentDependencyRepository,
//   ) {}

//   /**
//    * Повертає список ProjectDocumentID,
//    * у яких потрібно виконувати пошук.
//    *
//    * Першим завжди повертається сам документ,
//    * далі — його залежності у порядку Priority.
//    */
//   resolve(projectDocumentID: string): string[] {
//     // const result = [projectDocumentID];
//     const result = new Set<string>();
//     result.add(projectDocumentID);

//     for (const dependency of dependencies) {
//       result.add(dependency.dependsOnProjectDocumentID);
//     }

//     return [...result];

//   }
// }
