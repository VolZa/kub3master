/**
 * ==========================================================
 * ERP КУБ
 * Module: Projects
 * File: project.mapper.ts
 * Path: src/domain/projects/project.mapper.ts
 * ==========================================================
 */

import { Project } from './project.model';
import { ProjectRow } from '../../modules/project/project.row';

export function toProject(row: ProjectRow): Project {
  return {
    id: row.ID,
    code: row.Code,
    name: row.Name,
  };
}
