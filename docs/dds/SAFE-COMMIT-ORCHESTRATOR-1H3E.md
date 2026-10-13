# ERP КУБ — Safe Commit Orchestrator — Slice 1H.3E

Дата: 2026-10-13. Перевірена база HEAD: `3421e9f`. Baseline: 434 passed / 3 відомі legacy failures.

## 1. Архітектура та точки інтеграції

Реалізовано trusted server-side application module `src/modules/bom/commit/safe-commit.service.ts`. Послідовність:

`one ScriptLock → fresh context → Prepare/preflight → durable manifest/READY → pending Element resolution → BOM_READY → immutable BOM_PLANNED → internal Safe Writer/recovery → physical verification → COMPLETED → finally release`.

Service об'єднує чинні Prepare, CommitOperationJournal, RecoverableElementCreation, physical mapper та internal Safe Writer. Нового writer, генератора або дубльованого Prepare немає. Модуль не імпортований у `src/index.ts`, робочі форми чи чинні GAS entrypoints; довільного нового GAS endpoint не створено.

Нові файли:

- `src/modules/bom/commit/safe-commit.service.ts`: SafeCommitService, commitBOM()/resumeBOMCommit(), result contract, validation та orchestration.
- `src/modules/bom/commit/fresh-commit-context.ts`: uncached MASTER preparation dependencies і validation fingerprints.
- `src/modules/bom/tests/safe-commit.service.test.ts`: 43 integration/crash regressions із реальними модулями та GAS mocks.

Мінімально розширено:

- `commit-operation.model.ts`: optional validationContext, BOM_PLANNED event, bomPlan/bomSnapshotDigest у state.
- `commit-operation-journal.ts`: hasOperation(), peek(), restore(), immutable bomPlanned(); перевірка context digest; retryPayload для малих загальних подій.
- `fresh-element-store.ts`: read-only validateWritable().
- `recoverable-element-creation.ts`: експорт чинних identity/verification helpers для спільної fresh validation.
- `safe-bom-writer.ts`: normalizePlan(), inspectSafeBOMUnderLock(), readSafeBOMSnapshotUnderLock(), preflightSafeBOMPlanUnderLock(); спільний plannedSlots(). Алгоритм фізичного запису, recovery і public lock APIs збережені.

Product Policy/Prepare semantics, ID generator/ranges, BOMExpansion, MaterialFlow/Requirement, Accepted DDS/ADR, форми, legacy route та MIGRATION-VERIFICATION.md не змінені.

## 2. Application API

`commitBOM(input, operationID)` починає нову операцію або повторює існуючу. `resumeBOMCommit(operationID)` використовує лише durable input і PreparedBOM; нового Prepare для наявного manifest немає.

Input — BOMPreparationInput плюс optional `commentChanges: { parentID, childID, unit, comment }[]`. Explicit comments є частиною immutable input digest. Для нових зв'язків без зміни Comment порожній; чинні comments зберігаються за logical edge. Явна зміна підтримує також порожній string для очищення.

Результат:

| status | Значення |
| --- | --- |
| COMMITTED | Фізичний target підтверджений writer, загальна операція завершена. Включає успішний roll-forward recovery. |
| ALREADY_APPLIED | Ідентичний фізичний результат уже підтверджений; Elements/Qty повторно не створюються й не накопичуються. |
| RECOVERY_REQUIRED | Технічний збій/timeout або незавершений persistence; потрібна повторна спроба з тим самим O. |
| CONFLICT | Інший input для O, identity/context/snapshot/provenance conflict або недостатні докази безпечного продовження. |
| VALIDATION_ERROR | Новий input або preflight не пройшли до reservation/creation/BOM writes. |

Success повертає rootID та localIDs — confirmed localKey→real ID. Prepare diagnostics доступні як typed diagnostics та error; інші failures мають error. API не повертає клієнту право довільно сформувати CREATED receipt або physical scope.

O має стабільний допустимий формат, суфікс `_BOM` зарезервований. Повтор O з іншою специфікацією або comment change відхиляється до зміни journal. Для нового запиту потрібен новий OperationID.

## 3. Fresh revalidation та preflight

Production context створює нові repositories, без cached application factories:

- Elements: MasterFreshElementStore, physical 00_Elements read та mapElementRowToDomain.
- Catalog: GoogleSheetsCatalogDataSource → новий CatalogInMemoryRepository; неоднозначні template matches відхиляються.
- Materials: GoogleSheetsMaterialDataSource → новий MaterialRepository; дубльовані IDs/normalized Codes блокуються.
- Document context: новий dependency datasource/repository/resolver для 21_ProjectDocumentDependencies.

Локальний MasterSheets provider перевіряє SpreadsheetKey.MASTER і відкриває SpreadsheetProvider явно. Active Spreadsheet не використовується. Validation context містить SHA-256 digest усіх mapped Materials, усіх Catalog items та resolved ordered document list. Context повторно читається після нового Prepare до begin; зміна блокує операцію без власних side effects.

