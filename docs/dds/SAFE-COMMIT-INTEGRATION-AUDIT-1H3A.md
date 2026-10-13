# ERP КУБ — Safe Commit Integration Audit, Slice 1H.3A

## Висновок і межі аудиту

Перевірена база: `5f48b07`. Safe Commit ще не можна безпечно підключити простим викликом Prepare → getOrCreate → Safe Writer. Основні розриви: відсутність durable provenance до створення Elements; окремі lock wrappers; несумісність формул у core BOM columns; порожні stable slots у legacy reader; відкритий legacy записувальний маршрут.

Це статичний аудит локального коду. Реальні заголовки/формули MASTER не читалися й не підтверджені. Змінено лише цей звіт. Production-код, тести, Accepted DDS/ADR, MIGRATION-VERIFICATION.md, MASTER і Master-10 не змінено. Build, тести, GAS-функції, створення службового аркуша, commit і deploy не виконувалися.

## 1. Поточний маршрут і місця інтеграції

| Етап | Файл / функція | Контракт і побічні ефекти |
|---|---|---|
| Відкриття | `src/main.ts:onOpen`, `src/ui/openForm.ts:openFormTable` | Меню відкриває sidebar FormTable |
| Введення | `html/FormTable.html:submit` | Викликає runTableParser(documentID, parentCode, text); має success alert, не має failure handler або OperationID |
| Application entry | `src/index.ts:runTableParser` | Отримує cached repositories, parseParent/parseTableText, викликає buildBOMFromTable |
| Альтернативний entry | `html/Form.html`, `src/modules/bom/bom.service.ts:buildBOMFromText` | Передає object input; отримує ті самі factories; document context не передається через цей input |
| Root | `src/modules/elements/root-element.service.ts:getOrCreateRootElement` | Lookup → Catalog → generateIdByType → insert; root створюється до перевірки компонентів |
| Компоненти | `src/modules/bom/bom.service.ts:buildBOMRow` | Existing Element → canonical Material → parse/build → getOrCreateElementFromBuilt; може створити Part до перевірки weightPerMeter |
| Creation | `src/modules/elements/element.factory.ts:getOrCreateElementFromBuilt` | Identity lookup, reservation, insert, перевірка через локальний кеш |
| Старий запис | `src/modules/bom/bom.service.ts:buildBOMFromTable` | Ловить row errors, все одно aggregateBOMRows → replaceBOMForParent |
| Legacy writer | `src/modules/bom/bom.repository.ts:replaceBOMForParent` | Глобальний deduplication, clearContents і повний setValues |
| Postcheck | `src/modules/bom/services/bom-completeness-checker.ts:BOMCompletenessChecker.check` | Перевірка після запису; не є транзакцією або точним порівнянням input/target |
| Новий Prepare | `src/modules/bom/preparation/bom-preparation.service.ts:prepareBOM` | Read-only module API, ще не викликається формою |
| Новий writer | `src/modules/bom/commit/safe-bom-writer.ts:writeSafeBOM/recoverSafeBOM` | Module API, не підключений до робочого маршруту |

Після інтеграції runTableParser і buildBOMFromText мають делегувати одному application orchestrator; старий виклик buildBOMFromTable із цих entrypoints потрібно прибрати/закрити. Не залишати старий шлях доступним паралельно як альтернативний save. У bom.repository.ts є також insertBOMRows/deleteBOMByParentId/deleteBOMTree: фактичних runtime викликів з основного save не виявлено, але їх треба інвентаризувати й не дозволяти як обхід нового lock/protocol. Публічні GAS entrypoints визначаються також експортами src/index.ts.

## 2. Fresh revalidation

PreparedBOM містить rootType, sourceContext, components.identity, pending rows та writeScope (`bom-preparation.model.ts`). Це план зі snapshot даних, не доказ їх актуальності.

`app/factories/element.factory.ts`, material.factory.ts, catalog.factory.ts і project-document-dependency.factory.ts кешують in-memory repositories. `GoogleSheetsElementRepository` завантажує rows у конструкторі, після insert додає row у власний кеш; findById після insert не є фізичним readback. `app/factories/bom-expansion.factory.ts` також бере cached Elements/Catalog, хоча Materials читає заново.

