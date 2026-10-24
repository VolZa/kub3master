# ERP КУБ — GitHub Sync Readiness Audit

Дата: 2026-10-24. Гілка: `feature/bom-logic`. Remote: `github`.
Статус: локальна підготовка перевірена; склад майбутнього commit потребує рішення щодо 5 REVIEW-файлів.
TEST_RESET: **NO-GO**. Цей звіт не надає дозволу на deployment або upload.

## Межі й фактичні зміни цього аудиту

Змінено лише `.gitignore` і створено цей звіт. Production source/configuration, TEST source/configuration,
Script IDs, OAuth scopes, whitelist та Script Properties цим аудитом не змінювались.
Уже наявні локальні зміни з попередніх етапів збережені.

Не виконувались git add/commit/push/fetch, clasp push, deployment, TEST_RESET, зміни Script Properties
або звернення до реальних Google Sheets/Drive. Перевірки збірок і тестів були локальними.
Generated TEST outputs були перезібрані в ігнорованих каталогах. Окремий broker suite використовує
синтетичні ключі/токени та локальні mocks; live Google login не виконувався.

## .gitignore

Додано 4 рядки, жодне чинне правило не видалено:

```gitignore
build/test-runtime/
**/.clasp.json
.clasprc.json
**/.clasprc.json
```

Правила `build/test-admin/`, `build/test-readiness/`, `.clasp.json`, `.env`, `dist/`
і `node_modules/` уже були присутні. Перевірено через `git check-ignore -v --no-index`:
усі три TEST output directories, root/nested clasp credentials/config і .env ігноруються.
Обидва `targets/*/.clasp.json.example` **не ігноруються**.
`git ls-files -ci --exclude-standard` не виявив уже tracked файлів, що підпадають під ignore rules.

## Повний список кандидатів

Після зміни ignore rules: 69 попередніх кандидатів — **64 INCLUDE, 5 REVIEW**.
Цей новий звіт — додатковий **INCLUDE**; отже поточне видиме дерево має 70 кандидатів
(65 INCLUDE і 5 REVIEW). Generated `build/test-runtime/Runtime.gs`, який був видимим на початку,
переведений в EXCLUDE без видалення.

INCLUDE означає, що файл потрібен для збереження розробки й у перевіреному вмісті не виявлено
реальних секретів. Це не означає, що INCLUDE можна комітити окремо від залежних REVIEW-змін.
Повний поточний стан із REVIEW-змінами проходить тести; стан із лише INCLUDE поверх HEAD
не перевірений і не відтворює локальну Role Migration.

