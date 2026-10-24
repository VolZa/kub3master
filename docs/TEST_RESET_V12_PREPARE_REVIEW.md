# TEST_RESET v1.2 — Prepare / Review

> Історичний опис v1.2. Activate/rollback додано у [TEST_RESET v1.4](TEST_RESET_V14_ACTIVATE_ROLLBACK.md); результати v1.2 нижче не переписані.

Дата: 2026-10-23. Гілка feature/bom-logic. Локальна реалізація; реальних Google операцій не виконано.

## Межі

Додано підготовку й review pending generation, без activate. Канонічні ролі ADMIN/MANAGER,
USER_MANAGE, trusted UserInfo identity, TEST installation marker та production Script ID deny збережені.
MANAGER не має TEST доступу. KUB_TEST_ENV_V1 лишається одним JSON активного/pending середовища.
Production v32, .clasp.json, manifest, registry та production Rollup config не змінюються.

## Стан і JSON

| Стан | Значення |
|---|---|
| NOT_PREPARED | pending відсутній; старий v1 JSON дозволений |
| PREPARING | generation записана, іде послідовне копіювання або потрібен recovery |
| PENDING_REVIEW | усі три IDs збережені, потрібен review саме цих копій |
| REVIEW_FAILED | review виявив mismatch, ризик, UNKNOWN або відсутній доказ |
| READY_FOR_ACTIVATION | останній явно записаний review пройшов; це НЕ дозвіл виконувати activate |

Необов'язковий pending у version=1 JSON: id, createdAt, baseActiveId, state, files по ролях (id/name),
sheets, sourceHashes, inFlight, failure та optional review. Поля active/previous залишаються незмінними.
Старі JSON без pending читаються як раніше. IDs pending не можуть бути production/active/previous
або дублювати один одного; baseActiveId повинен збігатися з поточною active generation.
Старі v1 reset()/rollback() блокуються при pending, щоб не обійти новий workflow.

Перед copy записується intent inFlight=MASTER/OPERATIONAL/REPORTING. Отриманий valid ID записується
одразу, до наступної копії. Імена: ERP_KUB_TEST_<ROLE>_<generationId>, де generationId — окремий UUID.
Один JSON replacement + точний readback після кожного checkpoint. Ліміт 8500 UTF-8 bytes, резерв
3000 bytes під IDs/review metadata ДО початку side effects. Немає обрізання manifests чи fallback.
CONFIG_COMMIT_UNCONFIRMED зупиняє виконання без автоматичної повторної спроби запису.

## Prepare і recovery

prepare(expectedGeneration): expectedGeneration=null для першого середовища або точний active.id.
Під ScriptLock повторно перевіряє ADMIN/USER_MANAGE/контекст, повний preflight та докази джерел.
Known hazards (IMPORTRANGE/URL/production IDs тощо), UNKNOWN scripts/triggers/connections або
відсутній fingerprint блокують підготовку ще ДО запису pending/folder/copies.

Після успішного preflight persist PREPARING, перевірити/створити ERP_KUB_TEST, потім послідовно
makeCopy(name,folder). Перед КОЖНОЮ copy повторити preflight/identity, звірити source fingerprints,
записати intent і перевірити, чи немає вже файлу з точною назвою. Existing copy не копіюється вдруге.
Записані active.files/previous не змінюються. Жодних rename/delete/санітизації існуючих файлів.

Повторний prepare при будь-якому pending — лише повертає його діагностику. Він не починає нову
generation і не продовжує мовчки стару. Для часткового/невизначеного результату є ЯВНИЙ recoverPending.

- Після timeout makeCopy запис лишається PREPARING/inFlight, failure=COPY_OUTCOME_UNKNOWN.
- Recover шукає точну назву в saved folder: рівно один new ID + parent/MIME/fingerprint validation
  дозволяють його прийняти. Далі копіюються лише ролі, які ще не намагалися створювати, зі свіжим preflight.
