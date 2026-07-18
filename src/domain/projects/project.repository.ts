/**
 * ==========================================================
 * ERP КУБ
 * Module: Projects
 * File: project.repository.ts
 * Path: src/domain/projects/project.repository.ts
 *
 * Контракт репозиторію проектів.
 * ==========================================================
 */

import { Project } from './project.model';

export interface IProjectRepository {
  /**
   * Повернути всі проекти.
   */
  findAll(): readonly Readonly<Project>[];

  /**
   * Знайти проект за ID.
   */
  findById(id: string): Readonly<Project> | undefined;

  /**
   * Знайти проект за кодом.
   */
  findByCode(code: string): Readonly<Project> | undefined;
}