Рекомендація: спеціальна fresh composition для Commit під outer lock, без використання цих cached factories як джерела істини. Створити новий GoogleSheetsElementRepository, нові CatalogInMemoryRepository/MaterialRepository з GoogleSheetsCatalogDataSource/GoogleSheetsMaterialDataSource.getRows та fresh dependency repository/resolver через чинний SheetProvider. Registry може кешувати handle Spreadsheet; важливо перечитати rows, а не лише відкрити handle повторно. Для Elements readback після insert використовувати новий repository instance або окремий fresh reader.

До будь-якого reservation/creation:

- сервер повторно prepareBOM(sourceContext) на fresh dependencies;
- звірити request digest, root Type/identity, documents/dependencies;
- project Parts/Assemblies — Code/Type/document context і неоднозначність;
- material Parts — canonical MaterialID, normalized Code, profile/geometry/class і всі кандидати;
- прямі Materials — canonical identity/unit;
- BOM/journal schema, permissions/preconditions і physical mapping мають бути перевірені до створення Elements.

Правила перевірки вже реалізовані у `bom-preparation.service.ts:projectElement`, material candidate branch і MaterialResolver. Не дублювати їх у legacy factories. Якщо input уже частково застосовано, fresh Prepare не повинен знищувати operation history: його newly-existing Part може бути власною незавершеною Part операції. Спочатку завантажується durable operation state, потім перевіряються актуальні дані. Зміна identity або material norms після початку creation — CONFLICT, а не мовчазна заміна первісного плану.

## 3. OperationID і відновлення створення Elements

### Підтверджений розрив

`safe-bom-writer.ts:SafeBOMPlan.createdParts` — передані `{id, operationID}` receipts. Writer перевіряє форму й відповідність scope та відсутність existing Part BOM, але не перевіряє provenance Elements. Журнал writer починається в `CommitJournal.save()` після отримання готових real IDs. Він не знає localKey, reservation, insert intent або фактичного readback.

Відсутність Part→Material НЕ доводить, що Part створена цією операцією. Така Part могла існувати раніше, бути створена іншою операцією або мати пошкоджений BOM. Повторний Prepare сам по собі не відновлює provenance.

### Мінімальна доказова послідовність

OperationID стабільний для повторного запуску, генерується/приймається сервером із перевіркою формату й прив'язкою до immutable request digest. Інший input із тією самою OperationID — CONFLICT. localKey не є глобальною бізнес-ідентичністю.

До першого reservation/creation durable зберегти:

- версію протоколу, OperationID, request/sourceContext digest і root identity;
- перевірений план, material identity/norms/geometry та per-Part initial material edge;
- результати fresh lookup: existing references або absence для pending identities;
- правила scope, mapping policy/version, timestamps і журнал станів;
- однозначний зв'язок між загальною операцією та її BOM writer phase.

Для кожного відсутнього Element під тим самим lock:

1. Fresh uniqueness lookup; existing → REUSED, без reservation і права initial BOM.
2. Durable RESERVING(localKey/identity), потім reservation через internal allocator.
3. Durable INSERT_INTENT(localKey, reservedID, повний canonical ElementRow, CreatedAt), flush/readback підтвердження. Без підтвердженого intent insert заборонений.
4. insert Element.
5. Fresh physical readback за reservedID і повною identity/geometry; потім durable CREATED receipt.

Після збою між insert і CREATED retry використовує INSERT_INTENT: під lock читає саме reservedID, перевіряє повний row і відсутність конкуруючої identity. Exact row → підтверджує CREATED; row відсутній → повторює insert того самого зарезервованого ID лише за підтвердженим intent/відсутністю колізії; інший row або дублікати → CONFLICT. Заборонено доводити авторство лише Code або відсутністю BOM.

