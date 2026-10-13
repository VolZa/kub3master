# ERP КУБ — Recoverable Element Creation — Slice 1H.3C

Дата: 2026-10-13. Перевірена база HEAD: `42a2bb0`. Архітектурні основи: `SAFE-COMMIT-INTEGRATION-AUDIT-1H3A.md`, `SAFE-COMMIT-JOURNAL-1H3B.md`, `SAFE-BOM-WRITER-1H2D.md`.

## Результат

Реалізовано локальний coordinator створення одного pending Element за durable operation manifest: fresh identity lookup → REUSED або RESERVING → internal ID reservation → durable INSERT_INTENT → insert → fresh physical verification → CREATED. Coordinator не записує BOM, не видаляє та не оновлює Elements. До вебформ його не підключено. Повного Safe Commit Orchestrator немає.

Реальні GAS-функції та Google Sheets не викликалися; усі мутації перевірялися лише на GAS mocks. Commit, clasp push/deploy не виконувалися. PreparedBOM/Product Policy, числові правила ID, legacy route/writer, BOMExpansion, MaterialFlow/Requirement, Accepted DDS/ADR і `MIGRATION-VERIFICATION.md` не змінені.

## Файли й API

| Файл | Відповідальність |
| --- | --- |
| `src/utils/script-lock.ts` | `requireScriptLock()` і `withScriptLock()`; перевірка ownership і outer finally. |
| `src/utils/id.ts` | Збережений `generateIdByType()`; новий `generateIdByTypeUnderLock(type, lock)`. |
| `src/modules/bom/commit/safe-bom-writer.ts` | Збережені public write/recover; нові `writeSafeBOMUnderLock()` / `recoverSafeBOMUnderLock()`. Фізичний алгоритм writer не змінений. |
| `src/modules/bom/commit/commit-operation-journal.ts` | `repairCreationTail()` і bounded retryPayload у нових identity frames. |
| `src/modules/bom/commit/fresh-element-store.ts` | `FreshElementStore`, `MasterFreshElementStore`, `physicalElement()`, явний MASTER, header-aligned insert. |
| `src/modules/bom/commit/recoverable-element-creation.ts` | `RecoverableElementCreation.create()/receipts()`, caller-owned factory і public `createRecoverableElement()`. |
| `src/modules/bom/tests/recoverable-element-creation.test.ts` | 37 тестів coordinator, physical store та locks. |
| `src/modules/bom/tests/safe-bom-writer.test.ts` | Три нові тести internal writer; усі попередні збережені. |
| `src/modules/bom/tests/commit-operation-journal.test.ts` | Окремий regression читання оригінальних 1H.3B frames. |
| `src/utils/id.test.ts` | Mock ScriptLock доповнений реальним контрактом hasLock; старі assertions збережені. |

## Володіння ScriptLock

Public API самостійно отримує ScriptLock, перевіряє відсутність уже захопленого lock, виконує tryLock(30000) і releaseLock у finally. При timeout незахоплений lock не звільняється. Помилка відкриття MASTER також проходить через outer finally.

Internal allocator, writer/recovery, journal і physical store вимагають переданий lock із `hasLock() = true`. Вони не викликають tryLock/waitLock і не release caller-owned lock. Public wrappers передають саме захоплений lock у internal API. Публічний ID allocator додатково відхиляє вкладений виклик до reservation.

`openRecoverableElementCreation(lock)` працює під existing outer lock; `createRecoverableElement(O, localKey)` є standalone public wrapper. Майбутній orchestrator має один раз захопити lock і викликати тільки internal APIs. Типовий порядок для 1H.3E: fresh revalidation всіх input → durable begin → creation → translation/writeSafeBOMUnderLock → durable completion → finally release.

ScriptLock координує cooperating callers одного Apps Script-проєкту. Він не блокує ручне редагування Sheets, сторонні Apps Script-проєкти або legacy inserts, які не дотримуються всього протоколу.

## Internal ID allocator

