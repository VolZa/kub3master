/**
 * ==========================================================
 * ERP КУБ
 * Module: Projects
 * File: project.model.ts
 * src\domain\projects\project.model.ts
 * Доменна модель проектів.
 * Таблиця Google Sheets: 18_Projects
 * ==========================================================
 */

export interface Project {
  id: string;
  code: string;
  name: string;
}
