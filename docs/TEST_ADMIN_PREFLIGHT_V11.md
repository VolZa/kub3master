> v1.2 Prepare / Review supersedes the earlier admin build surface and TEST Drive scope below. Current workflow, seven private functions and limits: [TEST_RESET v1.2](TEST_RESET_V12_PREPARE_REVIEW.md). Historical stage results remain unchanged.

# TEST_RESET v1.1 — TEST Admin Build and Read-only Preflight

Дата: 2026-10-23. Гілка feature/bom-logic. Лише локальна реалізація; GAS/Drive execution не виконано.

## Що підготовлено

Окремий `rollup.test-admin.config.mjs`, команда `npm run build:test-admin`, вихід **build/test-admin**.
Це не production dist. Build містить Code.gs і окремий appsscript.json, без HTML, Web App,
API executable, UI-меню, тригерів чи production handlers. Manifest V8, exceptionLogging NONE,
openid/userinfo scopes, external_request та тільки Drive/Sheets **read-only** scopes.
`makeCopy`, createFolder, setProperty, Spreadsheet writes і legacy reset class не входять у цей bundle.

Рівно дві top-level manual editor-функції:

- `KUB_TEST_adminIdentity_()` — підтверджена Google identity + TEST UserRepository + USER_MANAGE;
- `KUB_TEST_readOnlyPreflight_()` — та сама авторизація, JSON/source/dependency diagnostics.

Обидві без аргументів; передані аргументи відхиляються MANUAL_ONLY. Trailing underscore ховає функції
від google.script.run. Весь проєкт повинен залишатися undeployed/editor-only: underscore не є
повним захистом від редакторів, API execution або будь-якого іншого trusted server code.
Жодну generic dispatcher функцію не додано.

## Trusted identity й роль

Спочатку перевіряються actual `ScriptApp.getScriptId()`, marker KUB_TEST_INSTALLATION_V1 та відсутність
Web App URL через getService().getUrl(). Production Script ID заборонений явно.
Marker не є доказом identity і не надає роль; project editors залишаються trusted security admins.
getUrl guard не є повним inventory усіх archived/API deployments: окремо перевірити, що новий TEST
проєкт не має жодних deployment/trigger. Не використовувати для цього slice старий робочий GAS-проєкт.

Після context gate береться **server-generated** ScriptApp.getOAuthToken(), надсилається тільки
Bearer header у GET https://openidconnect.googleapis.com/v1/userinfo. HTTPS certificate validation,
redirects заборонені, лише HTTP 200 application/json; неповний/помилковий JSON, відсутній sub/email,
email_verified!=true, неочікуваний issuer якщо присутній, token/fetch errors → ACCESS_DENIED.
Google UserInfo зазвичай не повертає iss; issuer фіксується trusted endpoint як https://accounts.google.com.
Це не локальне декодування JWT, не tokeninfo і не перевірка Google ID token з browser.

Результат — короткочасна runtime-branded UserIdentity (60s), issuer+sub. Email лише валідується
як інформаційне поле, ніколи не є ключем прав. Browser claims/roles не приймаються.
Немає session або token у Properties, URL чи console. Помилки sanitized; exception logging вимкнено.

UserRepository повторно використовує strict parser PropertyUserRepository, але через read-only key mapping
читає **тільки KUB_TEST_USERS_V1**, без fallback на KUB_SECURITY_USERS_V1/production directory.
PermissionService вимагає USER_MANAGE: тільки explicit active ADMIN, не Drive owner або GAS deployer.
Preflight повторно перевіряє identity/поточний User наприкінці перед поверненням результату.

Цей механізм ідентифікує OAuth executor у **manual editor execution**. В owner-backed Web App
той самий OAuth token ідентифікував би deploying owner, тому цей provider НЕ МОЖНА переносити
до ERP visitor authentication. Production AC-002 default-deny не змінено.

## Перелік локальних файлів

Нові:

