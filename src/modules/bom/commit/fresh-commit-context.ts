/**
 * Path: C:/www/26/03/kub3master-ts/src/modules/bom/commit/fresh-commit-context.ts
 * Module: BOM commit
 * Layer: Infrastructure
 * Responsibility: construct uncached MASTER preparation repositories and immutable validation fingerprints.
 */
import { SheetProvider } from '../../../infrastructure/sheets/SheetProvider';
import { SheetConfig } from '../../../infrastructure/sheets/SheetConfig';
import { SheetKey } from '../../../infrastructure/sheets/SheetKey';
import { SpreadsheetKey } from '../../../infrastructure/spreadsheets/SpreadsheetKey';
import { SpreadsheetProvider } from '../../../infrastructure/spreadsheets/SpreadsheetProvider';
import { GoogleSheetsCatalogDataSource } from '../../../infrastructure/sheets/catalog/GoogleSheetsCatalogDataSource';
import { GoogleSheetsMaterialDataSource } from '../../../infrastructure/sheets/material/GoogleSheetsMaterialDataSource';
import { GoogleSheetsProjectDocumentDependencyDataSource } from '../../../infrastructure/sheets/project-document-dependency/GoogleSheetsProjectDocumentDependencyDataSource';
import { CatalogInMemoryRepository } from '../../catalog/catalog.repository';
import { CatalogHelper } from '../../catalog/catalog.helper';
import { MaterialRepository } from '../../../domain/materials/material.repository';
import { ProjectDocumentDependencyRepository } from '../../../domain/project-document-dependencies/project-document-dependency.repository';
import { mapRowsToProjectDocumentDependencies } from '../../../domain/project-document-dependencies/project-document-dependency.mapper';
import { ProjectDocumentResolver } from '../../../domain/project-document-dependencies/project-document.resolver';
import { mapElementRowToDomain } from '../../elements/element.mapper';
import { normalize, normalizeCode } from '../../../utils/normalize';
import { commitDigest } from './commit-operation-journal';
import { MasterFreshElementStore } from './fresh-element-store';
import type { BOMPreparationDependencies } from '../preparation/bom-preparation.service';
import type { OperationManifest } from './commit-operation.model';
export interface FreshCommitContext { deps: BOMPreparationDependencies; validationContext: NonNullable<OperationManifest['validationContext']> }
class MasterSheets extends SheetProvider {
  get(key: SheetKey): GoogleAppsScript.Spreadsheet.Sheet {
    const definition = SheetConfig[key];
    if (definition.spreadsheet !== SpreadsheetKey.MASTER) throw new Error('Commit requires MASTER');
    const sheet = new SpreadsheetProvider().open(SpreadsheetKey.MASTER).getSheetByName(definition.name);
    if (!sheet) throw new Error(`Missing ${definition.name}`); return sheet;
  }
}
export function freshCommitContext(lock: GoogleAppsScript.Lock.Lock, documentID = ''): FreshCommitContext {
  const store = new MasterFreshElementStore(lock); store.validateWritable();
  const elements = store.read().map(mapElementRowToDomain), sheets = new MasterSheets();
  const catalog = new CatalogInMemoryRepository(new GoogleSheetsCatalogDataSource(sheets).getRows());
  const materials = new MaterialRepository(new GoogleSheetsMaterialDataSource(sheets).getRows());
  const materialRows = materials.getAll();
  if (new Set(materialRows.map(row => row.id)).size !== materialRows.length || new Set(materialRows.map(row => normalizeCode(row.code))).size !== materialRows.length) throw new Error('Ambiguous canonical Materials');
  const docs = new ProjectDocumentResolver(new ProjectDocumentDependencyRepository(mapRowsToProjectDocumentDependencies(new GoogleSheetsProjectDocumentDependencyDataSource(sheets).getRows())));
  const helper = new CatalogHelper(catalog);
  return { deps: { elements: { findByType: type => elements.filter(row => row.type === type) }, materials,
    catalog: { resolveTemplate: prefix => {
      const words = normalize(prefix).split(/\s+/);
      if (catalog.getAll().filter(item => words.includes(normalize(item.typeCode))).length !== 1) throw new Error('Ambiguous Catalog template');
      return helper.resolveTemplate(prefix);
    } }, documents: docs }, validationContext: { catalogDigest: commitDigest(catalog.getAll()), materialsDigest: commitDigest(materialRows), documents: docs.resolve(documentID) } };
}