- Нуль знайдених → COPY_NOT_DISCOVERED_NO_RETRY, без повторного makeCopy. Drive search може бути
  eventual-consistent; нуль не доводить, що файл не створився. Повторний read-only inventory після
  окремого рішення власника допустимий, новий copy цієї ролі автоматично НЕ виконується.
- Дві й більше копій → AMBIGUOUS_COPY_RECOVERY, без довільного вибору/видалення.
- Folder creation має окремий inFlight=FOLDER; recovery теж лише при одній ERP_KUB_TEST.
- Commit timeout до/після збереження отриманого ID відновлюється з authoritative JSON та inventory;
  без прихованого повтору копіювання. Якщо write capacity/permissions не дозволяють зберегти checkpoint,
  зупинитися і не видаляти нічого.
- Source змінився/втратив evidence після partial prepare → блокування продовження. Already created
  copies залишаються. Немає автоматичного abandon/discard/new-generation workflow в цьому slice.

ScriptLock діє тільки в цьому TEST project, не блокує production writers, manual edits або інші scripts.
Три source snapshots не є атомарним cross-file snapshot. Після prepare review обов'язково звіряє
кожну копію з початковим scanned source commitment. Dynamic/volatile formula results можуть дати
mismatch; не змінювати expectations або source data для PASS.

## Read-only review і запис результату

reviewPending() СТРОГО read-only: не пише Properties і не змінює Drive/Sheets. Повертає обчислений
стан REVIEW_FAILED/READY_FOR_ACTIVATION, IDs, fingerprints, evidence IDs/commitments та blockers.
Якщо pending неповний/inFlight — PREPARING/RECOVERY_REQUIRED. Це не створює нових copies.

Перевіряються exact new IDs, MIME/parent, єдине exact ім'я, повний sheet manifest, scanned source/copy
hash match, external hazards і актуальні dependency receipts. Missing/changed file/expired evidence — fail.
Код окремо перевіряє ADMIN до і після review. Не зберігаються сирі cell values/формули у diagnostics.

recordReview(pendingGenerationId) — ОКРЕМИЙ явний metadata write під ScriptLock. Він заново виконує
review, не приймає browser/status PASS input, і записує state/review commitment/hash/evidence IDs
у той самий KUB_TEST_ENV_V1. Active не змінюється навіть за READY_FOR_ACTIVATION.
Збережений READY — історичний checkpoint, не вічна гарантія безпеки: новий read-only review може
повернути FAIL після змін, не переписуючи старий checkpoint. TEST_ACTIVATE мусить виконати свіжий review.

## Fingerprint scope

Спільний v1 scanner розширено optional SHA-256 commitments. Scope WORKBOOK_CONTENT_V1:
порядок/назви аркушів, used/max grid dimensions, typed values (Date як ISO), formulas, rich-text
links/runs, notes та number formats. Chunk hashes (~4096 cells) → ordered workbook root.
File ID/name виключені, щоб source і повна copy могли мати той самий content commitment.
Вся книга не перетворюється на один великий JSON; великі strings усередині chunk все ще можуть
споживати пам'ять. Ліміт 250000 cells/book, GAS elapsed/heap feasibility тут не виміряні.

Це НЕ byte hash усього Google Drive file і не повний hash всіх formatting/protection/named-function/
connector/Apps Script/trigger властивостей. Вони потребують окремого manual dependency audit.
Непокриту категорію не можна позначити SAFE лише тому, що workbook root не змінився.

## Ручні докази, без вигаданого SAFE

Default — UNKNOWN. Додано ЯВНУ операцію registerReviewEvidence, яка вимагає перевіреного ADMIN
і не надає жодної ролі. Дозволені лише три source IDs і поточні pending IDs.
Reviewer має спершу справді зібрати незалежний audit artifact: bound project IDs/source review,
onOpen/onEdit/custom functions/production literals/remote calls, всі відомі trigger owners/inventory,
connectors/named functions та інші зовнішні dependencies. Не виконувати macros/scripts задля аудиту.
Якщо повноту встановити неможливо — залишити UNKNOWN, навіть коли поточний project trigger list порожній.

