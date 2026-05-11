// src/domain/materials/googleSheetsMaterial.repository.ts

import { getSheetByNameSafe } from '../../utils/sheets';
import { mapRowsToMaterials } from './material.mapper';
import { MaterialRepository } from './material.repository';

export class GoogleSheetsMaterialRepository extends MaterialRepository {
  constructor() {
    const sheet = getSheetByNameSafe('05_Materials');
    const rows = sheet.getDataRange().getValues();

    const materials = mapRowsToMaterials(rows);

    super([]);
    this.setData(materials);
  }
}
