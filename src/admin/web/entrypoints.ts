import { BUILD_ENVIRONMENT, BUILD_CONFIGURATION } from './build-target';
import { composeAdminShell } from './composition';

function shell() { return composeAdminShell(BUILD_ENVIRONMENT, BUILD_CONFIGURATION, () => ScriptApp.getScriptId()); }
/** GET parameters are deliberately ignored; they cannot select an environment or a book. */
export function doGet(): GoogleAppsScript.HTML.HtmlOutput {
  const view = shell().view(), template = HtmlService.createTemplateFromFile('Admin');
  Object.assign(template, view);
  return template.evaluate().setTitle(`ERP КУБ — ${view.environmentLabel}`);
}
/** Public static shell state, never a production-resource or user-directory inspection. */
export function getAdminBootstrap() { return shell().bootstrap(); }
