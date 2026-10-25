# ADMIN Web App — Shell & Target Isolation (Slice 1)

Лише локальна реалізація. ADMIN deployment, PRODUCTION changes і TEST_RESET execution — **NO-GO**.
Metadata inventory збережено окремим commit `d4c3066` — `feat(test-readiness): add source metadata inventory`.
ADMIN shell лишається незакоміченим для review.

## Targets і build

```powershell
npm run build:admin
npm run check:admin
# Або окремо:
npm run build:admin-production
npm run check:admin-production
npm run build:admin-test
npm run check:admin-test
```

Outputs: `build/admin-production/` та `build/admin-test/`, по три файли: `Code.gs`,
`appsscript.json`, `Admin.html`. Новий `build/.gitignore` виключає тільки ці два outputs.
HTML fragments зберігаються у `src/admin/web/html/` і вбудовуються в один Admin.html.
Це навмисна адаптація запропонованої структури: чинний production build копіює
`html/**/*.html`; розміщення ADMIN assets там змінило б production output.
Outputs не лежать під production clasp root `dist`.

Кожен target має окремі `target.json`, manifest і `.clasp.json.example` з різними
placeholder Script IDs. Реальних `.clasp.json`, нових GAS-проєктів і deployment немає.
Manifests не містять webapp/executionApi, dependencies або OAuth scopes з правами доступу:
`oauthScopes: []`. Це не погодження моделі Web identity чи deployment mode.
Чинні manifests, scopes, whitelist, guards і targets не змінені.

## Environment isolation

Build підставляє environment та конфігурацію лише в `build-target.ts`; raw source
unconfigured. Немає Script Property ENV, mutable global switch або browser-selected ID.
У кожному target.json — фіксований environment і однакова пара `scriptIds` /
`environmentUrls`. Зараз усі значення null. Build/checker відхиляє неправильну схему,
однакові IDs/URLs, частково налаштовані IDs, розбіжність конфігурацій і відомі локальні
Script IDs чинних ERP/readiness/editor-admin installations.

Runtime перевіряє `ScriptApp.getScriptId()` проти target pin. Відсутня конфігурація →
NOT_CONFIGURED, некоректна → INVALID, чужий Script ID → SCRIPT_ID_MISMATCH.
Будь-який результат має applicationStatus BLOCKED і resetAllowed false.
CONFIGURED означає тільки збіг target configuration, не авторизацію чи доступ до книг.

Switch — лише server-rendered link до opposite environment URL зі trusted target configuration.
Дозволений точний формат `https://script.google.com/macros/s/<deployment>/exec`, без query,
fragment або /dev. При відмові guard або відсутньому URL switch disabled.
URLs не беруться з request і не повертаються через bootstrap. Наразі обидва switch disabled.

## Boundary і DTO

Рівно два GAS globals: `doGet()` і `getAdminBootstrap()`. GET parameters ігноруються;
bootstrap wrapper відхиляє всі аргументи. Єдиний runtime read — поточний Script ID;
немає Session, OAuth, Script Properties, Sheets, Drive або private resource inspection.

Приклад публічного результату TEST:

```json
{
  "environment": "TEST",
  "applicationStatus": "BLOCKED",
  "configurationStatus": "NOT_CONFIGURED",
  "sections": [
    { "id": "MASTER", "title": "MASTER", "enabled": false },
    { "id": "MANUFACTURING", "title": "Виробництво", "enabled": false },
    { "id": "ADMINISTRATION", "title": "Адміністрування", "enabled": false }
  ],
  "generationStatus": "NOT_CONNECTED",
  "resetAllowed": false
}
```

Sections доступні для локальної навігації; enabled:false означає недоступні бізнес-функції.
MASTER/Manufacturing мають disabled placeholders, TEST_RESET — NOT ENABLED.
Немає imports production factories, security prototypes, readiness/reset services або
TEST runtime resolver. `requireAdminBusinessAccess()` завжди ACCESS_DENIED; він не є RPC.
Підтверджена Web visitor identity і permissions будуть окремим slice.

## Перевірки і подальший порядок

Тести використовують синтетичні Script IDs, URLs і GAS/DOM stubs, без Google network.
Перевіряються unknown/missing config, Script ID mismatch, forged browser parameters,
URL constraints, відсутність business/reset RPC, import allowlist, manifest, HTML і
точні globals. Production/readiness bundles генеруються in-memory до й після ADMIN
build і мають залишатися однаковими.

Нічого не завантажувати. Для наступного slice потрібно окремо погодити Web identity
execution model і live verification plan. Налаштування реальних IDs, URLs, OAuth scopes,
Script Properties, створення GAS projects та deployment не входять у цей slice.
Production writers потребуватимуть окремого рішення про single-writer/locks; TEST runtime
потребуватиме canonical generation owner. TEST_RESET guards залишаються чинними.

## Локальна перевірка Slice 1

Перевірено з Node 22.16.0: TypeScript --noEmit — PASS; build:admin, обидва окремі
build:admin-production/build:admin-test та всі три check:admin scripts — PASS.
Повний Vitest: 61 test files, 1422 tests PASS (46 нових тестів ADMIN shell).
Початкові 58 suites / 1376 tests пройшли до metadata commit.

SHA-256 production/readiness Code.gs, згенерованих in-memory до й після реалізації,
збігаються. Серед 789 початкових файлів змінено тільки package.json, лише scripts.
Нові source/target файли й ADMIN outputs не входять до metadata commit.
Жодного Google network request, push, deployment, Script Properties/Sheets mutation
або TEST_RESET не виконано.

Створені файли (28):

```text
src/admin/web/
  contracts.ts
  build-target.ts
  environment-context.ts
  authorization.ts
  composition.ts
  entrypoints.ts
  admin-shell.test.ts
  admin-build.test.ts
  admin-client.test.ts
  features/master.ts
  features/manufacturing.ts
  features/test-reset.ts
  html/Admin.html
  html/Client.html
  html/Master.html
  html/Manufacturing.html
  html/Administration.html
targets/admin-production/{target.json,appsscript.json,.clasp.json.example}
targets/admin-test/{target.json,appsscript.json,.clasp.json.example}
rollup.admin.config.mjs
scripts/admin-target-contract.cjs
scripts/check-admin-target.cjs
build/.gitignore
docs/ADMIN_WEB_SHELL_SLICE1.md
```
