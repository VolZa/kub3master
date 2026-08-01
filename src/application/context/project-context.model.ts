/**
 * ==========================================================
 * ERP КУБ
 * Module: Context
 * File: project-context.model.ts
 * Path: src/application/context/project-context.model.ts
 *
 * Робочий контекст ERP.
 * ==========================================================
 */

import { ProjectDocument } from 'domain/project-documents/project-document.model';
import { Project } from 'domain/projects/project.model';
import { House } from 'domain/houses/house.model';

export interface ProjectContext {
  readonly house: Readonly<House>;
  readonly project: Readonly<Project>;

  readonly projectDocuments: ReadonlyMap<string, Readonly<ProjectDocument>>;
}
