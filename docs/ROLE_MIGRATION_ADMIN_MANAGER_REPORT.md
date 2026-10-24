# ROLE Migration — ADMIN / MANAGER

Дата: 2026-10-23. Гілка feature/bom-logic. Статус: LOCAL_IMPLEMENTATION_PASS / RESET_NO-GO.

Рівно дві canonical roles: ADMIN та MANAGER. Немає reserved TECHNOLOGIST або legacy aliases.
Старі ERP_OWNER/WORKSHOP_MANAGER/TECHNOLOGIST значення, зокрема у змішаному масиві з ADMIN,
відхиляються strict parser і PermissionService. Посади директора/начальника цеху — одна роль MANAGER.

ADMIN має всі 20 явно визначених permissions. Невідомий permission/невідоме середовище/недоведена
або прострочена identity/невідомий чи inactive User — ACCESS_DENIED навіть для ADMIN.
MANAGER у PRODUCTION має шість report permissions і одинадцять конкретних manufacturing/planning
permissions. У TEST MANAGER не має жодного permission. USER_MANAGE/BOM_EDIT/TECHNOLOGY_EDIT —
тільки ADMIN. Адміністративний TEST контекст явно передає environment=TEST у PermissionService.
Середовище задає trusted composition, не browser. Production identity adapter залишається default-deny.

Повна актуальна матриця з existing service method mappings: [AC_002B_ROLE_MATRIX.md](AC_002B_ROLE_MATRIX.md).
Це permission vocabulary/grants, а не ввімкнення внутрішніх сервісів як RPC. Business code не змінено.
createManufacturingFromWeb і onEdit залишилися null policy holds для обох ролей. Лише три existing
Manufacturing lookup wrappers отримали точний MANUFACTURING_VIEW замість REPORT_VIEW; обидві canonical
ролі мають цей permission у PRODUCTION. Немає нового handler/public RPC або автоматичного write-enable.

## Змінені файли

Security:

- src/security/permission-service.ts — canonical roles, explicit permission constants, TEST environment gate,
  strict runtime role validation, unknown permissions deny.
- src/security/property-user-repository.ts — reuse canonical isRole, без alias.
- src/security/production-authorization.ts — environment passthrough та три lookup permissions; holds unchanged.
- src/security/role-migration.test.ts — нові незалежні migration/security tests.
- src/security/production-authorization.test.ts;
- src/security/security-foundation.test.ts;
- src/security/session-prototype.test.ts;
- src/security/broker-assertion-prototype.test.ts;
- src/security/login-bridge-prototype.test.ts — canonical fixtures/negative legacy tests.

TEST та UI fixtures/policies:

- src/admin/test-reset/admin-preflight.ts — explicit TEST environment.
- src/admin/test-reset/admin-preflight.test.ts;
- src/admin/test-reset/admin-build.test.ts;
- src/admin/test-reset/test-reset.test.ts;
- src/admin/test-reset/gas-test-reset.ts — terminology comment only.
- src/ui/archive-management-web.ts — canonical role validation in isolated role policy;
  production archive handlers продовжують використовувати PermissionService.
- src/infrastructure/reporting/archive-management.test.ts;
- src/ui/bom-commit.api.test.ts;
- src/ui/gas-entrypoint-boundary.test.ts;
- src/modules/bom/tests/safe-commit.service.test.ts;
- prototype/identity/live-broker/test/security.test.cjs — browser-role tampering fixture now uses ADMIN;
  broker assertions still do not carry grants.

Документація:

- docs/AC_002B_ROLE_MATRIX.md — актуальна матриця.
- docs/TEST_ADMIN_PREFLIGHT_V11.md — актуальний ADMIN enrollment/template, старий test result лишився історичним.
- docs/ROLE_MIGRATION_ADMIN_MANAGER_REPORT.md — цей звіт.
- docs/ROLE_MIGRATION_ADMIN_MANAGER_PLAN.md — додано посилання на реалізацію; текст плану збережено як snapshot.
- docs/TEST_RESET_V1.md, AC_002A_SECURITY_FOUNDATION.md, AC_002B1_HANDLER_INTEGRATION.md,
  AC_002B2_IDENTITY_SESSION_DESIGN.md, AC_002B3_GOOGLE_IDENTITY_FEASIBILITY.md — додано лише historical-role
  annotation з посиланням на актуальну матрицю; старі результати/текст не переписані.

## Перевірки

| Перевірка | Результат |
|---|---|
| TypeScript --noEmit --incremental false | PASS |
| npm run build | PASS |
| npm run build:test-admin | PASS |
| Повний Vitest, Node.js 22.16.0 | 922/922 PASS, 49 files |
| Цільовий security/admin/archive regression | 164/164 PASS |
| Окремий Node.js broker suite, RSA fixtures/local HTTP mocks | 15/15 PASS, без Google login |

Додано 13 migration tests та чотири додаткові legacy-вектори у TEST fixtures. Перевірено grants для
ADMIN у двох environments, усі 20 TEST denials для MANAGER, explicit operational/report grants,
legacy/mixed roles, unknown/inactive/revoked/expired identities, unknown permission/environment,
USER_MANAGE і TEST Script ID передумови, held wrappers та production default-deny.
Existing B1–B4.2 та TEST_RESET mock regressions збережені; business quantity expectations не змінено.
VM тести перевіряють actual Rollup bundles: 20 production wrappers без TEST admin APIs; дві private
TEST editor diagnostics без makeCopy/write/production handlers, dependency UNKNOWN не підмінено на SAFE.

Production .clasp.json, rollup.config.mjs, appsscript.json, src/index.ts та gas-production-entrypoints.json
мають ті самі SHA-256, що до міграції. Жодних live API, clasp push/deployment, Google Sheets/Drive/реальних
UserRepository assignments або Git commit/push не виконано. Web App v32 не змінено.

## Залишкові блокери

1. До майбутнього upload потрібно явно перевизначити погоджені real issuer+subject records у ADMIN/MANAGER,
   узгодити schema/code rollout, збільшити authorizationVersion і відкликати попередні сесії/tickets.
   Цей slice НЕ мігрує реальних користувачів. Legacy records тепер fail closed; тимчасовий deny — очікуваний.
2. Production verified identity/session integration не працює live; default provider лишається undefined.
3. Manufacturing write/trigger holds та integration явних operational permissions у майбутні handlers
   потребують окремого slice. PLAN domain services не означають готовий Planning UI/RPC.
4. Реальні TEST actor enrollment/Script ID/consent/UserInfo/source access ще не перевірено.
5. Prepare/pending candidates, trusted script/trigger/connection evidence, activate, TEST-only runtime resolver
   і rollback першої generation лишаються нереалізованими. TEST-admin bundle навмисно read-only.
6. Майбутній TEST runtime повинен явно pin environment=TEST; default PRODUCTION не можна використовувати
   як fallback. ADMIN не обходить TEST marker/Script ID, safety/lock/config/generation guards.

GO лише для локального review міграції. Немає GO для real TEST_RESET, production publication чи
автоматичної зміни real User roles.