| Файл | Git status | Категорія | Підстава |
|---|---|---|---|
| `.gitignore` | MODIFIED | INCLUDE | Захист локальних credentials і generated outputs. |
| `docs/AC_002A_SECURITY_FOUNDATION.md` | MODIFIED | INCLUDE | Документація та історичні звіти; не є експортом секретних Script Properties. |
| `docs/AC_002B_ROLE_MATRIX.md` | MODIFIED | INCLUDE | Документація та історичні звіти; не є експортом секретних Script Properties. |
| `docs/AC_002B1_HANDLER_INTEGRATION.md` | MODIFIED | INCLUDE | Документація та історичні звіти; не є експортом секретних Script Properties. |
| `docs/AC_002B2_IDENTITY_SESSION_DESIGN.md` | MODIFIED | INCLUDE | Документація та історичні звіти; не є експортом секретних Script Properties. |
| `docs/AC_002B3_GOOGLE_IDENTITY_FEASIBILITY.md` | MODIFIED | INCLUDE | Документація та історичні звіти; не є експортом секретних Script Properties. |
| `docs/ROLE_MIGRATION_ADMIN_MANAGER_PLAN.md` | NEW | INCLUDE | Документація та історичні звіти; не є експортом секретних Script Properties. |
| `docs/ROLE_MIGRATION_ADMIN_MANAGER_REPORT.md` | NEW | INCLUDE | Документація та історичні звіти; не є експортом секретних Script Properties. |
| `docs/TEST_ADMIN_PREFLIGHT_V11.md` | NEW | INCLUDE | Документація та історичні звіти; не є експортом секретних Script Properties. |
| `docs/TEST_RESET_V1.md` | NEW | INCLUDE | Документація та історичні звіти; не є експортом секретних Script Properties. |
| `docs/TEST_RESET_V12_PREPARE_REVIEW.md` | NEW | INCLUDE | Документація та історичні звіти; не є експортом секретних Script Properties. |
| `docs/TEST_RESET_V14_ACTIVATE_ROLLBACK.md` | NEW | INCLUDE | Документація та історичні звіти; не є експортом секретних Script Properties. |
| `docs/TEST_RESET_V15A_READINESS_ONLY.md` | NEW | INCLUDE | Документація та історичні звіти; не є експортом секретних Script Properties. |
| `docs/TEST_RUNTIME_V13_ACCESS_INVENTORY.md` | NEW | INCLUDE | Документація та історичні звіти; не є експортом секретних Script Properties. |
| `docs/TEST_RUNTIME_V13.md` | NEW | INCLUDE | Документація та історичні звіти; не є експортом секретних Script Properties. |
| `package.json` | MODIFIED | INCLUDE | TEST build/check scripts; залежності відповідають tracked package-lock.json. |
| `prototype/identity/live-broker/test/security.test.cjs` | MODIFIED | INCLUDE | Regression/security tests; credentials та identity fixtures синтетичні. |
| `rollup.test-admin.config.mjs` | NEW | INCLUDE | Окрема TEST-конфігурація збірки та перевірка import graph/surface. |
| `rollup.test-readiness.config.mjs` | NEW | INCLUDE | Окрема TEST-конфігурація збірки та перевірка import graph/surface. |
| `rollup.test-runtime.config.mjs` | NEW | INCLUDE | Окрема TEST-конфігурація збірки та перевірка import graph/surface. |
| `scripts/check-test-admin-target.cjs` | NEW | INCLUDE | Локальна перевірка TEST target; потрібні локальні .clasp.json. |
| `scripts/check-test-readiness-target.cjs` | NEW | INCLUDE | Локальна перевірка TEST target; потрібні локальні .clasp.json. |
| `src/admin/test-reset/admin-build.test.ts` | NEW | INCLUDE | Regression/security tests; credentials та identity fixtures синтетичні. |
| `src/admin/test-reset/admin-entrypoints.ts` | NEW | INCLUDE | TEST source/adapters/guards; зберігаються як код, реальні адміністративні операції не запускаються. |
| `src/admin/test-reset/admin-identity.ts` | NEW | INCLUDE | TEST source/adapters/guards; зберігаються як код, реальні адміністративні операції не запускаються. |
| `src/admin/test-reset/admin-preflight.test.ts` | NEW | INCLUDE | Regression/security tests; credentials та identity fixtures синтетичні. |
| `src/admin/test-reset/admin-preflight.ts` | NEW | INCLUDE | TEST source/adapters/guards; зберігаються як код, реальні адміністративні операції не запускаються. |
| `src/admin/test-reset/gas-test-reset.ts` | NEW | INCLUDE | TEST source/adapters/guards; зберігаються як код, реальні адміністративні операції не запускаються. |
| `src/admin/test-reset/manual-evidence.ts` | NEW | INCLUDE | TEST source/adapters/guards; зберігаються як код, реальні адміністративні операції не запускаються. |
| `src/admin/test-reset/prepare-review.test.ts` | NEW | INCLUDE | Regression/security tests; credentials та identity fixtures синтетичні. |
| `src/admin/test-reset/prepare-review.ts` | NEW | INCLUDE | TEST source/adapters/guards; зберігаються як код, реальні адміністративні операції не запускаються. |
| `src/admin/test-reset/readiness-build.test.ts` | NEW | INCLUDE | Regression/security tests; credentials та identity fixtures синтетичні. |
| `src/admin/test-reset/readiness-entrypoints.ts` | NEW | INCLUDE | TEST source/adapters/guards; зберігаються як код, реальні адміністративні операції не запускаються. |
| `src/admin/test-reset/readiness-identity.test.ts` | NEW | INCLUDE | Regression/security tests; credentials та identity fixtures синтетичні. |
| `src/admin/test-reset/readiness-sheets-api-probe.test.ts` | NEW | INCLUDE | Regression/security tests; credentials та identity fixtures синтетичні. |
| `src/admin/test-reset/readiness-source-preflight.test.ts` | NEW | INCLUDE | Regression/security tests; credentials та identity fixtures синтетичні. |
| `src/admin/test-reset/readiness-target.ts` | NEW | INCLUDE | Не секретна прив’язка/denylist; потрібна fail-closed перевіркам, значення не змінювались. |
| `src/admin/test-reset/sheets-api-forbidden-diagnostics.test.ts` | NEW | INCLUDE | Regression/security tests; credentials та identity fixtures синтетичні. |
| `src/admin/test-reset/sheets-api-risk-adapter.test.ts` | NEW | INCLUDE | Regression/security tests; credentials та identity fixtures синтетичні. |
| `src/admin/test-reset/sheets-api-risk-adapter.ts` | NEW | INCLUDE | TEST source/adapters/guards; зберігаються як код, реальні адміністративні операції не запускаються. |
| `src/admin/test-reset/spreadsheet-risk-inspector.ts` | NEW | INCLUDE | TEST source/adapters/guards; зберігаються як код, реальні адміністративні операції не запускаються. |
| `src/admin/test-reset/test-configuration.ts` | NEW | INCLUDE | TEST source/adapters/guards; зберігаються як код, реальні адміністративні операції не запускаються. |
| `src/admin/test-reset/test-reset.test.ts` | NEW | INCLUDE | Regression/security tests; credentials та identity fixtures синтетичні. |
| `src/admin/test-reset/test-reset.ts` | NEW | INCLUDE | TEST source/adapters/guards; зберігаються як код, реальні адміністративні операції не запускаються. |
| `src/admin/test-reset/test-sources.ts` | NEW | INCLUDE | Не секретна прив’язка/denylist; потрібна fail-closed перевіркам, значення не змінювались. |
| `src/admin/test-runtime/resolver.ts` | NEW | INCLUDE | Ізольована TEST runtime library; без готового deployment target. |
| `src/admin/test-runtime/runtime.test.ts` | NEW | INCLUDE | Regression/security tests; credentials та identity fixtures синтетичні. |
| `src/admin/test-runtime/runtime.ts` | NEW | INCLUDE | Ізольована TEST runtime library; без готового deployment target. |
| `src/infrastructure/reporting/archive-management.test.ts` | MODIFIED | INCLUDE | Regression/security tests; credentials та identity fixtures синтетичні. |
| `src/infrastructure/spreadsheets/ScopedSpreadsheetRegistry.ts` | NEW | INCLUDE | Спільний клас cache/context isolation, потрібен TEST runtime і зміненому registry. |
| `src/infrastructure/spreadsheets/SpreadsheetRegistry.ts` | MODIFIED | REVIEW | Наявний production wrapper над новим ScopedSpreadsheetRegistry; зберігати узгоджено з новим класом. |
| `src/modules/bom/tests/safe-commit.service.test.ts` | MODIFIED | INCLUDE | Regression/security tests; credentials та identity fixtures синтетичні. |
| `src/security/broker-assertion-prototype.test.ts` | MODIFIED | INCLUDE | Regression/security tests; credentials та identity fixtures синтетичні. |
| `src/security/login-bridge-prototype.test.ts` | MODIFIED | INCLUDE | Regression/security tests; credentials та identity fixtures синтетичні. |
| `src/security/permission-service.ts` | MODIFIED | REVIEW | Наявна міграція production/shared roles і permission grants; узгодити включення разом із залежними TEST-модулями та тестами. |
| `src/security/production-authorization.test.ts` | MODIFIED | INCLUDE | Regression/security tests; credentials та identity fixtures синтетичні. |
| `src/security/production-authorization.ts` | MODIFIED | REVIEW | Наявні зміни production permission mappings і environment; окреме рішення щодо складу commit. |
| `src/security/property-user-repository.ts` | MODIFIED | REVIEW | Наявна зміна production/shared parser ролей; legacy records відхиляються. |
| `src/security/role-migration.test.ts` | NEW | INCLUDE | Regression/security tests; credentials та identity fixtures синтетичні. |
| `src/security/security-foundation.test.ts` | MODIFIED | INCLUDE | Regression/security tests; credentials та identity fixtures синтетичні. |
| `src/security/session-prototype.test.ts` | MODIFIED | INCLUDE | Regression/security tests; credentials та identity fixtures синтетичні. |
| `src/ui/archive-management-web.ts` | MODIFIED | REVIEW | Наявна зміна production archive role policy. |
| `src/ui/bom-commit.api.test.ts` | MODIFIED | INCLUDE | Regression/security tests; credentials та identity fixtures синтетичні. |
| `src/ui/gas-entrypoint-boundary.test.ts` | MODIFIED | INCLUDE | Regression/security tests; credentials та identity fixtures синтетичні. |
| `targets/test-admin/.clasp.json.example` | NEW | INCLUDE | Шаблон із placeholder, без фактичного Script ID. |
| `targets/test-admin/.claspignore` | NEW | INCLUDE | Обмеження складу TEST upload. |
| `targets/test-admin/appsscript.json` | NEW | INCLUDE | Вихідний TEST-маніфест, потрібен для відтворення збірки. |
| `targets/test-readiness/.clasp.json.example` | NEW | INCLUDE | Шаблон із placeholder, без фактичного Script ID. |
| `targets/test-readiness/appsscript.json` | NEW | INCLUDE | Вихідний TEST-маніфест, потрібен для відтворення збірки. |
| `docs/GITHUB_SYNC_READINESS_AUDIT.md` | NEW | INCLUDE | Результат цього аудиту, без секретних значень. |

