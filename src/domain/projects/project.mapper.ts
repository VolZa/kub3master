/** src\domain\projects\project.mapper.ts
 * ==========================================================
 * ERP КУБ
 * Module: Projects
 * File: project.mapper.ts
 * ==========================================================
 */

import { Project, ProjectRow } from './project.model';

export function toProject(row: ProjectRow): Project {
  return {
    id: row.ID,
    code: row.Code,
    name: row.Name,
  };
}