- rollup.test-admin.config.mjs;
- src/admin/test-reset/admin-identity.ts;
- src/admin/test-reset/admin-preflight.ts;
- src/admin/test-reset/admin-entrypoints.ts;
- src/admin/test-reset/admin-preflight.test.ts;
- src/admin/test-reset/admin-build.test.ts;
- src/admin/test-reset/test-configuration.ts;
- src/admin/test-reset/test-sources.ts;
- src/admin/test-reset/spreadsheet-risk-inspector.ts;
- targets/test-admin/appsscript.json;
- targets/test-admin/.clasp.json.example;
- targets/test-admin/.claspignore;
- scripts/check-test-admin-target.cjs;
- docs/TEST_ADMIN_PREFLIGHT_V11.md.

Змінені: package.json (лише додано build:test-admin), .gitignore (generated build),
src/admin/test-reset/test-reset.ts (спільна schema зі збереженням exports/API),
src/admin/test-reset/gas-test-reset.ts (reuse спільних sources та scanner).
Реальний targets/test-admin/.clasp.json не створено: actual TEST Script ID ще не наданий/перевірений.
Generated build/test-admin/Code.gs та appsscript.json залишилися тільки локально.

## Налаштування Properties — майбутня ручна дія

У фактичному окремому TEST Script Project через Project Settings → Script properties:

```json
KUB_TEST_INSTALLATION_V1:
{"version":1,"environment":"TEST","scriptId":"ACTUAL_TEST_SCRIPT_ID"}
```

```json
KUB_TEST_USERS_V1:
{"version":1,"users":[{"issuer":"https://accounts.google.com","subject":"OWNER_CONFIRMED_GOOGLE_SUB","email":"INFORMATIONAL_OWNER_EMAIL","active":true,"roles":["ADMIN"],"authorizationVersion":1}]}
```

Це шаблони, не створені користувачі. Власник спочатку незалежно підтверджує Google subject і явно
погоджує TEST enrollment. Не підставляти email замість sub, Script ID, вигаданий test user або перший
отриманий visitor account. Обидві діагностики відхиляють невідомий subject; discovery endpoint,
який обходить USER_MANAGE заради первинного enrollment, не реалізований.

Якщо sub ще невідомий: STOP enrollment. Можлива окремо погоджена ручна процедура власника через
офіційний Google OAuth Playground: тільки openid/email/profile identity scopes; вибрати саме потрібний
акаунт, виконати code exchange і UserInfo GET до зазначеного Google endpoint, звірити verified email,
взяти лише sub. Токени/секрети не передавати в чат, repo чи документацію. Не запитувати Drive/Sheets
для цього identity discovery; відкликати тимчасовий Playground доступ після завершення. Це не дія,
яку Codex виконав, і не автоматичне призначення ADMIN.

**KUB_TEST_ENV_V1** залишається канонічним ключем активного середовища. KUB_TEST_ACTIVE_CONFIG
не додається. На першому preflight KUB_TEST_ENV_V1 може бути відсутній: UNINITIALIZED, без запису
порожнього JSON. Наявний JSON перевіряється спільною v1 schema, з actual scriptId і трьома new TEST IDs.
Admin bundle тільки читає конфігурацію; activeConfig USER_MANAGE resolver із v1 не перетворено на
runtime resolver майбутньої TEST Web App. ScriptProperties іншого GAS project автоматично не спільні.

## Що робить preflight

Після context/identity/permission/config gate читає metadata джерел MASTER/OPERATIONAL/REPORTING
із чинного SpreadsheetConfig: MIME, trashed, exact returned ID, Spreadsheet accessibility, очікувані
базові sheets та повний перелік аркушів. До будь-якого copy сканує formulas/values/rich links:
IMPORTRANGE/IMPORT*, URL, production IDs та відомі external functions → EXTERNAL_REFERENCE_RISK.
Наявний сканер винесено у спільний read-only module, не реалізовано другий алгоритм.
Ліміт 250000 cells/book і batch ~4096 cells. Scan limit/API error → SOURCE_INSPECTION_FAILED.
У діагностиці лише sheet names та максимум 20 координат hazards, не cell values/формули.