REVIEW-файли вже були змінені до початку аудиту. Вони беруть участь у production import graph,
тому за обмеження «Production змінювати заборонено» їх не можна мовчки трактувати як TEST-only patch.
Для перенесення повного стану на ноутбук потрібне окреме рішення включити ці наявні зміни у WIP snapshot
разом із залежними тестами/модулями. Збереження у Git саме по собі не виконує deployment.
Їх не відкинуто, не виправлено й не додано до index.

## EXCLUDE — локальні та згенеровані файли

| Шлях / шаблон | Причина |
|---|---|
| `build/test-admin/**` | Generated Code.gs і manifest; відтворюються Rollup |
| `build/test-readiness/**` | Generated Code.gs і manifest; відтворюються Rollup |
| `build/test-runtime/**` | Generated Runtime.gs; відтворюється Rollup |
| `dist/**` | Generated production build, уже ігнорується |
| `node_modules/**`, включно з вкладеним broker | Відтворюються за lockfiles |
| `.clasp.json` | Локальний production target config, не OAuth credential; у Git не включати |
| `targets/test-admin/.clasp.json` | Локальний TEST target config |
| `targets/test-readiness/.clasp.json` | Локальний TEST readiness target config |
| `.clasprc.json`, `**/.clasprc.json` | Локальні OAuth credentials clasp |
| `.env` | Environment secrets/config, якщо з’явиться |

