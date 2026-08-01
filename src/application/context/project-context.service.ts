// src/application/context/project-context.service.ts

import { IProjectDocumentRepository } from 'domain/project-documents/project-document.repository';
import { ProjectContext } from './project-context.model';
import { IProjectRepository } from 'domain/projects/project.repository';
import { IHouseRepository } from 'domain/houses/house.repository';
import { ProjectDocument } from 'domain/project-documents/project-document.model';
export class ProjectContextService {
  constructor(
    private readonly houseRepository: IHouseRepository,
    private readonly projectRepository: IProjectRepository,
    private readonly projectDocumentRepository: IProjectDocumentRepository,
  ) {}

  resolve(houseCode: string): ProjectContext {
    // throw new Error('Not implemented.');
    const house = this.houseRepository.findByCode(houseCode);

    if (!house) throw new Error(`House with code ${houseCode} not found`);

    const project = this.projectRepository.findById(house.projectID);

    if (!project)
      throw new Error(`Project with code ${house.projectID} not found`);

    // const projectDocuments = this.projectDocumentRepository.findByProjectID(project.id);

    const projectDocumentsMap = new Map<string, Readonly<ProjectDocument>>();

    return {
      house,
      project,
      projectDocuments: projectDocumentsMap,
    };
  }
}