Вхід: exact fileId, поточний workbook fingerprint, evidenceId, незалежно обчислений SHA-256 artifact,
reference до збереженого audit material і explicit статус кожної з трьох категорій.
Register перевіряє current fingerprint, дозволений fileId та actual ADMIN subject; сам призначає
reviewerSubject/час і строк 15 хвилин. Ledger KUB_TEST_REVIEW_EVIDENCE_V1 — один bounded JSON
(до 12 receipts, 8500 bytes), окремо від активної конфігурації. Запис/readback перевіряється.
Повторний receipt заміняє доказ лише для цього fileId; старі generations/файли не видаляються.

Receipt commitment об'єднує workbook hash + external audit artifact hash + статуси + reviewer/час.
Inspector вимагає matching current workbook hash, unexpired receipt та досі active ADMIN reviewer;
інакше повертає UNKNOWN. UNKNOWN/UNSAFE не перетворюються на SAFE автоматично.

Це довірена ручна атестація, не автоматична перевірка вмісту reference і не цифровий підпис артефакта.
ScriptProperties/editor ACL — trust boundary; зловмисний code editor може змінити й код/ledger.
Зміна bound script/trigger без зміни workbook content автоматично цим scanner не виявляється.
До ACTIVATE потрібне свіжо підтверджене dependency state, а не лише старий receipt/READY flag.
Власник не повинен підставляти довільний hash/reference або SAFE заради проходження тесту.

## Editor-only commands і request

TEST-admin build тепер має рівно 7 private top-level functions (усі закінчуються underscore):

1. KUB_TEST_adminIdentity_()
2. KUB_TEST_readOnlyPreflight_()
3. KUB_TEST_prepare_()
4. KUB_TEST_reviewPending_()
5. KUB_TEST_recoverPending_()
6. KUB_TEST_recordPendingReview_()
7. KUB_TEST_registerReviewEvidence_()

Немає public RPC, doGet/doPost, UI-меню, trigger або activation entrypoint. Legacy v1 reset/rollback
не входять у цей build. Production registry лишається 20 функцій без admin workflow.
TEST Web Build ще не реалізовано: майбутня конфігурація НЕ повинна імпортувати admin entrypoints.

Ручні mutating commands читають explicit request із KUB_TEST_ADMIN_REQUEST_V1 — його власник
задає лише в TEST project settings, не browser. Identity/roles у request не приймаються як доказ.

Перший prepare:

```json
{"version":1,"operation":"prepare","expectedGeneration":null}
```

Recovery існуючого pending:

```json
{"version":1,"operation":"recover","expectedGeneration":null,"pendingGenerationId":"ACTUAL_PENDING_ID"}
```

Запис recomputed review:

```json
{"version":1,"operation":"record-review","pendingGenerationId":"ACTUAL_PENDING_ID"}
```

Реєстрація evidence після ФАКТИЧНОГО audit (приклад навмисно UNKNOWN):

```json
{"version":1,"operation":"evidence","evidence":{"fileId":"ACTUAL_FILE_ID","fingerprint":"ACTUAL_64_HEX_WORKBOOK_HASH","evidenceId":"ACTUAL_AUDIT_ID","artifactCommitment":"ACTUAL_64_HEX_AUDIT_ARTIFACT_HASH","reference":"ACTUAL_REVIEW_RECORD_REFERENCE","externalConnections":"UNKNOWN","boundScripts":"UNKNOWN","triggers":"UNKNOWN"}}
```

Замінювати UNKNOWN на SAFE можна лише для справді завершеної перевірки відповідної категорії.
При existing active generation expectedGeneration має бути точним active.id, не null.
reviewPending не потребує request і нічого не записує. Усі entrypoints відхиляють аргументи.

## Майбутня ручна послідовність — НЕ ВИКОНАНО

1. Погодити окремий upload TEST-admin v1.2 та scope change. Target лишається targets/test-admin,
   production .clasp.json не чіпати. Локальний build: npm run build:test-admin.