У робочому дереві є три локальні `.clasp.json`; усі ігноруються і не tracked.
Користувацький clasp credential file поза репозиторієм також присутній; його вміст не читався
і не копіювався. Немає підстав переносити його через Git.

## Перевірка секретів і конфіденційності

Повний текст усіх 69 кандидатів перевірено шаблонами Google access/refresh tokens, Google client
secrets/API keys, GitHub tokens, AWS key identifiers, PEM private keys, JWT literals, Bearer literals
і присвоєннями credential/password/secret. Додатково перевірені згадки credentials, операції Script
Properties, email literals, project IDs і локальні абсолютні шляхи.

**Підтверджених секретних значень серед кандидатів не виявлено.** Збіги credential/secret literals
виявилися синтетичними test fixtures. RSA keys генеруються під час тестів. Назви
`KUB_TEST_*` / `KUB_SECURITY_*`, property interfaces і JSON schema не є секретними значеннями.
Документація не містить реального експортованого User directory або секретного snapshot Script Properties.

Script/source IDs є ідентифікаторами конфігурації, а не токенами доступу. Реальні прив’язки є в
`src/admin/test-reset/readiness-target.ts`, `src/admin/test-reset/test-sources.ts`,
`package.json`, target checkers та частині TEST-документації. Вони потрібні чинним safety guards;
їх не змінено й не наведено в цьому звіті. Production spreadsheet IDs уже беруться з tracked
`SpreadsheetConfig.ts`. Видимість GitHub-репозиторію не перевірялась: перед публічним поширенням
потрібно окремо вирішити, чи допустимі ці operational metadata. Аудит не змінює їх автоматично.