Це доказовий протокол для cooperating callers. Ручний автор або інший script project можуть створити row у тому самому вікні; ScriptLock цього не виключає. Тому receipts допустимі лише від trusted orchestration із durable intent і fresh readback; зовнішні конфлікти мають блокувати автоматичне присвоєння ownership. Абсолютне авторство при навмисній підробці exact row без provenance column не доводиться.

### Точки збою

| Точка | Recovery |
|---|---|
| До reservation | Перевірити durable input/plan, повторити fresh lookup |
| Reservation виконано, ID ще не занесено durable | ID вважається витраченим; Elements ще не вставлялися. Нове reservation допустиме, LastID назад не повертати |
| INSERT_INTENT підтверджено, insert не почато | Fresh lookup reservedID/identity; вставити лише за відсутності конфлікту |
| insert фактично виконано, readback/CREATED не підтверджено | Зіставити reservedID із повним intent, підтвердити CREATED або CONFLICT |
| CREATED підтверджено, BOM ще не почато | Власна Part без BOM може отримати initial edge за durable receipt; чужа existing Part — ні |
| Writer почався | Завантажити його persisted plan і recoverSafeBOM; не перегенеровувати IDs чи target із нового Prepare |
| BOM записано, відповідь втрачена | Використати durable verification/result; не повторювати stale save автоматично |

Старі/orphan Parts залишаються незалежними сутностями. Не видаляти їх, їхні BOM або характеристики для recovery.

## 4. Розширення журналу без нової таблиці

Поточні фізичні headers `_BOM_CommitJournal`: OperationID, Kind, Sequence, Payload, Digest, UpdatedAt (`safe-bom-writer.ts:JOURNAL_HEADERS`). Цього контейнера достатньо для нового protocol payload, але чинний loader — тільки для writer: очікує META, CHUNK, READY та Payload version 1. Додавати creation events під ту саму writer OperationID без адаптації не можна.

Мінімальний варіант без ламання старого loader:

- загальна транзакція O має окремі append-only records у цьому ж аркуші;
- writer phase має детерміновану ID, наприклад O_BOM;
- transaction manifest durable прив'язує O ↔ O_BOM і request digest;
- shared журнал primitives для chunks/hash/readback витягнути з private CommitJournal, зі збереженням його чинного writer protocol;
- creation receipts для SafeBOMPlan виробляє тільки trusted adapter, який перевірив creation evidence O та його прив'язку до O_BOM.

Потрібні event states validated/precreation-ready/reserving/insert-intent/created/reused/writer-ready/done/conflict. Вони мають бути явно версійовані, не змішуватися зі станами writer і не приймати довільні клієнтські receipts. Snapshot/hash completeness підтвердити до незворотних дій.

Особливий випадок retry: якщо Part створена іншою операцією, її localKey remap до existing ID, outgoing edge і initialize scope прибираються. Якщо це власна CREATED Part, initial edge відновлюється з durable первісного плану, а не втрачається через fresh Prepare. Якщо її BOM уже відповідає initial target, не перезаписувати його; адаптер має перевірити й виключити завершену initialization перед першим writer save. Якщо writer journal уже існує, відновлювати саме його request, не міняти scope на льоту.

Термінальний writer також перевіряє foreignDigest. Пізніші незалежні зміни інших ParentID можуть дати CONFLICT навіть якщо root target незмінний. Orchestrator має розрізняти historical confirmed success і поточний стан; не повторно застосовувати стару операцію поверх нового складу.

## 5. Один протокол ScriptLock

Факти:

- `src/utils/id.ts:generateIdByType` сам отримує ScriptLock, читає/змінює counters, flush, release у finally.
- `safe-bom-writer.ts:withLock` сам отримує ScriptLock і прямо відхиляє already-held lock.
- `ElementRepository.insert` lock не отримує; бізнес-унікальність не забезпечує.

Просто обгорнути наявні public calls в outer ScriptLock неможливо: writer відхилить виклик, generator не має контракту використання caller-owned lock. Послідовні public locks із незахищеним lookup/insert залишають race для дубльованих Parts.