Для resume fingerprints звіряються зі збереженим manifest. Це консервативний захист: навіть зміна не пов'язаного Catalog/Material item може вимагати conflict resolution; service не перепідготовлює й не підміняє первісний план.

Existing refs перевіряються за exact ID, Code, Type, document/material identity, BaseUnit, Category, profile/class, геометрією та IsActive; дублікати candidates і Element/Material ID collisions блокуються. Для pending material/project identities використовуються ті самі helpers, що coordinator. Own intent/CREATED перевіряються за fresh exact physical row. REUSED не отримує ownership. Усі references/pending перевіряються до першого нового Element у поточній спробі.

Preflight перевіряє writable Elements schema, BOM/journal headers, values/formulas/merged cells, mapping/comment ambiguity, initialization scope та journal-reserved append positions. Counter preflight читає MASTER, валідні occupied IDs та Type/LastID, симулює незмінний calculateNextId для всіх ще потрібних reservations без запису counters. INSERT_INTENT і REUSED не потребують нової reservation. Provisional mapping IDs — внутрішні унікальні validation placeholders; вони не зберігаються в manifest чи writer targets і не є виданими IDs.

Помилка будь-якого нового рядка Prepare, schema або доступного precondition не створює Element, не резервує ID і не змінює BOM. Partial journal, який уже існував до retry, не очищується.

## 4. ScriptLock

Service захоплює ScriptLock один раз через withScriptLock(), звільняє у finally при success, conflict, exception і помилці відкриття MASTER. Timeout не release незахоплений lock. Nested public acquisition відхиляється.

Усі внутрішні операції використовують цей самий lock: журнал, фізичний store, generateIdByTypeUnderLock через coordinator, writer/recovery та їхні preflight readers. Public ID/Safe Writer wrappers не викликаються. Числові правила ID не змінені.

Lock координує cooperating callers одного Apps Script-проєкту; manual Sheets edits, сторонні проєкти та legacy callers поза цим протоколом не блокуються.

## 5. Elements та localKeys

Після durable READY кожний pending localKey обробляє RecoverableElementCreation. Порядок і canonical rows беруться із saved PreparedBOM. Durable intent повторно використовує той самий ID/CreatedAt; після uncertain insert fresh readback підтверджує exact row, без повторного insert. Reservation, яка не потрапила у durable intent, може залишити gap; rollback/recycling відсутні.

Якщо compatible Part з'явилася до власного INSERT_INTENT, вона стає REUSED. Наявність або відсутність її BOM не є доказом ownership. Якщо вона не має BOM, service не ініціалізує його. Якщо її BOM існує, він зберігається. Після власного intent foreign candidate або reservedID mismatch блокує операцію.

CREATED receipts отримуються лише після physical verification і лише для material Parts у initialization scope. Root, project children й REUSED не отримують додаткового права запису. Нові Materials не створюються. Existing характеристики/ProjectDocumentID, старі Parts і orphan Parts не модифікуються та не видаляються.

## 6. Mapping та writeScope

Mapping виконується зі fresh physical snapshot під тим самим lock. Target — сім value-only колонок:

`ParentID | ChildID | Qty | Unit | Comment | ParentCode | ChildCode`.

Pending refs замінені confirmed real IDs; Codes узяті з verified bindings. Scope містить лише root і receipt-authorized власні CREATED material Parts. Planned outgoing edge REUSED Part виключається. Повторення Parent→Part агреговане Prepare, Part→Material лишається per-unit consumption.

До writer durable записується BOM_PLANNED: immutable SafeBOMPlan та digest physical snapshot. Якщо writer ще не почався, зміна snapshot після mapping блокує старий target — він не записується поверх новішої специфікації. Після початку O_BOM service порівнює stored writer plan з general bomPlan й викликає тільки recoverSafeBOMUnderLock(). Нового mapping замість writer target немає.

BOM_PLANNED також фіксує no-op: writeSafeBOM може повернути ALREADY_APPLIED без власного writer journal. Повтор завершеної такої операції тільки читає та звіряє scoped target; він не може відновити стару специфікацію поверх нової.

Foreign ParentID rows, comments/codes, duplicates, positions та старі Part BOM захищені чинним stable-slot writer/fingerprint. Глобальні clearContents/dedup/delete/orphan cleanup не викликаються.

## 7. Durable protocol і crash recovery

Шість journal columns, versioned manifest, hash chains/chunks, O/O_BOM separation та public writer contracts збережені. Optional validationContext і BOM_PLANNED — additive protocol extension, перевірений reducer. Старі manifests без fingerprints залишаються читабельними, але orchestrator не привласнює їм відсутні докази: resume повертає CONFLICT до ручного погодженого розв'язання.

