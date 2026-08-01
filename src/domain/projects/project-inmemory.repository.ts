/**
 * ==========================================================
 * ERP КУБ
 * Module: Projects
 * File: project-inmemory.repository.ts
 * Path: src/domain/projects/project-inmemory.repository.ts
 *
 * In-memory реалізація репозиторію проектів.
 * ==========================================================
 */

import { Project } from './project.model';
import { toProject } from './project.mapper';
import { IProjectRepository } from './project.repository';
import { ProjectRow } from '../../modules/project/project.row';

export class ProjectInMemoryRepository implements IProjectRepository {
  private projects: Project[];

  constructor(rows: readonly ProjectRow[] = []) {
    this.projects = rows.map(toProject);
  }

  findAll(): readonly Project[] {
    return this.projects;
  }

  findById(id: string): Project | undefined {
    return this.projects.find((project) => project.id === id);
  }

  findByCode(code: string): Project | undefined {
    return this.projects.find((project) => project.code === code);
  }
}