Рекомендовано один outer ScriptLock для server fresh revalidation → journal → lookup/reservation/insert/readback → writer journal/write/verify. Public wrappers generator/writer зберегти, але виділити internal reserve/write/recover під already-held lock із явною перевіркою ownership/hasLock. Internal функції не acquire/release; єдиний owner release у finally. Не використовувати hasLock як універсальний прапорець, що дозволяє будь-якому caller обійти public protection.

Під час retry під тим самим lock читати operation state й fresh Elements до будь-якого insert. Cooperation має включати всі активні creation/save entrypoints. Ручні правки й інші проєкти не блокуються; conflict detection і deployment policy залишаються обов'язковими. Для дуже великих operations потрібні quota/load tests; не розривати lock на проміжні фази без durable ownership протоколу.

## 6. Сумісність physical 01_BOM

### Підтверджено кодом

Writer вимагає перші сім headers у точному порядку: ParentID, ChildID, Qty, Unit, CreatedAt, ParentCode, ChildCode. Extra headers мають бути унікальними/непорожніми; targetRows — повної ширини. Cell підтримує literal, tagged date і tagged formula. Formulas у БУДЬ-ЯКІЙ core column, зокрема ParentCode/ChildCode, відхиляються і при readBOM, і при normalizePlan. Extra formulas підтримуються як expressions, не як calculated values. Merged cells блокуються.

PreparedBOM не містить physical extra fields, formulas, CreatedAt або повної target matrix. Adapter має отримати фактичну схему й поточні physical rows, зіставити існуючі edges за identity, зберегти значущі extra cells/formulas та явно визначити template для нових rows. Не копіювати extra columns довільно за позицією рядка іншого ChildID. Кожний значущий unmapped field — blocker до creation/write.

Фактичну схему MASTER локально не підтверджено. Якщо ParentCode/ChildCode містять формули, поточний writer непридатний для цієї схеми. Потрібен окремий mapping/profile і row-relative formula policy; не перетворювати їх на literals мовчки. Array/spill formulas, external references, protected/merged ranges і запас фізичних рядків також потребують read-only schema inspection перед інтеграцією.

### Порожні stable slots

`bom.repository.ts:getAllBOMRows` не фільтрує пусті rows: повертає parentId='', childId='', qty=0, unit=''. getChildrenRows/getParentsRows з нормальними IDs їх не вибирають, але загальні consumers отримують ці псевдозв'язки. `bom-expansion.service.ts` ігнорує parentId, який normalizeReferenceId перетворює на null; це не означає сумісність усіх consumers.

Потрібно пропускати лише повністю порожні фізичні rows у read layer; частково заповнені/пошкоджені rows не приховувати. Stable slots не стискати й не видаляти: journal використовує номери physical rows.

### Legacy writer

`replaceBOMForParent` глобально прибирає дублікати, clearContents/setValues перезаписує всю таблицю; він може пошкодити foreign rows, формули, stable slot positions і journal recovery. Він не використовує ScriptLock. Одночасна доступність старого та нового save не допускається після rollout. Інші destructive helper writers також не повинні обходити новий protocol.

Safe Writer зберігає foreign rows і їх позиції, включно з дублями, та перевіряє digest. Manual row inserts/deletes/sorts між write і recovery спричиняють CONFLICT. Формули збережено як expressions; natural recalculation не є literal cell overwrite, але spill-залежності потребують окремої перевірки.

## 7. Мінімальні implementation slices

### 1H.3B — Journal pre-creation protocol

Контракт: durable transaction O, input digest, versioned plan, identity evidence, INSERT_INTENT/CREATED/REUSED, mapping до O_BOM; shared integrity/readback primitives. Файли: нові `src/modules/bom/commit/commit-operation-journal.ts`, model та tests; extraction private CommitJournal з safe-bom-writer.ts без зміни public behavior.

Тести: обірвані META/chunks/events, corruption, duplicate OperationID з іншим input, чужий creation receipt, reservation/intent transition validation. Приймання: incomplete records ніколи не дозволяють creation; creation events не ламають writer loader. Залежність: погодження protocol/protection журналу.

