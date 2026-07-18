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

export interface ProjectRow {
  ID: string;
  Code: string;
  Name: string;
}

export interface Project {
  id: string;
  code: string;
  name: string;
}
