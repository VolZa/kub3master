/**
 * ==========================================================
 * ERP КУБ
 * Module: ProjectDocumentDependencies
 * File: project-document-dependency.mapper.ts
 * Path: src/modules/project-document-dependencie/project-document-dependency.mapper.ts
 *
 * Перетворення між Row та доменною моделлю.
 * ==========================================================
 */

import { ProjectDocumentDependency } from './project-document-dependency.model';
import { ProjectDocumentDependencyRow } from '../../modules/project-document-dependency/project-document-dependency.row';

/**
 * Перетворює рядок таблиці у доменну модель.
 */

export function mapRowToProjectDocumentDependency(
  row: ProjectDocumentDependencyRow,
): ProjectDocumentDependency {
  return {
    id: String(row.ID),
    projectDocumentID: String(row.ProjectDocumentID),
    dependsOnProjectDocumentID: String(row.DependsOnProjectDocumentID),
    priority: Number(row.Priority),
  };
}

/**
 * Перетворює масив рядків у доменні моделі.
 */
export function mapRowsToProjectDocumentDependencies(
  rows: readonly ProjectDocumentDependencyRow[],
): ProjectDocumentDependency[] {
  return rows.map(mapRowToProjectDocumentDependency);
}

/**
 * Перетворює доменну модель у рядок таблиці.
 */
export function mapProjectDocumentDependencyToRow(
  item: ProjectDocumentDependency,
): ProjectDocumentDependencyRow {
  return {
    ID: item.id,

    ProjectDocumentID: item.projectDocumentID,

    DependsOnProjectDocumentID: item.dependsOnProjectDocumentID,

    Priority: item.priority,
  };
}

/**
 * Перетворює масив доменних моделей у рядки таблиці.
 */
export function mapProjectDocumentDependenciesToRows(
  items: readonly ProjectDocumentDependency[],
): ProjectDocumentDependencyRow[] {
  return items.map(mapProjectDocumentDependencyToRow);
}
