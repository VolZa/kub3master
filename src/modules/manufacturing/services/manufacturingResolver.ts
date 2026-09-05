import { IHouseRepository } from '../../../domain/houses/house.repository';
import { IProjectDocumentRepository } from '../../../domain/project-documents/project-document.repository';
import { ElementRepository } from '../../elements/element.repository';

import { ManufacturingInput } from '../types/manufacturingInput';
import { ResolvedManufacturing } from '../types/resolvedManufacturing';

export class ManufacturingResolver {
  constructor(
    private readonly houseRepository: IHouseRepository,
    private readonly projectDocumentRepository: IProjectDocumentRepository,
    private readonly elementRepository: ElementRepository,
  ) {}

  public resolve(input: ManufacturingInput): ManufacturingResolution {
    const house = this.houseRepository.findByCode(input.houseCode);

    if (!house) {
      return {
        success: false,
        reason: 'HOUSE_NOT_FOUND',
      };
    }

    const projectId = house.projectID;

    const documents = this.projectDocumentRepository.findByProjectID(projectId);

    if (documents.length === 0) {
      return {
        success: false,
        reason: 'PROJECT_DOCUMENT_NOT_FOUND',
      };
    }

    const projectDocumentIds = documents.map((document) => document.id);

    const product = this.elementRepository.findByCodeInDocuments(
      input.productCode,
      projectDocumentIds,
    );

    if (!product) {
      return {
        success: false,
        reason: 'PRODUCT_NOT_FOUND',
      };
    }
    if (!product.projectDocumentID) {
      return {
        success: false,
        reason: 'PRODUCT_DOCUMENT_NOT_FOUND',
      };
    }

    return {
      success: true,
      value: {
        input,
        house,
        projectId,
        projectDocumentId: product.projectDocumentID,
        productId: product.id,
      },
    };
  }
}

export type ManufacturingResolution =
  | {
      success: true;
      value: ResolvedManufacturing;
    }
  | {
      success: false;
      reason:
        | 'HOUSE_NOT_FOUND'
        | 'PROJECT_DOCUMENT_NOT_FOUND'
        | 'PRODUCT_NOT_FOUND'
        | 'PRODUCT_DOCUMENT_NOT_FOUND';
    };
