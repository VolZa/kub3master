# ERP КУБ — Audit Slice №1H.4A

Read-only Pre-deployment Audit — Local Code and Configuration. Дата: 2026-10-14.

## 1. Executive summary

**NOT READY для контрольованого deploy у поточній конфігурації.** Локальний Safe Commit має authorization boundary, строгі payload contracts та legacy quarantine. Проте identity у USER_DEPLOYING не гарантована для editor rollout; ANYONE разом із публічними manufacturing write/test/migration handlers створює широку mutation surface. Реальні deployments, MASTER schema/protections і protected journal write access не перевірено.

Аудит не виконував remote clasp, GAS functions, Google Sheets/Drive API, npm install/audit/fix, commit/push або deploy. Єдиний створений файл — цей звіт. Код, manifest, Rollup, тести та MIGRATION-VERIFICATION.md не змінено. Публічну документацію Google читали для перевірки platform semantics; до production API не зверталися.

### Git та локальна перевірка

- Репозиторій D:/w/26/03/kub3master; HEAD **246d715f50bf37e6833b2b2906083d041da90ee5**; branch **feature/bom-logic**; початковий status чистий.
- Ownership Git відрізняється від sandbox user. Використано process-local `git -c safe.directory=D:/w/26/03/kub3master`; global config не змінювався. AGENTS.md у репозиторії та перевірених батьківських каталогах не знайдено.
- Системний Node v10.15.3 не запускає Vitest; використано bundled Node v24.19.0: `node_modules/vitest/vitest.mjs run --no-cache --configLoader native`. Стандартний config loader намагався створити .vite-temp і отримав EPERM; native loader дозволив завершити перевірку без такого запису.
- **536 passed / 3 failed**, 29 suites (26 passed, 3 failed), 22.67 s. Baseline відтворено. Відомі failures: src/modules/bom/tests/bom-material-matrix.integration.test.ts:741; src/modules/material-consumption/tests/bom-materials.service.test.ts:653; src/modules/project/tests/project-material-matrix.integration.test.ts:866. Усі про очікуваний Material 3201; ті самі failures описані у docs/dds/SAFE-COMMIT-UI-CUTOVER-1H3F.md:86.
- Rollup(config) + bundle.generate(config.output) + close() виконано **у пам'яті**, без bundle.write(). Generated Code.gs побайтово збігається з dist/Code.gs; root manifest побайтово збігається з dist/appsscript.json. npm run build не запускався, бо записує dist; підтверджена Rollup частина, не весь cpy pipeline. Dist відповідає поточному чистому HEAD за відтвореним output.
- git diff --check пройшов; після аудиту очікується тільки untracked цей звіт.

## 2. Фактична GAS configuration

appsscript.json: timeZone Europe/Kyiv, dependencies {}, exceptionLogging STACKDRIVER, runtimeVersion V8, webapp.executeAs USER_DEPLOYING, webapp.access ANYONE. oauthScopes не задано: це автоматичне визначення scopes, не відсутність OAuth permissions. executionApi конфігурації немає. doGet у src/ui/webApp.ts:23 відкриває Manufacturing. BOM openForm/openFormTable у src/ui/openForm.ts — template sidebar.

