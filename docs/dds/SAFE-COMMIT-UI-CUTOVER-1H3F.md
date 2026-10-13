# ERP КУБ — UI Cutover and Legacy Save Quarantine — Slice 1H.3F

Дата: 2026-10-13. Перевірена база HEAD: `fa2b9e8`. Baseline: 477 passed / 3 legacy failures.

Локальне переключення завершене. Реальні GAS functions, Google Sheets, MASTER/Master-10 не викликалися й не змінювалися. Commit, clasp push/deploy не виконувалися. MIGRATION-VERIFICATION.md і Accepted DDS/ADR не змінені. Checklist нижче лише підготовлено.

## 1. Старі та нові entrypoints

| Точка | Було | Стало |
| --- | --- | --- |
| `src/index.ts:runTableParser` | Cached factories → parseParent/parseTableText → buildBOMFromTable → replaceBOMForParent | Imported compatibility adapter із `src/ui/bom-commit.api.ts`; explicit document/input/OperationID → submitBOM → commitBOM. |
| Global `buildBOMFromText` | Cached repositories, document context втрачався, destructive save | Strict object adapter до того самого trusted submitBOM. Старі payloads без ProjectDocumentID/OperationID відхиляються. |
| `bom.service.ts:buildBOMFromText` | Legacy service route | Delegation до trusted adapter, без legacy фізичного save. |
| `submitBOM(request)` | Відсутній | Спільний trusted raw-input RPC для обох форм. |
| `resumeBOM(operationID)` | Відсутній | Окремо авторизований resumeBOMCommit; context береться лише з durable journal. |
| `buildBOMFromTable` | Міг створювати Elements і заміняти BOM | GAS runtime guard відхиляє до repository/ID/Element calls. |

Public request містить тільки operationID, projectDocumentID, parentInput і specification. Невідомі поля відхиляються; PreparedBOM, SafeBOMPlan, bindings, receipts, AffectedParentIDs, rows та commentChanges не приймаються як web input. Server сам виконує Prepare, fresh lookup, creation, mapping і scope validation. Оркестратор не дублюється.

`runTableParser(documentID, parentInput, text, operationID)` і object-based `buildBOMFromText({ projectDocumentID, parentCode, specification, operationID })` збережені як strict safe adapters. Для застарілих three-argument/string calls немає автоматичного UUID або default документа. Повертається VALIDATION_ERROR, а не прихований legacy save.

## 2. Авторизація та контекст

Перед commit/resume перевіряється Session.getActiveUser().getEmail(). Ідентифікований користувач має бути власником або явно переліченим редактором MASTER за DriveApp.getFileById(SpreadsheetConfig.MASTER.id). Active Spreadsheet та effective deployer identity не використовуються як докази прав. Anonymous/unknown user або viewer відхиляється до SafeCommitService. OperationID не є credential; знання ID саме по собі не відкриває resume.

Це консервативна поточна policy: domain/group/inherited editors, яких Drive getEditors не представляє як individual email, можуть бути відхилені. Розширення доступу потребує погодженої identity policy; автоматичного allow-all fallback немає. Новий Drive read access потребує перевірки consent/scopes при контрольованому впровадженні.