### 1H.3C — Lock ownership і recoverable Element creation

Контракт: outer lock owner, internal allocator/writer/recovery, ensureElement(intent) з fresh lookup/readback. Файли: utils/id.ts для internal allocator, safe-bom-writer.ts для held-lock core, ElementRepository або новий fresh reader, новий element-creation coordinator і tests. Числові правила генератора не змінювати.

Тести: reservation gap, insert до readback, CREATED append failure, повтор same operation, duplicate identity, два competing operations, timeout/finally release, відсутність nested lock. Приймання: жодного insert без durable intent; повтор не створює дублікат; лише verified own creation видає initial-BOM receipt. Залежність: 1H.3B; external writers залишаються поза гарантіями.

### 1H.3D — Physical BOM mapping і stable-slot reader

Контракт: schema profile, real-ID/full-width target mapper, preservation extra fields/formulas, explicit UnsupportedSchema; reader пропускає fully blank rows. Файли: новий bom-target-row.mapper.ts/schema profile, bom.repository.ts:getAllBOMRows, safe writer mapping guards за потреби, нові tests. Resolver/Expansion rules не переробляти.

Тести: реальний погоджений порядок headers, ParentCode/ChildCode formulas якщо наявні, extra formulas, blank/interleaved slots, partial corrupted row, width mismatch, preservation foreign duplicates. Приймання: schema/mapping preflight до створення Elements; жодної мовчазної втрати formulas/extra data. Блокер: фактичний schema snapshot MASTER ще відсутній. Цей slice можна дослідити незалежно від creation coordinator.

### 1H.3E — Safe Commit orchestrator та crash recovery

Контракт: commitBOM(input, operationID), resume(operationID), structured committed/already-applied/recovery-required/conflict результат. Файли: новий safe-commit.service.ts, fresh dependency factory, інтеграційні tests. Форму поки не перемикати.

Тести: повна revalidation до mutations, changed Material/Catalog/docs, власна Part без material BOM, чужа Part без BOM, pending→existing remap, old Part preservation, root scope, writer crashes, lost web acknowledgement, повтор completed операції після новішої зміни. Приймання: recovery усіх відомих фаз без дублювання Elements і без rewrite чужої Part; неуспішний Prepare не змінює MASTER; IDs не rollback/reuse. Залежності: 1H.3B–D.

### 1H.3F — Entry/UI cutover і quarantine legacy writers

Контракт: один server orchestration entry, стабільний OperationID до завершення retry, status/recovery endpoint, видимі row errors/conflicts. Файли: src/index.ts, html/FormTable.html, html/Form.html, bom.service.ts wrappers/доступність legacy route, entry tests. Не тримати success-only alert як єдиний результат.

Тести: подвійне натискання, refresh/retry тієї самої OperationID, response loss, failure handler, старі entrypoints не обходять Safe Commit, інша active Spreadsheet, два паралельні submissions. Приймання: legacy destructive save недоступний після cutover; UI не показує Prepare як saved і не маскує recovery-required. Залежність: end-to-end приймання попередніх slices, окреме погодження службового аркуша та deploy.

## 8. Порядок погодження й перевірок перед rollout

1. Погодити creation provenance/intent protocol та scope receipts, включно з reservation gap і власною незавершеною Part.
2. Отримати дозволений read-only schema snapshot 01_BOM; встановити наявність core/extra formulas, merges, capacity та permissions. До цього не заявляти physical adapter готовим до MASTER.
3. Реалізувати й прийняти 1H.3B–D; потім orchestrator із crash injection tests.
4. Перевірити no-op/retry, збереження old Parts і foreign ParentID, відсутність cascade/orphan cleanup та незмінність LastID після failure.
5. Погодити cutover усіх mutation entrypoints і UI, а вже потім створення службового аркуша/контрольні GAS writes/deploy окремим дозволом.

У цьому аудиті змінено лише `docs/dds/SAFE-COMMIT-INTEGRATION-AUDIT-1H3A.md`. Реалізацію Safe Commit не розпочато.
