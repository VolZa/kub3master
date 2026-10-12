/**
 * Path: C:/www/26/03/kub3master-ts/src/app/factories/bom-expansion.factory.ts
 * Module: BOM
 * Layer: Application Composition
 * Responsibility: prepare full catalog/BOM snapshots for typed expansion outside the calculation engine.
 */
import { BOMExpansionService } from '../../modules/bom/expansion/bom-expansion.service';
import { getAllBOMRows } from '../../modules/bom/bom.repository';
import { MaterialRepository } from '../../domain/materials/material.repository';
import { GoogleSheetsMaterialDataSource } from '../../infrastructure/sheets/material/GoogleSheetsMaterialDataSource';
import { CatalogHelper } from '../../modules/catalog/catalog.helper';
import { getElementRepository } from './element.factory';
import { getCatalogRepository } from './catalog.factory';
import { sheetProvider } from './infrastructure.factory';

export function getBOMExpansionService(): BOMExpansionService {
  const elements = getElementRepository();
  // Constructor mapping retains inactive Materials; setData() intentionally remains untouched.
  const materials = new MaterialRepository(new GoogleSheetsMaterialDataSource(sheetProvider).getRows());
  return new BOMExpansionService({
    rows: getAllBOMRows(),
    elements: (['product', 'assembly', 'part', 'material'] as const)
      .flatMap((type) => elements.findByType(type)),
    materials: materials.getAll(),
  }, new CatalogHelper(getCatalogRepository()));
}