Малі general events отримують protected retryPayload у frame; identity events зберігають обмеження 1H.3C. INITIALIZED/READY/BOM_READY/BOM_PLANNED/COMPLETED можуть завершитися після втрати acknowledgment без дублювання event. CREATED repairs завжди використовують trusted verifier.

Для великого initial frame без durable manifest payload `resume(O)` не вигадує input: RECOVERY_REQUIRED. `commitBOM(originalInput, O)` може повторити fresh Prepare тільки доки INITIALIZED ще не durable; початковий frame digest вимагає точної рівності plan/context перед persistence. Для великого partial BOM_PLANNED без повного payload можливе exact replay із saved PreparedBOM та fresh snapshot, тільки якщо O_BOM ще не почався; digest початкового frame відхиляє будь-яку зміну target. Збережений план не підміняється.

| Точка збою | Recovery |
| --- | --- |
| До durable manifest | Original input retry; без reservation/Element/BOM changes. |
| Після manifest/READY | Fresh identity/context checks; continuation saved plan. |
| Reservation до intent | Gap допускається; наступна monotonic reservation, без recycling. |
| Intent до insert | Same ID/row; conflict checks перед insert. |
| Insert до CREATED | Physical verification; CREATED без нового insert. |
| CREATED до mapping | Own provenance збережена; initial Part→Material ще дозволений лише власній Part. |
| BOM_READY/target до writer | Exact event repair; immutable target/snapshot gate. |
| Під час BOM write | Stored O_BOM recovery, без нового mapping. |
| Після write до completion | Writer readback/recovery → general completion. |
| Completion до відповіді | ALREADY_APPLIED після verification, без нових IDs/Elements/BOM writes. |

Technical persistence result не перетворюється автоматично на terminal journal CONFLICT. Corruption/identity conflict не виправляються видаленням рядків чи обходом digest.

## 8. Перевірки

- Нові integration tests: **43 passed**.
- Релевантні Vitest (service, Prepare, journal, creation, mapper, writer, ID): **317 passed**.
- Повний `npx vitest run`: **477 passed / 3 відомі legacy failures**.
- Незмінні legacy failures: `bom-material-matrix.integration.test.ts`, `bom-materials.service.test.ts`, `project-material-matrix.integration.test.ts`; відсутній очікуваний Material 3201.
- Targeted strict TypeScript `--noEmit`: **passed**.
- `npm run build`: **passed**.
- `git diff --check`: **passed**.

Перевірені нові/існуючі Product, Assembly, Part; repeat/no-op; Qty/Part replacement; explicit/preserved Comment; schema/Prepare errors без змін; Material/Catalog/document conflicts; context change після Prepare; чужа Part без BOM; own CREATED Part без initial BOM; slot/foreign preservation; original input conflict; cooperating reuse; timeout/nested lock; усі перелічені crash boundaries, partial physical write та великі frame retries. Окремий тест виконує production fresh factory і default service на MASTER-only mocks. Попередні тести не вимикалися.

## 9. Залишкові ризики

1. Немає атомарної транзакції із зовнішніми редакторами. Snapshot/context/identity guards виявляють зміни на перевірених межах, але ScriptLock не може заборонити manual edits між фізичними calls.
2. Side effects після durable READY можуть залишити самостійні Elements при технічному збої. Їх не видаляють: recovery потребує того самого O і збережених journal records.
3. Чинний Safe Writer відмовляє при неповному/пошкодженому O_BOM payload до READY. Загальний orchestrator не реконструює невідомий physical before snapshot і не обходить digest. Такий стан потребує контрольованого recovery/conflict resolution; BOM не пишеться до READY.
4. Fingerprints Catalog/Materials консервативні й охоплюють усі mapped rows, а не тільки input refs. Зміни можуть блокувати стару операцію навіть при незміненому потрібному компоненті.
5. Journal retention, sheet capacity, live schema acceptance та доступ до MASTER лишаються deployment prerequisites. Нового службового аркуша немає, journal не створюється автоматично.
6. Application API довіряє server composition; injected context не повинен прийматися від клієнта. Digest — integrity check, а не signature проти підроблення Sheets/journal власником доступу.

## 10. Для Slice 1H.3F

Погоджене підключення форм до одного trusted server entrypoint: stable OperationID lifecycle; typed diagnostics/success/conflict/recovery UI; explicit comment handling; resume без нового O; closure/removal legacy save bypasses; GAS acceptance на реальній схемі й даних. Public endpoint не повинен приймати довільні PreparedBOM, receipts, bindings або SafeBOMPlan.

У цьому slice форми та entrypoints не змінені. Реальні GAS writes/Sheets calls, зміни MASTER/Master-10, commit, clasp push/deploy і зміни MIGRATION-VERIFICATION.md не виконувалися. Роботу зупинено для перевірки власником ERP.
