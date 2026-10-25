import type { AdminBootstrap } from './contracts';
import { requireBuildEnvironment, resolveAdminEnvironment } from './environment-context';
import { adminApplicationStatus } from './authorization';
import { masterSection } from './features/master';
import { manufacturingSection } from './features/manufacturing';
import { administrationSection } from './features/test-reset';

const sections = Object.freeze([masterSection, manufacturingSection, administrationSection]);
/** Request-scoped shell composition; the sole runtime read is the current Script ID. */
export function composeAdminShell(buildEnvironment: unknown, configuration: unknown, scriptId: () => unknown) {
  const environment = requireBuildEnvironment(buildEnvironment);
  function context() {
    let actualScriptId: unknown;
    try { actualScriptId = scriptId(); } catch { /* Never expose a raw runtime exception. */ }
    return resolveAdminEnvironment(environment, configuration, actualScriptId);
  }
  function bootstrap(): AdminBootstrap {
    return Object.freeze({ environment, applicationStatus: adminApplicationStatus(),
      configurationStatus: context().configurationStatus, sections, generationStatus: 'NOT_CONNECTED', resetAllowed: false });
  }
  return Object.freeze({ bootstrap, view() {
    const state = context();
    return Object.freeze({ environmentLabel: `ADMIN ${environment}`, environmentClass: environment === 'TEST' ? 'test' : 'production',
      configurationStatus: state.configurationStatus, switchUrl: state.switchUrl,
      switchLabel: environment === 'TEST' ? 'Перейти до PRODUCTION' : 'Перейти до TEST' });
  } });
}