`generateIdByTypeUnderLock()` виконує ту саму MASTER reservation logic: читає `_Config_ID_Counters`, перевіряє зайнятість у `00_Elements` і `05_Materials`, викликає незмінний `calculateNextId()`, підвищує LastID і flush. Діапазони, міграційні floors та правила LastID не змінені. Історичні чотиризначні IDs залишаються допустимими existing references; Type не виводиться з діапазону ID.

Після RESERVING, якщо reservation сталася, але canonical intent не підтверджений, retry може зарезервувати наступний ID. Попередній залишається пропущеним; rollback LastID або повторне використання burned ID відсутні. Якщо durable intent уже є, allocator більше не викликається для цього localKey.

## Fresh identity та фізичний store

`MasterFreshElementStore.read()` при кожному виклику знову відкриває MASTER і читає `00_Elements.getDataRange().getValues()`. Cached application repositories не використовуються. Store реалізує insert-частину контракту ElementRepository через header-aligned запис, без зміни legacy repository.

Кожна з 19 чинних колонок має існувати рівно один раз. Читання враховує порядок заголовків, number/string ID і порожні optional cells. Невідомі додаткові колонки блокують insert до перегляду schema; їх значення не вгадуються. Strings записуються literal text, CreatedAt зберігається з durable intent, після append виконується flush.

Проєктні сутності шукаються за exact Code + ProjectDocumentID із перевіркою Type та характеристик. Матеріальні Parts — за normalized Code з перевіркою canonical ParentMaterialID, Type, profile, diameter/class, width/height/length/thickness і BaseUnit. ProjectDocumentID матеріальної Part не використовується як ownership і не переписується при reuse. Суперечливий кандидат за очікуваним Code не ігнорується для створення дубліката. Кілька кандидатів блокують операцію.

Після INSERT_INTENT перевіряються всі physical candidates за reservedID і бізнес-ідентичністю. Для CREATED потрібні рівно один reservedID row, рівно один identity candidate із цим ID і відповідність усіх 19 persisted fields, включно з CreatedAt. Порожні optional cells та стандартні IsActive/Comment defaults порівнюються у єдиній фізичній формі. Це не lookup за одним Code і не перевірка відсутності BOM.

## Durable intent і мінімальне розширення 1H.3B

Збережено шість колонок журналу, manifest version 1, події та O ↔ O_BOM. Для нових INSERT_INTENT/REUSED `OP_FRAME` додатково містить `retryPayload`: точний canonical serialized event. Це дозволяє retry відновити подію, якщо frame зберігся, а chunks або acknowledgment — ні. Frame захищений чинним digest chain; повторний payload також перевіряється за event digest і prefix chunks.

Canonical identity event обмежений 18 000 UTF-16 units; serialized frame має вкладатися у 20 000. Завеликий event відхиляється до append frame, без truncation чи Element insert. Уже зарезервований ID у такому випадку може залишитися пропущеним. INITIALIZED manifest продовжує підтримувати багаточастинні великі плани.

Оригінальні frames без retryPayload залишаються читабельними. Якщо старий незавершений intent містить усі chunks, він відновлюється; якщо canonical payload відсутній, потрібно повторити початковий точний event із trusted даними. Вигадувати row або reservedID за hash заборонено. Repair RESERVING і CREATED використовує стабільні event IDs та durable evidence; CREATED завжди повторно проходить physical verifier.

Coordinator використовує стабільні IDs `reserve:<localKey>`, `intent:<localKey>`, `created:<localKey>`, `reuse:<localKey>`. Інші producers повинні зберігати власні точні event IDs/payloads для retry. `repairCreationTail()` не обходить reducer або перевірку цілісності.

## Сценарії recovery

| Durable/physical стан | Поведінка retry |
| --- | --- |
| RESERVING, без intent | Fresh lookup; REUSED або нова monotonic reservation, без вставки до durable intent. |
| Незавершений новий INSERT_INTENT frame/chunks | Відновлення точного event через protected retryPayload; readback intent; лише потім insert. |
| INSERT_INTENT, reservedID відсутній, identity вільна | Insert із тим самим ID і CreatedAt, без нової reservation. |
| INSERT_INTENT, exact physical row існує | Fresh verification → CREATED; повторного insert немає. |
| ReservedID зайнятий іншим row / duplicate ID / foreign identity | CONFLICT; чужа сутність не привласнюється, BOM не ініціалізується. |
| CREATED acknowledgment втрачений | Repair/retry тієї самої події з fresh verification; event не дублюється. |
| CREATED завершений | Fresh verification, ALREADY_APPLIED, без нового ID/insert. |
| REUSED | Fresh identity confirmation; характеристики і BOM існуючої сутності не змінюються, CREATED receipt відсутній. |