Remote `github` налаштований на GitHub; в URL не виявлено HTTPS userinfo/вбудованих credentials.
Аудит охоплює поточних кандидатів, а не історію всіх Git commits або серверний стан GitHub.
Статична перевірка не замінює перевірку правил доступу до репозиторію.

## Відтворюваність TEST

У Git уже є кореневі `package-lock.json`, `tsconfig.json`, `vitest.config.mjs`,
`gas-production-entrypoints.json`, основний Rollup config і nested broker package/lockfile.
Нові sources, tests, scripts, три TEST Rollup configs і обидва вихідні TEST-маніфести входять до
списку вище. Root package dependencies/devDependencies відповідають root lockfile.
166 відносних imports у TS/CJS/MJS кандидатах знайдені серед tracked або рекомендованих до
збереження файлів; відсутніх файлів не виявлено. Це статична перевірка imports, а не запуск clean clone.

| Target | Вихідні файли | Відтворюваний output | Особливості |
|---|---|---|---|
| TEST admin | `rollup.test-admin.config.mjs`, `targets/test-admin/appsscript.json`, admin sources | `build/test-admin/Code.gs` + `appsscript.json` | Окремий адміністративний bundle; містить gated prepare/evidence/activate flows, не підміняти ним readiness |
| TEST readiness | `rollup.test-readiness.config.mjs`, `targets/test-readiness/appsscript.json`, readiness sources | `build/test-readiness/Code.gs` + `appsscript.json` | Чотири ручні wrappers, pinned scopes/whitelist, Sheets v4 dependency, runtime залишається REST |
| TEST runtime | `rollup.test-runtime.config.mjs`, runtime sources | `build/test-runtime/Runtime.gs` | Ізольована library; manifest, deployment target і готовий Web entrypoint навмисно відсутні |

Локальні admin/readiness targets наразі вказують на один TEST-проєкт і відрізняються від production.
Обидва target checker-и перевіряють root production `.clasp.json` як локальний deny-reference.
Без локальних clasp configs target checking на ноутбуці очікувано буде BLOCKED; збірка не потребує OAuth login.

Для відтворення перевіреного середовища використати Node.js **22.16.0** і встановити обидва набори
залежностей (root `npm ci` сам по собі не встановлює nested broker dependencies):

```powershell
npm ci
npm --prefix prototype/identity/live-broker ci
npx tsc --noEmit --incremental false
npm run build:test-admin
npm run build:test-runtime
npm run build:test-readiness
npm test
npm --prefix prototype/identity/live-broker test
```

Після безпечного локального відновлення target configs:

```powershell
node scripts/check-test-admin-target.cjs <ACTUAL_TEST_SCRIPT_ID>
npm run check:test-readiness
```

