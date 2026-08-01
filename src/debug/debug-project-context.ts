/**
 * ==========================================================
 * ERP КУБ
 * Module: Debug
 * File: debug-project-context.ts
 * ==========================================================
 */
import { getProjectContextService } from '../application/context/project-context.factory';

export function debugProjectContext(): void {
  const contextService = getProjectContextService();

  const context = contextService.resolve('H001'); // <-- тимчасово існуючий код будинку

  Logger.log('===== Project Context =====');

  Logger.log(`House: ${context.house.code} (${context.house.name})`);

  Logger.log(`Project: ${context.project.code} (${context.project.name})`);

  Logger.log(`Documents: ${context.projectDocuments.size}`);
}
