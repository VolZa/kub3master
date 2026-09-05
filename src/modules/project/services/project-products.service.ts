// src\modules\project\services\project-products.service.ts
import { ElementFull } from '../../elements/element.model';
import { ElementRepository } from '../../elements/element.repository';
import { IProjectDocumentRepository } from '../../../domain/project-documents/project-document.repository';

export class ProjectProductsService {
  constructor(
    private readonly projectDocumentRepository: IProjectDocumentRepository,
    private readonly elementRepository: ElementRepository,
  ) {}

  getProducts(projectID: string): ElementFull[] {
    const documents = this.projectDocumentRepository.findByProjectID(projectID);

    const projectDocumentIDs = documents.map((document) => document.id);

    return this.elementRepository.findByTypeInDocuments(
      'product',
      projectDocumentIDs,
    );
  }
}