Placeholder в інструкції замінюється лише локально на фактичний погоджений TEST ID; код, константи,
production ID та scopes для цього не змінюються. Чинний `check:test-readiness` npm script уже містить
pinned TEST ID. Команда `npm run push` у кореневому package виконує production build + clasp push;
до цієї процедури відновлення вона не входить.

## Що відновити локально на ноутбуці

1. Git checkout `feature/bom-logic` із погодженим узгодженим snapshot; GitHub authentication
   налаштувати на ноутбуці окремо. Remote alias `github` у Git config не переноситься файлами репозиторію.
2. Node.js 22.16.0 для повторення перевіреного середовища, root і broker dependencies за lockfiles.
3. Локальний root `.clasp.json` із тим самим production ID тільки для checker deny-reference;
   не виконувати ним upload. Відновити з довіреної локальної конфігурації, не через Git.
4. Створити локальні target `.clasp.json` з відповідних `.example`, відновити погоджений TEST ID,
   зберегти `rootDir` відповідно `../../build/test-admin` і `../../build/test-readiness`.
   Самі example files залишаються placeholders у Git.
5. clasp CLI і його авторизацію відновити окремо лише за потреби майбутніх погоджених remote actions;
   не копіювати refresh/access tokens у репозиторій. Для локальних build/test/checkers clasp login не потрібен.
6. Script Properties, TEST installation marker, ADMIN directory і optional diagnostic sheet property
   зберігаються на стороні існуючого GAS-проєкту та не переносяться Git. Для того самого TEST-проєкту
   повторно їх створювати або змінювати не потрібно; новий GAS-проєкт цим аудитом не налаштовується.
7. `.env`, якщо знадобиться, створюється локально з довіреного джерела; секретні значення не комітяться.

## Результати перевірок

Повторно виконано на Node.js 22.16.0:

| Перевірка | Результат |
|---|---|
| TypeScript `--noEmit --incremental false` | PASS |
| `npm run build:test-admin` | PASS |
| `npm run build:test-runtime` | PASS |
| `npm run build:test-readiness` | PASS |
| TEST admin target checker | PASS |
| TEST readiness target checker | PASS |
| Vitest | **57 files, 1290 tests PASS** |
| Окремий Node broker suite | **15 tests PASS** |
| `git diff --check` | PASS для tracked diff |
| Ignore rules і відсутність tracked ignored files | PASS |

Додаткова whitespace-перевірка untracked кандидатів знайшла лише три навмисні Markdown hard breaks
(два пробіли) в `docs/TEST_RESET_V15A_READINESS_ONLY.md:19-21`. Файл не змінювався.
Після майбутнього staging Git може позначити ці рядки як trailing whitespace; це не секрет або
помилка коду. Merge conflict markers у кандидатах не знайдені. Git попереджає про майбутню LF→CRLF
нормалізацію `package.json` і `SpreadsheetRegistry.ts`; масова зміна line endings не виконувалась.

Index порожній. За локальним cached remote ref HEAD і `github/feature/bom-logic` мають 0/0 divergence.
Fetch не виконувався, тому це не підтвердження поточного стану сервера.

## Готовність до commit

Файли для повного перенесення визначені, generated outputs і credentials виключені, локальні перевірки
пройдені. Безумовний commit усього дерева не підготовлений: залишаються 5 REVIEW production/shared source
змін, щодо яких потрібне рішення про включення наявного WIP стану. Не використовувати INCLUDE як
автоматичний partial staging list: це може втратити узгодженість Role Migration.

Після рішення користувача потрібно явно вибрати узгоджений список файлів, перевірити staged diff/stat/check
і staged secret scan, а вже потім окремо виконувати погоджений commit/push. Поточний index не змінений.
Завдання 5 у вхідному повідомленні обірване після «Після необхід»; це не було трактовано як дозвіл
на Git commit або remote sync. TEST_RESET залишається **NO-GO**, readiness `resetAllowed:false`.

