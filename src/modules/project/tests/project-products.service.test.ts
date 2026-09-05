import { describe, expect, it, vi } from 'vitest';

import { ProjectProductsService } from '../services/project-products.service';
import { IProjectDocumentRepository } from '../../../domain/project-documents/project-document.repository';
import { ElementRepository } from '../../elements/element.repository';
import { ElementFull } from '../../elements/element.model';

describe('ProjectProductsService', () => {
  const products: ElementFull[] = [
    {
      id: '1001',
      code: 'П-1',
      type: 'product',
      projectDocumentID: '6',
    } as ElementFull,

    {
      id: '1002',
      code: 'П-2',
      type: 'product',
      projectDocumentID: '7',
    } as ElementFull,
  ];

  it('returns products belonging to the project documents', () => {
    const projectDocumentRepository = {
      findByProjectID: vi.fn().mockReturnValue([
        {
          id: '6',
          projectID: '1',
          documentCode: 'КР.6',
          name: 'Плити перекриття надколонні',
        },
        {
          id: '7',
          projectID: '1',
          documentCode: 'КР.7',
          name: 'Плити перекриття міжколонні',
        },
      ]),
    } as unknown as IProjectDocumentRepository;

    const elementRepository = {
      findByTypeInDocuments: vi.fn().mockReturnValue(products),
    } as unknown as ElementRepository;

    const service = new ProjectProductsService(
      projectDocumentRepository,
      elementRepository,
    );

    const result = service.getProducts('1');

    expect(result).toEqual(products);

    expect(projectDocumentRepository.findByProjectID).toHaveBeenCalledWith('1');

    expect(elementRepository.findByTypeInDocuments).toHaveBeenCalledWith(
      'product',
      ['6', '7'],
    );
  });

  it('returns empty array when project has no documents', () => {
    const projectDocumentRepository = {
      findByProjectID: vi.fn().mockReturnValue([]),
    } as unknown as IProjectDocumentRepository;

    const elementRepository = {
      findByTypeInDocuments: vi.fn().mockReturnValue([]),
    } as unknown as ElementRepository;

    const service = new ProjectProductsService(
      projectDocumentRepository,
      elementRepository,
    );

    const result = service.getProducts('999');

    expect(result).toEqual([]);

    expect(elementRepository.findByTypeInDocuments).toHaveBeenCalledWith(
      'product',
      [],
    );
  });

  it('uses only documents returned for the requested project', () => {
    const projectDocumentRepository = {
      findByProjectID: vi.fn().mockReturnValue([
        {
          id: '12',
          projectID: '2',
          documentCode: 'КР.9',
          name: 'тестовий документ',
        },
        {
          id: '13',
          projectID: '2',
          documentCode: 'КР.3',
          name: 'тестовий документ',
        },
      ]),
    } as unknown as IProjectDocumentRepository;

    const elementRepository = {
      findByTypeInDocuments: vi.fn().mockReturnValue([]),
    } as unknown as ElementRepository;

    const service = new ProjectProductsService(
      projectDocumentRepository,
      elementRepository,
    );

    service.getProducts('2');

    expect(elementRepository.findByTypeInDocuments).toHaveBeenCalledWith(
      'product',
      ['12', '13'],
    );
  });

  it('does not perform any project-specific filtering itself', () => {
    const projectDocumentRepository = {
      findByProjectID: vi.fn().mockReturnValue([
        {
          id: '6',
          projectID: '1',
          documentCode: 'КР.6',
          name: 'Плити',
        },
      ]),
    } as unknown as IProjectDocumentRepository;

    const elementRepository = {
      findByTypeInDocuments: vi.fn().mockReturnValue(products),
    } as unknown as ElementRepository;

    const service = new ProjectProductsService(
      projectDocumentRepository,
      elementRepository,
    );

    const result = service.getProducts('1');

    expect(result).toBe(products);
  });
});
