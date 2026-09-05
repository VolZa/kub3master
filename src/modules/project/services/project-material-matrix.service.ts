/**
 * ==========================================================
 * ERP КУБ
 * Module: Project
 * File: project-material-matrix.service.ts
 *
 * Побудова матриці матеріалів для всього проекту.
 *
 * Project → Products → BOM → Material Matrix
 * ==========================================================
 */

import { BOMMaterialMatrix } from '../../bom/model/bom-material-matrix.model';
import { BOMMaterialMatrixService } from '../../bom/services/bom-material-matrix.service';
import { ProjectProductsService } from './project-products.service';

export class ProjectMaterialMatrixService {
  constructor(
    private readonly projectProductsService: ProjectProductsService,
    private readonly bomMaterialMatrixService: BOMMaterialMatrixService,
  ) {}

  build(projectId: string): BOMMaterialMatrix {
    const products = this.projectProductsService.getProducts(projectId);

    const matrix = this.bomMaterialMatrixService.build(products);

    return {
      projectId,
      ...matrix,
    };
  }
}
