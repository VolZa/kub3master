import { getHouseRepository } from '../../app/factories/house.factory';
import { getProjectRepository } from '../../app/factories/project.factory';
import { getProjectDocumentRepository } from '../../app/factories/project-document.factory';
import { ProjectContextService } from './project-context.service';

let instance: ProjectContextService | null = null;

export function getProjectContextService(): ProjectContextService {
  if (!instance) {
    instance = new ProjectContextService(
      getHouseRepository(),
      getProjectRepository(),
      getProjectDocumentRepository(),
    );
  }

  return instance;
}
