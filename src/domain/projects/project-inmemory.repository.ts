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

import { Project, ProjectRow } from './project.model';
import { toProject } from './project.mapper';
import { IProjectRepository } from './project.repository';

export class ProjectInMemoryRepository implements IProjectRepository {
  private readonly projects: Project[];

  constructor(rows: ProjectRow[] = []) {
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
