// src/modules/bom/model/bom-material-matrix.model.ts

import { BOMMatrixColumnDefinition } from '../model/bom-matrix-column-definition.model';

export interface BOMMaterialMatrixRow {
  productId: string;
  productCode: string;
  values: Record<string, number>;
}

// export interface BOMMaterialMatrix {
//   columns: BOMMatrixColumnDefinition[];
//   rows: BOMMaterialMatrixRow[];
// }

/**
 * Одна колонка матеріалу в матриці BOM.
 *
 * Колонки формуються динамічно на основі матеріалів,
 * які фактично зустрічаються в BOM виробів проекту.
 */
export interface BOMMatrixColumn {
  materialId: string;
  code: string;
  name: string;
  unit: string;
}

/**
 * Один рядок матриці BOM.
 *
 * Відповідає одному виробу проекту.
 */
export interface BOMMatrixRow {
  productId: string;
  productCode: string;
  projectDocumentId: string;

  /**
   * Ключ — materialId.
   * Значення — розрахована потреба матеріалу.
   */
  values: Record<string, number>;
}

/**
 * Матриця матеріальних потреб BOM проекту.
 *
 * Одна матриця відповідає одному Project.
 */
// export interface BOMMaterialMatrix {
//   projectId: string;

//   columns: BOMMatrixColumn[];

//   rows: BOMMatrixRow[];
// }

export interface BOMMaterialMatrix {
  projectId: string;
  columns: BOMMatrixColumnDefinition[];
  rows: BOMMaterialMatrixRow[];
}