Production dependency inspector у цьому build чесно повертає externalConnections/boundScripts/triggers
**UNKNOWN**. Bound code, всі owners' installable triggers, connected data та приховані залежності
не можна довести лише поточним Spreadsheet сканером. UNKNOWN не є SAFE і блокує загальний PASS.
Перелік доступних аркушів або порожній список поточних project triggers не заміняє цей audit.
Підміна inspector для PASS у production composition не передбачена; тестові SAFE fixtures існують
лише в unit tests. Fresh candidate evidence прив'язка/контроль змін після inspection — наступний slice.

Status PASS можливий у тесті повної ізольованої композиції, але навіть він має **resetAllowed:false**.
Actual manual production composition очікувано BLOCKED із UNKNOWN до реалізації незалежного inspector.
Це корисний результат діагностики, не помилка, яку потрібно обійти.
Read-only доступ до файлів не доводить write/copy permissions; read-only scopes цього bundle навмисно
не дозволяють makeCopy. Файли з custom formulas/remote data не вважаються sandbox лише через читання;
source sources/automation потрібно враховувати до майбутніх write operations.

## Окремий clasp target і точний порядок запуску

На цьому етапі виконуються ТІЛЬКИ локальні build/tests. Подальші remote кроки нижче — інструкція
для власника **після окремого дозволу на завантаження admin build**, не поточний дозвіл на push.

1. В Apps Script вручну створити новий standalone project ERP_KUB_TEST. Не прив'язувати до spreadsheet,
   не створювати deployment, не додавати triggers. Зафіксувати Script ID із Project Settings.
2. Переконатися, що це не production ID
   1HbCOjFYh21DdVn116JgvHDu-_23seWyTfPd1CDyGHGnKOqq4DSnEknLI. Перевірити доступ редакторів.
3. У репозиторії виконати локально:

```powershell
npm.cmd run build:test-admin
Copy-Item -LiteralPath targets/test-admin/.clasp.json.example -Destination targets/test-admin/.clasp.json
```

4. ВІДРЕДАГУВАТИ тільки targets/test-admin/.clasp.json: вставити actual TEST scriptId,
   rootDir лишити ../../build/test-admin. Не копіювати root production .clasp.json.
   Цільовий .clasp.json і generated build не входять до Git.
5. Локально перевірити target:

```powershell
node scripts/check-test-admin-target.cjs ACTUAL_TEST_SCRIPT_ID
```

   Не продовжувати при BLOCKED. Script перевіряє local file/expected ID/rootDir, не remote ownership.
   У build/test-admin мають бути тільки Code.gs та appsscript.json. Немає HTML або production dist.
6. Перевірити встановлену версію clasp/help. Для clasp із -P/--project використовувати явний окремий
   target із його директорії — це усуває неоднозначність relative rootDir:

```powershell
Push-Location targets/test-admin
clasp -P .clasp.json status
# ЛИШЕ після окремого дозволу на upload:
# clasp -P .clasp.json push
Pop-Location
```

   `status` має показати Code.gs/appsscript.json з TEST build. Не використовувати npm run push,
   production root target, clasp pull, deploy/version або API run. Цих команд Codex не виконував.
7. Після погодженого upload відкрити TEST project у редакторі, звірити Script ID, V8, точний manifest
   і дві top-level functions. При невідомих server files/functions — STOP. Не створювати Web App.
8. Установити installation marker та explicit TEST directory після підтвердження sub, як вище.
   KUB_TEST_ENV_V1 не створювати вручну для імітації успішного reset.
9. У dropdown редактора вибрати `KUB_TEST_adminIdentity_`, натиснути Run. Власник сам проходить Google
   consent для identity + read-only Drive/Sheets. Перевірити PASS + очікуваний issuer/subject.
   Неповний consent/непогоджений account/directory → ACCESS_DENIED; без fallback або автоматичного enrollment.