2. НОВИЙ manifest TEST-admin потребує Drive scope для folder/makeCopy; Sheets лишається read-only.
   Це ширший scope, ніж v1.1 diagnostics. Зараз consent/permissions не змінювалися. Не розміщувати цей
   build у production або Web App. Future upload не означає дозвіл на prepare.
3. Підтвердити TEST Script ID/marker, ADMIN subject/directory та реальні права на sources; виконати
   identity і read-only preflight. Зібрати source fingerprints і blockers.
4. Виконати окремо погоджений manual source dependency audit, зберегти artifact й зареєструвати
   три receipts. Якщо є known hazard або UNKNOWN — STOP. Receipt не обходить scanner hazards.
5. Лише після нового preflight PASS та окремого дозволу на реальні копії встановити prepare request,
   виконати KUB_TEST_prepare_ один раз, зберегти result/pending JSON та Drive IDs.
6. При partial/timeout — не rerun для нового copy. Read-only inventory/JSON, потім explicit recover
   з точним pending ID; no discovery/ambiguity → зупинка, не видаляти копії.
7. Виконати read-only review, отримати copy fingerprints, провести manual audit саме нових copies,
   зареєструвати receipts для їхніх IDs. Source evidence не переноситься автоматично на copies.
8. Повторити read-only review. За PASS явно recordPendingReview. Перевірити active/previous незмінні.
9. Навіть READY_FOR_ACTIVATION — STOP для окремого TEST_ACTIVATE slice/review/дозволу.

Реальні blockers: немає live TEST enrollment/consent/source evidence; відсутній повний automatic
script/trigger/connection inspector; відомі URL/production references можуть робити prepare неможливим
без окремо погодженого sanitization/design slice. Немає abort/discard, activation, TEST runtime resolver,
rollback першої generation, live resource benchmark або cross-file consistency guarantee.

**NO-GO для першого реального prepare зараз.** GO лише для незалежного review локального коду/тестів.
Жодних реальних makeCopy, Drive/Sheets changes, clasp push/deployment або Git commit/push не виконано.

## Змінені файли та перевірки

Нові: src/admin/test-reset/prepare-review.ts, manual-evidence.ts, prepare-review.test.ts;
docs/TEST_RESET_V12_PREPARE_REVIEW.md.
Оновлені в src/admin/test-reset/: test-configuration.ts (optional pending schema), test-reset.ts
(pending guard для legacy reset/rollback), spreadsheet-risk-inspector.ts (bounded fingerprints),
gas-test-reset.ts (shared Drive adapter/discovery), admin-preflight.ts (source hashes),
admin-entrypoints.ts (private workflow commands), admin-build.test.ts (actual bundle safety).
Також rollup.test-admin.config.mjs та targets/test-admin/appsscript.json.
Старі docs/TEST_RESET_V1.md та TEST_ADMIN_PREFLIGHT_V11.md позначені історичними для відповідних етапів;
їхні попередні test results не переписані.

| Перевірка | Результат |
|---|---|
| TypeScript --noEmit --incremental false | PASS |
| npm run build:test-admin | PASS |
| npm run build | PASS |
| Повний Vitest, Node.js 22.16.0 | 941/941 PASS, 50 test files |
| TEST_RESET/admin subset | 82/82 PASS; 19 нових prepare/review/fingerprint tests |
| Production actual bundle | Existing exact 20 globals; admin workflow не додано |
| TEST-admin actual VM | 7 private globals, no load effects; identity/preflight/review read-only, prepare UNKNOWN → no writes |

Coverage включає повні/partial copies, timeouts після першого/другого remote creation, відсутню/
неоднозначну discovery, повторний prepare без нових копій, write-before/write-after commit uncertainty,
uncertain folder creation, source/copy hash changes, strict read-only review, explicit review checkpoint,
UNKNOWN/expired evidence, MANAGER/unknown/wrong Script ID deny, CAS/conflicts, lock та JSON capacity.
Fingerprint tests незалежно змінюють values/types/formulas/notes/number formats/grid dimensions.
Production .clasp.json, rollup.config.mjs, appsscript.json, src/index.ts і gas-production-entrypoints.json
мають попередні SHA-256; Web App v32 не змінено.