За [Google manifest reference](https://developers.google.com/apps-script/manifest/web-app-api-executable), ANYONE — будь-який logged-in user; anonymous доступ — окремий ANYONE_ANONYMOUS. USER_DEPLOYING виконує під повноваженнями deployer. Локальний manifest не підтверджує конфігурацію вже опублікованих версій.

За [Session reference](https://developers.google.com/apps-script/reference/base/session), active email може бути порожнім у execute-as-developer web app; для самого developer та same Workspace domain обмеження загалом можуть не застосовуватися. USER_DEPLOYING не є доказом identity відвідувача. Не замінювати getActiveUser() на getEffectiveUser(): deployer email не доводить authorization кінцевого користувача.

| Користувач | Доведено кодом | GAS acceptance requirement |
|---|---|---|
| MASTER owner | Непорожній email рівний owner дозволено | MASTER owner не обов'язково deployer; перевірити identity/scopes |
| Прямий editor | Email у getEditors дозволено | External/consumer user може мати empty email і бути відхиленим |
| Без доступу / viewer | Email не в списку або empty — denial | Webapp доступ ширший за MASTER ACL; інші RPC не мають BOM authorization |
| Anonymous | Empty email відхиляється | Поточний ANYONE потребує login; старі deployment settings невідомі |
| Google Group editor | Перевіряється персональний email, group membership не розгортається | Не гарантовано getEditors містить індивідуального group member; потрібна окрема перевірка |

[Drive File reference](https://developers.google.com/apps-script/reference/drive/file) обмежує getAccess для Google Group/inherited group permissions: заміна на getAccess не є доведеним fix. getEditors також залежить від повноважень виконавця. Scopes для перевірки: userinfo.email, Drive readonly/Drive для ACL, spreadsheets для cross-file access, container UI/script APIs за фактичними calls. Точний inferred remote scope set невідомий.

## 3. Safe Commit authorization

src/ui/bom-commit.api.ts:10 authorize(): ActiveUser email trim/lowercase; reject empty; DriveApp.getFileById(SpreadsheetConfig.MASTER.id); owner + editors; exact lowercase email match. Немає client email, active spreadsheet або effective deployer identity як заміни.

submitBOM авторизується до service call; дозволено лише operationID/projectDocumentID/parentInput/specification з type/length validation. Internal PreparedBOM/rows/bindings/receipts/scope клієнт не задає. resumeBOM авторизується незалежно до resumeBOMCommit. **Знання OperationID не замінює ACL.** File-level policy дозволяє будь-якому authorized editor resume чужої операції; per-user ownership не реалізовано і має бути архітектурно прийнято.

runTableParser делегує submitBOM із явними document/ID. buildBOMFromText авторизується, перевіряє object contract і делегує submitBOM; old payload без context/ID відхиляється. Обхід через ці compatibility entrypoints не знайдено. authorize поза try, тому auth/Drive exception йде у failureHandler, а не завжди structured VALIDATION_ERROR.

Докази: src/ui/bom-commit.api.test.ts перевіряє owner/editor/empty/viewer, unauthorized resume, обидва adapters, internal fields rejection, legacy guard/reset. src/ui/gas-entrypoint-boundary.test.ts будує Rollup bundle, аналізує top-level AST, виконує VM з mocks та перевіряє internal globals absent. Обидва suites пройшли. Це local mock evidence, не production identity evidence.

### Protected journal

src/modules/bom/commit/commit-operation-journal.ts:55–85 guard перевіряє ScriptLock/schema, appendRecord використовує appendRow + flush + readback. safe-bom-writer.ts має окремий writer journal у тому самому six-column sheet. Код не створює missing journal, не знімає protections і не перевіряє protection.canEdit до durable append. fresh-element-store.validateWritable перевіряє schema, не permission.

За USER_DEPLOYING запис виконує deployer: owner/allowed protection editor може записати, навіть якщо caller не може напряму редагувати journal; заборонений deployer отримує write failure. За USER_ACCESSING caller потребує edit permission також на journal/counters/Elements/BOM. MASTER file editor status недостатній для protected range. [Protection reference](https://developers.google.com/apps-script/reference/spreadsheet/protection) описує окремі edit permissions. Права та recovery після protection failure потребують acceptance.

Мінімальна рекомендація: перший owner-only controlled acceptance із MYSELF; для editor rollout розглянути USER_ACCESSING та DOMAIN, якщо всі у Workspace, або authenticated access із явною ACL для external users. Узгодити journal protection і manufacturing RPC. Якщо journal має бути недоступним редакторам, USER_ACCESSING сам не розв'язує задачу: потрібен trusted writer із verified identity. Нічого не реалізовано.

## 4. Повний public GAS surface

src/core/register.ts зберігає callbacks у globalThis.__kubGasHandlers_; rollup.config.mjs gasEntrypoints AST читає register object у src/index.ts і генерує wrappers. Основний код у IIFE; treeshake false не відкриває всі internal functions. Dist wrappers починаються на 13468. Повний перелік declarations:

```textonOpen
onEdit
openFormTable
openForm
includeBOMCommitClient_
submitBOM
resumeBOM
doGet
createManufacturingFromWeb
getManufacturingHouseOptions
getManufacturingProductOptions
getManufacturingPlacementOptions
rebuildManufacturingState
createManufacturingFromBuffer
buildBOMFromText
testBOMExplorer
testBOMTree
testMaterials
runTableParser
testProductionRequirement
testProductReport
debugProjectContext
testP1BOM
testP1Materials
testDiagnoseProductP1
testGenerateProjectMaterialMatrixReport
testManufacturingResolver
testManufacturingProcessor
manufacturingInitialMigration
testManufacturingDomainMapper
testManufacturingSyncStateRepository
testManufacturingSynchronizationAnalyze
testManufacturingSynchronizationExecute
testManufacturingSynchronizationApplication
testManufacturingSynchronizationCancel
testManufacturingSynchronizationMove
testManufacturingSynchronizationDetach
testManufacturingSynchronizationDetachAnalyze
testManufacturingSynchronizationDetachIntegration
testManufacturingSynchronizationBatchAnalyze
testManufacturingSynchronizationBatchExecute
testManufacturingSynchronizationBatchRepeat
testManufacturingRepositorySave
testManufacturingInputValidator
testManufacturingIdGenerator
testManufacturingCreationService
testManufacturingInputBufferDebug
testManufacturingInputBufferMapper
testGoogleSheetsManufacturingBufferReader
testManufacturingBufferCreationApplicationService
testCreateManufacturingFromBuffer
testManufacturingWebInputMapper
testManufacturingHouseOptionsService
testManufacturingProductOptionsService
testManufacturingPlacementOptionsService
testManufacturingWebOptionsApi
testManufacturingPlacementRebuildExecute
bomMaterialRequirementsIntegrationTest
testBOMCompletenessChecker
testAuditAllProducts
testExpandProductP31
testProductSpecificationReport
testProductSpecificationReportP31
testRoundQuantity
testBOMVerticalReportP31
testMaterialConsumptionReportP31
testMaterialBatchOptions
testReportFilter
testReportFilterService
```

includeBOMCommitClient_ — top-level GAS function, але underscore робить її private для google.script.run за [HTML Service docs](https://developers.google.com/apps-script/guides/html/communication). Решта declarations — RPC surface незалежно від кнопок у HTML.

HTML RPC: html/BOMCommitClient.html:44,68,80 → submitBOM/resumeBOM; html/Manufacturing.html:443,526,575,610,689,754 → getManufacturingHouseOptions/getManufacturingProductOptions/getManufacturingPlacementOptions/createManufacturingFromWeb. html/FormElement.html → addElement, wrapper відсутній: старий UI contract не працює, це не відкритий writer. src/ui/BOMForm.html — неактивний fragment, не копіюється html/** build; positional buildBOMFromText(parent,spec) відхиляється поточним contract.

Не зареєстровані internal commitBOM/resumeBOMCommit, writeSafeBOM/writeSafeBOMUnderLock/recoverSafeBOM, physical mapper, scoped mutation/receipts, journal mutation/classes, generateIdByType/ID reservation, legacy writers, withLegacyBOMCompatibilityForTests. Прямого RPC до них немає; top-level destructive BOM methods поза guarded adapters немає.

Manufacturing APIs збережено: createManufacturingFromWeb, options, rebuildManufacturingState, createManufacturingFromBuffer; doGet/Manufacturing HTML узгоджені. Однак webApp.ts:55 createManufacturingFromWeb прямо service.create без BOM authorize. Registered manufacturingInitialMigration(false) виконує setValue (default true не захищає від explicit false); testManufacturingRepositorySave → repository.save; testManufacturingSynchronizationExecute → service.execute; testGenerateProjectMaterialMatrixReport → reporting writer із clearContents. Це **не обхід до 01_BOM**, але широка ERP mutation surface під deployer. Manual GAS tests не mock-only тільки через назву test. Інші registered diagnostics потребують side-effect allow-list review. Manual GAS функції під час аудиту не запускалися.

## 5. Legacy save quarantine, old routes і triggers

| Символ | Доказ | Маршрут/класифікація |
|---|---|---|
| insertBOMRows | bom.repository.ts:19–20 | Internal guarded legacy; не RPC; local mock tests |
| deleteBOMByParentId | repository:104–105; clearContents:119 | Internal destructive; disabled у GAS |
| deleteBOMTree | repository:125–126; clearContents:167 | Internal destructive; disabled; service:260 call закоментовано |
| replaceBOMForParent | repository:177–178; clearContents:266; service:298 | Internal destructive; disabled до Sheet access |
| buildBOMFromTable | bom.service.ts:218–233 | Internal guarded service → replaceBOMForParent; не RPC |
| withLegacyBOMCompatibilityForTests | legacy-save-quarantine.ts:13 | process.env.VITEST === true only; finally resets depth; не RPC |
| buildBOMFromText/runTableParser | bom-commit.api.ts | Active RPC → authorized Safe Commit |
| BOM clearContents | repository:119,167,266 | Лише quarantined methods; Safe Writer використовує scoped setValues |
| reporting clearContents | infrastructure/reporting/project-material-matrix-writer.ts:14 | Не BOM; reachable public report wrapper, потенційно небезпечний |

Call sites: bom-preparation.test.ts — mocks/no-write assertions; bom-commit.api.test.ts — quarantine/ACL tests; direct-material-creation.test.ts та bom-master-routing.test.ts — явна compatibility на local mocks. Інших активних source calls до перелічених legacy methods пошук не виявив. Guard кидає LEGACY_BOM_SAVE_DISABLED при depth=0; GAS process не має Vitest environment.

onOpen формує меню; onEdit у index.ts тільки A2 01_Виготовлення / 03_Краби → production handlers, не legacy BOM service. Production handlers використовують active spreadsheet. Реальні installable/time-driven trigger registrations/owners невідомі. Source/code editors, які змінюють script, поза RPC boundary threat model.

**Локальний source audit не доводить відсутність старих опублікованих GAS versions.** Pinned старий deployment може мати unguarded clearContents та інший lock protocol. Старий client до нового server відхиляється; старий client до старого server лишається ризиком.

## 6. MASTER та journal readiness: read-only checklist

Configured MASTER ID (SpreadsheetConfig.ts): 1fKJtN1ceaJu7F1dh8rKccQ52MNofDarKeT6fOoEDJUg. OPERATIONAL/REPORTING окремі; Safe Commit explicit MASTER. Підтвердити production target, не Master-10/інша копія.

01_BOM exact A:G: `ParentID | ChildID | Qty | Unit | Comment | ParentCode | ChildCode` (physical-bom-schema.ts:8–30). Extra used columns не підтримуються; integer IDs; Qty finite >0; Unit/codes непорожні strings; Comment string. Blank row допустимий, partial ні. safe-bom-writer.readBOM відхиляє formulas; plannedSlots:113–120 перевіряє merged targets/reserved journal floor. Grid capacity/edit permission цим не доведено.

_BOM_CommitJournal exact A:F: `OperationID | Kind | Sequence | Payload | Digest | UpdatedAt` (safe-bom-writer.ts:12). Missing sheet throws; auto-create немає. Sequence/digest chain, payload до 20000 chars, append flush/readback. Journal зберігає input specification/context: confidentiality/ACL також важливі. Digest chain не замінює permission і не захищає від власника, який переписує повний chain.

Fresh context reads: 00_Elements, 04_Catalog, 05_Materials, 21_ProjectDocumentDependencies; uncached bindings/canonical material identity/catalog ambiguity/context digest. counterPreflight (safe-commit.service.ts:30–49) читає exact Type|LastID counters та occupied IDs Elements/Materials. Нові ID під ScriptLock; preflight schema не доводить write permission.

Checklist для наступного read-only етапу:

- [ ] Підтвердити IDs MASTER/OPERATIONAL/REPORTING, owner/deployer, фактичну ACL.
- [ ] 01_BOM exact header, complete valid value-only rows; без formulas/extra used columns/merged target cells; достатній physical grid.
- [ ] Journal існує; exact header; operation/writer chains valid; немає orphan/pending/corrupt reservations. Missing journal не створювати.
- [ ] 00_Elements має рівно по одному всіх 19 ELEMENT_COLUMNS: ID, Code, PrefixName, Name, Type, ProjectDocumentID, ParentMaterialID, Category, BaseUnit, ProfileType, Diameter, Class, Width, Height, Length, Thickness, IsActive, Comment, CreatedAt. Header mapping допускає порядок; validateWritable відхиляє extra columns. ID/business identities без ambiguity/collisions із Materials.
- [ ] 04_Catalog required headers (src/modules/catalog/catalog.headers.ts): ID, TypeCode, Name, Type, Category, ProfileType, HasBOM, ProductionType, SupportsLength, Comment; templates однозначні.
- [ ] 05_Materials required headers (src/modules/material/material.headers.ts): MaterialID, Code, Name, Category, ProfileType, Diameter, Class, Width, Height, Thickness, Density, WeightPerMeter, IsActive, Comment; canonical IDs/normalized codes без дублікатів; фізичні атрибути коректні для input.
- [ ] 21_ProjectDocumentDependencies: ID, ProjectDocumentID, DependsOnProjectDocumentID, Priority. Звірити document/dependencies із 19_ProjectDocuments: fresh resolver **не читає 19_ProjectDocuments і не перевіряє існування переданого ID**, додає власний ID та прямі dependencies, не транзитивний граф. API nonempty ID не доводить реальний ProjectDocument.
- [ ] _Config_ID_Counters exact Type|LastID; для потрібних types рівно один counter, valid ranges/next IDs/collision scan. Schema читається навіть коли types порожні.
- [ ] Read-only inspect sheet/range protections BOM/Elements/counters/journal під intended effective identity, включно warning-only/domain/group/unprotected ranges. File editor status не доводить append permission.
- [ ] План окремо дозволеного isolated GAS write acceptance на test copy: submit/retry/resume/unauthorized/protection failure/lost response/recovery. Production write не частина цього checklist.

HeaderSchema Catalog/Materials/Dependencies перевіряє required/empty/duplicate headers, не exact order/no-extra policy як BOM/journal.

## 7. Deployment inventory gaps і команди власнику

.clasp.json у root відсутній, .gitignore його ігнорує; local scriptId/rootDir невідомі. package.json push = build && clasp push; не запускати. Пошук concrete script.google.com/AKfy/scriptId/deploymentId у source/docs не знайшов URL/ID deployment; ScriptApp.getScriptId у include — runtime scope, не локальний ID. Dist match не підтверджує remote state.

Бракує script ID/owner/cloud project/scopes, deployment IDs/URLs/version numbers/actual access/executeAs, pinned content/manifest, старих consumers, trigger registrations/owners та поточного remote source. Немає підстав заявляти, що старі deployments відсутні.

Власник вручну після окремого дозволу у каталозі з **вже наявним перевіреним** .clasp.json:

```powershell
Get-Content -LiteralPath .clasp.json
clasp --version
clasp deployments
clasp versions
```

Ці команди тут не виконані. Syntax перевірити clasp --help установленої версії; не використовувати npx, який може install. Не виконувати login/clone/pull/push/deploy/undeploy/run для read-only inventory (pull/clone записують файли). Якщо config missing — Apps Script UI Project Settings, без створення guessed config. Deploy → Manage deployments; Triggers; Overview/Project Settings для scopes.

З уже наявним OAuth token та verified SCRIPT_ID: read-only GET https://script.googleapis.com/v1/projects/SCRIPT_ID/deployments, /versions, /content?versionNumber=N. Перевірити pagination. Token не публікувати у chat/report/logs. Deployments list не замінює trigger inventory. Retirement/rollback лише окремо узгоджено, не автоматично.

## 8. Ризики

| ID | Ризик | Доказ | Наслідок | Рекомендація | Blocking deploy |
|---|---|---|---|---|---|
| B1 BLOCKER | Identity не гарантована для editor rollout | USER_DEPLOYING, Session docs, reject empty | Authorized editors можуть бути заблоковані | Access/identity policy + GAS matrix | Так |
| B2 BLOCKER | Public ERP write/migration/test RPC без загальної ACL | register, webApp.create, migration(false), repository.save/execute tests | Wide authenticated audience може виконувати writes як deployer | Production allow-list та ACL, зберегти потрібні manufacturing APIs | Так у поточному ANYONE rollout |
| B3 BLOCKER | Старі deployments/triggers невідомі | Missing clasp config; 1H3F deployment caveat | Old writer може пошкодити scoped commit | Inventory та затверджений retirement/rollback | Так |
| B4 BLOCKER | MASTER/protected journal readiness не підтверджена | Schema/appendRow, no permission preflight | Denial/partial durable operation, recovery unavailable | Schema/ACL checklist + isolated acceptance | Так |
| H1 HIGH | Group editor identity/ACL mismatch | Exact user email, no group membership logic | Хибна відмова легітимним users | Direct editors або verified group policy | Якщо group access потрібний |
| H2 HIGH | Заявлені 7 high vulnerabilities без advisory evidence | Lockfile є, saved audit report не знайдено | Build-chain exposure невідома | Окремий dependency audit/risk acceptance | Умовно |
| M1 MEDIUM | ProjectDocument existence не перевіряється | Resolver додає довільний input ID | Невірний business context | Затвердити trust/existence contract | Якщо existence обов'язковий |
| M2 MEDIUM | Report/manual diagnostic surface | Registered report → clearContents | Витік/перезапис даних | Side-effect classification/ACL | Покривається B2 |
| M3 MEDIUM | Protection не входить до schema preflight | validateWritable/slots без canEdit | Write failure після durable phase | Permission inspection/fault acceptance | Покривається B4 |
| M4 MEDIUM | Shared recovery будь-яким editor | File-level authorize only | Право resume ширше per-user ownership | Затвердити policy | Умовно |
| I1 INFORMATIONAL | FormElement addElement missing | HTML call без wrapper | Old UI contract не працює | Позначити legacy UI | Ні |
| I2 INFORMATIONAL | 3 baseline failures | Local test output/1H3F | Material 3201 technical debt | Окремий slice, без зміни tests | Ні якщо baseline прийнято |
| I3 INFORMATIONAL | Застарілий Node PATH | v10 vs bundled v24 | Standard shell test/build failure | Supported runtime у наступному slice | Ні для перевіреного bundle |

### 7 high dependency warning

Це попередня warning із запиту, не сьогоднішній npm audit result. package-lock містить package versions, але не достатню advisory базу для attribution цих 7. Saved local audit JSON не знайдено. Не приписуємо вразливості конкретному package без доказів. package.json містить dev build/test tools Rollup/plugins, TypeScript, Vitest, cpy-cli, ts-node та runtime tslib; dev severity не дорівнює GAS runtime exposure, але install/build chain теж має ризик. npm audit потребує registry/network, тут не запускався; npm audit fix заборонено. Окремий дозволений dependency audit: npm audit --json та --omit=dev без install/update/fix; current advisories/lock та bundle inclusion review.

## 9. Slice №1H.4B та рішення

1. Архітектурно затвердити audience, executeAs, identity/direct/group ACL, protected journal writer і shared resume.
2. Мінімальна production public allow-list/загальна authorization policy: manufacturing UI APIs зберегти; manual mutation/migration/test handlers не залишати широкому audience без ACL.
3. Owner read-only deployment/version/trigger inventory та MASTER/protections checklist; concrete retirement plan старих writers.
4. Визначити ProjectDocument existence/transitive context contract.
5. Окремо дозволити isolated GAS acceptance: owner/direct editor/external/group/no-access/anonymous, protected journal, same-ID/recovery/fault scenarios. Local mocks не замінюють live checks.
6. Dependency advisory audit та risk acceptance/remediation без automatic fix у цьому slice.

**READY тільки після закриття B1–B4, підтвердження потрібної group/context policy та прийняття dependency risk. Поточний результат NOT READY.** Після збереження звіту зупинитися для архітектурної перевірки. Deploy/commit/MASTER mutation не виконано.