10. Вибрати `KUB_TEST_readOnlyPreflight_`, Run один раз, зберегти sanitized JSON результату.
    Очікуваний поточний status BLOCKED через UNKNOWN scripts/triggers/connections. Відокремити ці
    blockers від доступності файлів, зовнішніх посилань, missing sheets та config errors.
11. Переконатися, що folder/copies/new KUB_TEST_ENV_V1 не з'явилися. Нічого не активувати, не повторювати
    RESET і не вставляти SAFE вручну. Передати результати на review наступного slice.

Можна вставити перевірені Code.gs/manifest вручну в TEST editor замість clasp upload лише за окремим
дозволом; це теж зміна GAS HEAD. Наявність файлу локально не означає доступність функції в GAS.

## Залишкові blockers — реальний RESET NO-GO

- Prepare/pending generation: не реалізовані; нинішній diagnostic не створює folder/copies.
- Verify/activate candidates: окрема процедура та evidence fingerprints/freshness не реалізовані.
- Незалежний inspector scripts/triggers/external connections: UNKNOWN, не всі залежності доступні.
- TEST-only runtime resolver для всіх repositories/writers і cache invalidation: не реалізований.
  Production SpreadsheetProvider досі production-oriented; копіювати ERP app bundle як TEST не можна.
- Rollback першої generation до UNINITIALIZED: не реалізований; старе v1 rollback потребує previous.
- Cross-file coherent snapshot, config commit uncertainty/recovery, size/time bounds майбутньої activation
  потребують review. ScriptLock не блокує production writers або ручні зміни файлів.
- Реальний TEST project/actor subject/enrollment, Google consent, UserInfo network та file access live
  не перевірені. Editor trust boundary не підміняє AC-002 visitor authentication.
- Майбутні copy/write scopes потребують окремого погодження, цей manifest навмисно read-only.

GO лише для offline review/admin diagnostic preparation. Немає GO для реального RESET, prepare,
activate або TEST Web App deployment. Production v32, production entrypoints, root .clasp.json,
production appsscript.json/rollup config та real Sheets залишаються незмінними.

## Результати локальних перевірок

| Команда/перевірка | Результат |
|---|---|
| TypeScript --noEmit --incremental false | PASS |
| npm run build:test-admin | PASS, лише build/test-admin/Code.gs та appsscript.json |
| npm run build | PASS, production Rollup regression |
| Vitest run, Node.js 22.16.0 | 905/905 PASS, 48 files |
| TEST_RESET/admin subset | 59/59 PASS; початкові 26 v1 mocks збережені |
| TEST-admin actual bundle VM | Дві private functions, без load side effects, writes/copy/production handlers; UNKNOWN blocks |

До/після роботи SHA-256 однакові для production .clasp.json, rollup.config.mjs, appsscript.json,
src/index.ts та gas-production-entrypoints.json. Жодних clasp push/deployment, makeCopy, Google
UserInfo live calls, Drive/Sheets/property writes, Google Cloud змін або Git commit/push.
Локальні тести використовують isolated UserInfo/Drive/Properties/Spreadsheet mocks, не реальні дані.
Тест PASS не підтверджує real actor enrollment, Google consent чи реальний доступ до джерел.

## Джерела

- [Google OIDC UserInfo](https://developers.google.com/identity/openid-connect/openid-connect#obtaininguserprofileinformation).
- [ScriptApp OAuth token](https://developers.google.com/apps-script/reference/script/script-app#getOAuthToken()).
- [UrlFetch request options](https://developers.google.com/apps-script/reference/url-fetch/url-fetch-app).
- [Private underscore functions](https://developers.google.com/apps-script/guides/html/communication#private_functions).
- [Clasp target/config selection](https://github.com/google/clasp/blob/master/docs/config-files.md).