API result CONFLICT не дорівнює автоматично terminal journal CONFLICT. Він також використовується для невідомого результату persistence або тимчасового збою; повтор того самого рішення дозволений. Durable terminal conflict рішення залишається відповідальністю майбутнього orchestrator/operator.

## Trusted CREATED receipts

Production factory налаштовує CreationVerifier на uncached MASTER readback. `confirmCreated()` отримує durable intent та його зв'язок із operation; точний physical row і відсутність суперечливих кандидатів є необхідними умовами CREATED.

`RecoverableElementCreation.receipts(O)` додатково перевіряє physical rows усіх CREATED Elements перед отриманням journal receipts. Повертаються лише нові CREATED матеріальні Parts у погодженому initialization scope, з operationID O_BOM. REUSED і звичайний root receipt не отримують. Receipt не означає, що BOM уже записаний. Після збою до writer ці receipts доступні для наступної фази.

Матеріальна Part залишається самостійною сутністю. Її повторне використання іншим Product не змінює ProjectDocumentID, характеристики або BOM. Старі Parts не видаляються, orphan cleanup і cascading operations відсутні. Product coordinator додатково блокує створення проєктної дочірньої сутності поза root/material initialization scope.

## Перевірки

- Релевантні Vitest: **167 passed** — 37 coordinator + 37 journal + 43 writer + 50 ID.
- Targeted strict TypeScript `--noEmit`: **passed**.
- `npm run build`: **passed**.
- Загальний `npx vitest run`: **390 passed / 3 відомі legacy failures**; baseline 349 / 3. Попередні тести не вимикалися.
- Legacy failures незмінні: `bom-material-matrix.integration.test.ts`, `bom-materials.service.test.ts`, `project-material-matrix.integration.test.ts`; очікуваний Material 3201 відсутній у результатах.
- `git diff --check`: **passed**.

Регресії перевіряють reservation gap, crash before/after insert, lost intent/CREATED/REUSED acknowledgment, duplicate identities/IDs, physical mismatch, historical ID reuse, Product/Assembly/Part roots, document identity, Product project-child restriction, oversized event refusal, receipt gates, lock timeout/finally/nesting, internal writer recovery та збереження foreign BOM. Coordinator mocks забороняють будь-який доступ до 01_BOM або active Spreadsheet.

## Залишкові ризики та контракт 1H.3E

1. Coordinator обробляє один pending localKey. Fresh revalidation усіх existing/project/material references і канонічних Materials до першого Element side effect має виконати 1H.3E; цей slice не реалізує його.
2. До lock protocol cooperating writers і receipts належить server-side trusted code. Exact durable intent/readback не є криптографічним доказом проти ручного підроблення row разом із журналом.
3. Manual edits або інший Apps Script можуть змінити дані між read і write. Такі втручання не блокуються ScriptLock; mismatch виявляється наступною перевіркою, але гарантії атомарності щодо них немає.
4. Legacy route лишається активним; до production інтеграції потрібно закрити його обходи. У цьому slice форму не змінено.
5. Physical schema перевірена mocks, а не live MASTER. Перед deploy потрібна окрема погоджена перевірка заголовків і optional/default fields.
6. Для 1H.3E потрібні: caller-owned outer lock; fresh business revalidator; durable begin/retry із тим самим O/input; `create(O, localKey)` для всіх pending; mapping pending→existing IDs зі стану; `receipts(O)`; перетворення plannedEdges/writeScope у physical SafeBOMPlan; `writeSafeBOMUnderLock/recoverSafeBOMUnderLock`; перевірений writer outcome і journal completion. Існуючі дочірні BOM не входять у scope.

Роботу зупинено перед реалізацією повного Safe Commit та підключенням до форми.