Чинний appsscript.json містить ANYONE / USER_DEPLOYING. У таких web app contexts active email може бути недоступним; API тоді відмовляє, а не використовує права deployer. Перед production треба перевірити конкретну execution identity та access settings. Це відповідає documented обмеженням [GAS Session](https://developers.google.com/apps-script/reference/base/session).

ProjectDocumentID обов'язковий raw string і передається без підстановки іншого документа. Parent type/code/description залишаються одним semicolon input для чинного parseParent. Structured specification text передається без нового parser до чинного Prepare. Form тепер має document field та коректний parent prefix; старі неструктуровані demo lines замінені semicolon прикладами. Проєктні/матеріальні Parts і direct Materials обробляє незмінна Product Policy. Code-only або невалідний input дає діагностику.

## 3. Як працюють форми

`html/Form.html` та `html/FormTable.html` мають однакові field/control IDs і включають `html/BOMCommitClient.html` через private `includeBOMCommitClient_()`. `src/ui/openForm.ts` використовує createTemplateFromFile().evaluate(); helper приймає лише фіксований asset, без довільного file path.

Обидві форми викликають `.submitBOM(rawRequest)` із success/failure handlers. Для resume викликається `.resumeBOM(id)` — поточні відредаговані fields не надсилаються. Інтерфейс прямо пояснює, що original input/ProjectDocumentID для recovery визначає журнал.

Форми зберігають document, parent description і specification при reopen/cross-form restore, якщо local storage доступний. Default document 7 більше не підставляється мовчки; оператор має явно вказати document або бачить відновлений draft.

## 4. Життєвий цикл OperationID

Перед першою RPC створюється `BOM_<128-bit random hex>` через crypto.getRandomValues(). Під час одного submit busy flag і disabled Save синхронно блокують подвійний click. Record містить незмінний original input, OperationID і phase; збереження виконується до RPC.

LocalStorage namespace включає Script ID і temporary active-user key. Current record, draft та history IDs використовуються як client convenience, а не durable доказ. Temporary user key може ротуватися через 30 днів; його documented властивості наведені у [GAS Session](https://developers.google.com/apps-script/reference/base/session). ІFrame storage також може бути заблокований browser policy або очищений. Гарантії збереження після кожного refresh немає.

Тому ID завжди показано у editable recovery field, окремо доступні попередні IDs і повідомлення про недоступний storage. Оператор може скопіювати ID та ввести вручну після reopen. Manual resume не потребує client original input. Якщо durable manifest ще не завершився й потрібен exact original-input retry, Save за manually supplied ID вимагає явного підтвердження початкових даних; server digest все одно відхиляє інший input. Сам ID не змінюється.

При failure/60-second watchdog outcome показується як невідомий: сервер міг записати BOM. Автоматичних retries або нового ID немає. Ручний повтор того самого input використовує той самий ID. Після зміни fields старий ID не використовується мовчки: потрібна explicit New Operation. Для незавершеної/conflict операції це також потребує підтвердження; старий ID лишається в history. Late callback попередньої спроби/покинутої операції не перезаписує current operation state.

LocalStorage не є backup або authorization store. Server-side durable journal лишається джерелом truth; для операцій без збереженого ID browser guarantee не обіцяється.

## 5. Статуси та повідомлення

| Status/outcome | UI |
| --- | --- |
| COMMITTED | «BOM успішно збережено», OperationID. |
| ALREADY_APPLIED | «Операція вже застосована та перевірена», OperationID. |
| VALIDATION_ERROR | Діагностика, без заяви про збереження; новий input потребує New Operation. |
| RECOVERY_REQUIRED | Можливість resume тієї самої операції; ID лишається незмінним. |
| CONFLICT | Причина/ID, Save blocked, немає автоматичного retry. Explicit resume потребує підтвердження перевірки конфлікту. |
| Transport failure/timeout | Результат невідомий; same-ID retry/resume. |
| Неочікувана відповідь/Prepare success | Непідтверджений результат; success не показується. |

Typed diagnostics відображають physical specification row index + 1; parent/context errors мають окреме позначення. Повідомлення вставляються через textContent. Системні HTML або specification text не виконуються як markup. Прийнятий HTTP/RPC success без підтвердженого SafeCommitService status не означає success save.

## 6. Legacy quarantine та build boundary

`src/modules/bom/legacy-save-quarantine.ts` блокує:

- buildBOMFromTable до створення кореня/Parts;
- replaceBOMForParent до повного clear/rewrite;
- insertBOMRows до накопичення/insert;
- deleteBOMByParentId та deleteBOMTree до delete/clear.

Legacy source залишено для аналізу й сумісності старих mock tests. Explicit withLegacyBOMCompatibilityForTests() дозволяється лише у Node Vitest runtime, відновлює guard у finally і не є GAS endpoint. Старі позитивні routing/direct-material tests не видалено: вони виконують legacy code тільки під цим local-only режимом. Нові tests перевіряють default guard denial до Sheet access. В GAS compatibility gate не активується.

Build раніше мав ES output з top-level functions і treeshake=false. Незареєстровані helpers могли лишатися callable у GAS. Тепер Rollup output — IIFE; register() зберігає handlers у private-suffixed registry. Build plugin читає explicit register object у src/index.ts і створює тільки top-level wrappers з цього переліку. Внутрішні generator/writer/creation/mapper/receipt APIs та destructive helpers не стають RPC через bundling. За [Google HTML communication documentation](https://developers.google.com/apps-script/guides/html/communication), client RPC не бачить nested functions, а names із trailing underscore private.

Явно збережено wrappers onOpen/onEdit, обидва openForm, doGet та реально використовувані manufacturing options/create/rebuild/buffer APIs. Manufacturing HTML і бізнес-логіка не змінені. FormElement посилається на addElement, якого в дослідженому коді немає; такий endpoint не вигадано. `src/ui/BOMForm.html` — неактивний старий source fragment, не використовується openForm і не копіюється build; його старий call також не відкриває destructive save, бо adapter вимагає document/ID.

У новому bundle обходу до legacy BOM mutation не залишено: direct helpers private та guarded; old public save adapters ведуть до trusted Safe Commit. Registered read-only BOM diagnostics лишаються доступними. Це boundary для BOM writes, а не нова загальна ACL policy для інших ERP modules. Script/code editors, які змінюють код, знаходяться поза цими гарантіями.

## 7. Перевірки

- Релевантні Vitest: **291 passed** у 10 suites, включно з UI/API, фактичним Rollup global surface, full server flow, old routing tests, Prepare-era compatibility, journal, creation, mapper і writer.
- Повний `npx vitest run`: **536 passed / 3 відомі legacy failures**. Baseline 477 / 3; попередні tests не вимикалися.
- Незмінні failures: bom-material-matrix.integration.test.ts, bom-materials.service.test.ts, project-material-matrix.integration.test.ts — відсутній очікуваний Material 3201.
- Targeted strict TypeScript `--noEmit`: **passed**.
- `npm run build`: **passed**; bundle test окремо генерує actual Rollup output у пам'яті, без залежності від stale dist.
- `git diff --check`: **passed**.

Browser controller перевірено executable JS на mock DOM/storage/timers/google.script.run для обох фактичних form assets. Перевірені double click, lost response, timeout, same-ID retry, cross-form reopen, denied storage/manual ID, changed input/new operation, statuses/row diagnostics, stale callbacks і false Prepare success. Server tests перевіряють обидва compatibility adapters, strict payloads, owner/editor/anonymous/viewer access і resume. Integration test через trusted UI adapter використовує реальний SafeCommitService/Writer на MASTER-only mocks і підтверджує два submissions без нових IDs/дублікатів, foreign duplicates/positions/comments та old Part preservation.

Live HTML Service rendering, browser iframe storage/identity та production authorization ще потребують контрольованих GAS acceptance checks. Native browser або реальний MASTER під час локальних tests не використовувалися.

## 8. Старі опубліковані deployments

Локальний код не змінює вже опубліковані версії GAS. Старий deployment може продовжити buildBOMFromTable/clearContents без нового lock protocol й пошкодити Safe Writer result. Уже відкритий старий клієнт також може тримати outdated fields/route. Новий adapter відхиляє його incomplete payload тільки тоді, коли він звертається до нового server code; окремий pinned старий deployment не захищено цими guards.

Потрібно припинити old-version saves і retirement старих deployments до activation Safe Commit. Повертати destructive стару версію як rollback після першого safe write не можна без окремого погодженого data/recovery рішення. Одного «не використовувати старий URL» недостатньо як контроль.

## 9. Checklist контрольованого впровадження — НЕ ВИКОНАНО

1. Погодити maintenance window, operator/auth policy та відповідального за recovery. Інвентаризувати deployment IDs/URLs, bound HEAD, API executables, triggers, libraries і відкриті legacy clients. Зупинити legacy saves та перевірити відсутність активних старих executions.
2. Зробити перевірену backup copy MASTER: 00_Elements, 01_BOM, 04_Catalog, 05_Materials, document/dependency context, _Config_ID_Counters і journal, якщо існує. Зафіксувати IDs/counters/physical positions/comments. Не змінювати погоджену migration map.
3. Виконати окремо погоджений read-only schema preflight: exact seven BOM headers, value-only codes/comment, no CreatedAt/formulas, valid IDs/Qty/Unit, empty stable slots, no partial rows, Elements columns, canonical Materials/Catalog identities і counters. Невідповідність — stop, без автоматичної міграції.
4. Під час окремо погодженої setup дії створити _BOM_CommitJournal лише якщо відсутній, із шістьма точними headers: OperationID, Kind, Sequence, Payload, Digest, UpdatedAt. Наявний journal не очищувати й не перезаписувати. Налаштувати захист від ручного редагування, retention і backup.
5. Перевірити actual executing principal і permissions на protected journal/Elements/BOM: редактор, якому boundary дозволяє save, має виконувати запис під погодженою identity. Перевірити consent/Drive access, owner/editor/viewer/anonymous cases. При Session email unavailable, group-only access або несумісному journal protection — stop до погодженої identity policy; не додавати deployer fallback.
6. Перевірити local review/build/test results; підготувати контрольований version/deployment cutover тільки після окремого дозволу. Переконатися, що approved Code.gs має IIFE та explicit wrappers, internal mutation APIs не callable. Retire/disable старі pinned deployments і сторонні legacy write paths.
7. На погоджених контрольних даних перевірити обидві форми з точним ProjectDocumentID, project Part, material Part і direct Material; correct root/child codes, Comment, per-unit consumption та writeScope. Порівняти foreign rows/duplicates/positions і existing Part BOM із backup.
8. Перевірити double Save, lost-response same-ID retry, refresh/reopen, manual ID, storage-denied fallback, changed input, all statuses і diagnostics. Переконатися, що authorization перевіряється також для resume іншого ID.
9. Під контрольованим recovery сценарієм перевірити own CREATED Part до initial BOM, частковий writer write, completion acknowledgment і no-op без writer journal. Journal/Elements/physical BOM readback мають підтвердити provenance і target; жодного orphan cleanup чи LastID rollback.
10. При failure/conflict: freeze нові saves, зберегти O/journal/physical evidence, виконувати тільки погоджене same-ID recovery. Якщо потрібний rollback — насамперед припинити нові та старі writers; не запускати legacy destructive deployment поверх stable slots. Відновлення backup або повернення версії — окрема owner-approved процедура з перевіркою counters/provenance/foreign data.
11. Відкрити доступ операторам лише після acceptance, retirement старих writers та фіксації recovery інструкції. MONITOR conflicts/recovery-needed/permissions, зберігати OperationID і journal evidence.

Жоден пункт checklist не виконувався. Реалізацію зупинено для перевірки власником ERP.
