# ERP КУБ — Slice 1H.2D: Safe BOM Writer + Durable Commit Journal

База `15ec0fb`. Реалізовано локальний module API, не підключений до форми або старого writer. Живі Google Sheets, MASTER/Master-10, Elements і реальні лічильники не змінювалися. Commit та clasp push/deploy не виконувалися.

## 1. Модель журналу

Службовий аркуш `_BOM_CommitJournal` містить рівно шість колонок:

`OperationID | Kind | Sequence | Payload | Digest | UpdatedAt`

Операція зберігається append-only у кількох рядках. META містить PREPARING, кількість chunks, довжину та SHA-256 повного payload. CHUNK зберігає частину payload; STATUS зберігає status/error. Sequence починається з 0 і має бути без пропусків. Digest кожного record включає OperationID, Kind, Sequence, Payload і попередній digest. Payload додатково перевіряється за повним SHA-256.

RootID, AffectedParentIDs, BeforeSnapshot, TargetSnapshot і запит знаходяться у цілісному versioned payload. Before/Target — тільки physical slots дозволеної області, разом із номерами рядків, усіма колонками, формулами і tagged Date. Для чужої області зберігається digest її фізичних рядків; копії чужих даних не відновлюються. CreatedAt операції — timestamp META record; UpdatedAt — timestamp останнього record. Error зберігається у STATUS без мовчазного обрізання.

Стани: PREPARING у manifest; READY після всіх chunks; APPLYING перед фізичними writes; COMMITTED після verification; RECOVERY_REQUIRED при технічному збої; CONFLICT при небезпечному стані; RECOVERED після підтвердженого roll-forward. Якщо запис нового status не підтвердився, попередні durable records залишаються джерелом recovery.

Chunks мають не більше 20 000 UTF-16 одиниць, без розриву surrogate pair. Payload записується як literal text, щоб chunk з початковим '=' не став формулою. Число частин, довжина, порядок, hash chain і SHA-256 перевіряються після flush/readback. Перед початком BOM write повторно підтверджується повний READY payload. Жодних truncate JSON або snapshot немає. Використано [GAS Utilities.computeDigest](https://developers.google.com/apps-script/reference/utilities). Консервативні межі менші за описаний Google поріг 50 000 символів для комірок під час [конвертації таблиць](https://support.google.com/drive/answer/37603).

## 2. Файли

Створено:

- `src/modules/bom/commit/safe-bom-writer.ts` — модель плану, GAS journal adapter, scope-bound writer і recovery API.
- `src/modules/bom/tests/safe-bom-writer.test.ts` — 40 тестів із failure-injectable GAS mocks.
- `docs/dds/SAFE-BOM-WRITER-1H2D.md` — цей звіт.

Існуючі production-файли не змінено. prepareBOM, PreparedBOM/Product Policy, ID generator, ScriptLock генератора, resolver/expansion, MaterialFlow/Requirement, Manufacturing/ShiftPlan, старий writer і форма залишилися без змін. MIGRATION-VERIFICATION.md не редагувався.

## 3. Фізичний запис

`writeSafeBOM(plan)` отримує вже реальні IDs та повні targetRows у порядку фізичних заголовків. Він відкриває MASTER через чинний SpreadsheetProvider. Підтримана схема: перші сім колонок ParentID, ChildID, Qty, Unit, CreatedAt, ParentCode, ChildCode, далі унікальні непорожні extra headers.

Рядки дозволених ParentID стають stable slots. Target rows розміщуються лише в цих slots; якщо їх більше, нові slots додаються після фактичного кінця даних. Зайві старі slots заповнюються порожніми значеннями лише на ширину BOM. Немає clearContents всього аркуша, deleteRows, row shifts, глобального deduplication або каскадного видалення. Чужі рядки, включно з дублями, не передаються у setValues.

Усі extra columns мають бути явно присутні у targetRows. Значення та formula expressions читаються через getValues/getFormulas; формули не замінюються їх обчисленими результатами. Literal strings записуються як text. Формули в core columns, merged cells або невідповідна схема блокують writer. Нові target cells понад 45 000 символів відхиляються до mutations. Для невідомої структури потрібне окреме погодження mapping, а не fallback до перезапису всього аркуша.

Stable blank slots після скорочення BOM — навмисна ціна відсутності зсувів рядків. Інтеграція Commit/reader має врахувати порожні фізичні рядки; цей slice не змінює старий reader.

## 4. Scope

Plan містить operationID, rootID, affectedParentIDs, createdParts receipts і targetRows. IDs проходять чинну normalizeIntegerId; pending:* не приймаються. Scope має містити root; кожний інший parent потребує receipt із тим самим operationID; дубльовані IDs і вихід target ParentID за scope відхиляються. Receipt не може підмінити root. Кількість має бути позитивною і скінченною, unit — непорожньою. Duplicate target Parent/Child/Unit відхиляються. Empty replacement/deletion вимагає окремої явної операції й тут не реалізована.

Для ініціалізації Part додатково перевіряється відсутність її наявного BOM. Writer не читає, не створює, не оновлює і не видаляє Elements та не резервує ID.

Межа довіри: receipt — контракт із майбутньою trusted Commit orchestration, а не самостійний доказ фактичної вставки. Поточна схема Elements не має provenance поля, за яким writer міг би незалежно довести автора створення. Caller повинен формувати receipts лише після фактичного creation/readback цією операцією, а не з одного pending плану. Writer відхиляє existing Part з BOM; existing Part без BOM також не можна передавати як created цією операцією. Поки trusted orchestration не реалізована, API не слід відкривати для довільних web requests.

## 5. Ідемпотентність

Порівняння scoped BOM не залежить від порядку рядків, але враховує multiplicity, нормалізовані ParentID/ChildID, Qty, Unit, Codes та всі extra values/formula expressions. CreatedAt — metadata, виключена лише з semantic equality. Чужі фізичні literal values/formula expressions та позиції перевіряються digest.

Якщо актуальний semantic BOM відповідає target, повертається ALREADY_APPLIED без BOM write. Для тієї самої OperationID запит має бути семантично тим самим; інший payload дає CONFLICT. Порядок target rows/scope/receipts не змінює запит. Після COMMITTED/RECOVERED змінений BOM не перезаписується старою операцією: повертається CONFLICT, навіть якщо він знову схожий на BeforeSnapshot.

## 6. Recovery

`recoverSafeBOM(operationID)` повторно отримує ScriptLock, відкриває MASTER і читає журнал. Неповний, пошкоджений або не READY payload дає CONFLICT без BOM write. PREPARING без READY не має права застосування.

Далі перевіряються header/schema, чужий digest і scoped slots. Якщо target уже застосований — завершення без повторного physical write. Частково очищені retired slots не вважаються завершенням: в них мають бути очищені всі cells.

Roll-forward допускається лише коли кожна scoped cell дорівнює її journaled Before або Target, і чужий фізичний стан не змінився. Змінюються тільки journaled slots до Target; перед кожним row write стан перевіряється повторно. Після flush здійснюється readback і перевірка Target та чужих даних. Результат — RECOVERED.

Будь-яке стороннє scoped значення, зміна чужого стану, структурний зсув або CONFLICT status зупиняють автоматичне відновлення. Немає сліпого restore всього аркуша, automatic deletion Elements чи rollback LastID. BeforeSnapshot зберігається для діагностики й ручного рішення; автоматична стратегія тут — консервативний roll-forward, а не rollback.

## 7. Перевірки

- Релевантні Vitest: 40/40 passed.
- `npm run build`: passed.
- Ізольований strict TypeScript check writer/tests: passed.
- `npx vitest run`: 313 passed / 3 відомі legacy failures, 22 suites.
- `git diff --check`: passed.

Покрито заміну root, повтор, semantic row order, зміни Qty/Part, збереження старої Part BOM/foreign mixed rows/дублікатів, extra values і формул, initial new Part BOM, scope/receipts, invalid inputs, missing sheets/schema, oversized cells, chunks та corruption, journal failures до READY, READY interruption, partial BOM write, lost acknowledgement, status failure після write, OperationID mismatch, зовнішні scoped/foreign/schema conflicts, recovery, verification failure, lock timeout/release і nested lock rejection. Фізичного доступу до живого MASTER не було.

Незмінні legacy failures: bom-material-matrix.integration, bom-materials.service та project-material-matrix.integration — матеріал 3201 відсутній у результаті. Тести не приховано і не вимкнено.

## 8. Залишкові ризики

ScriptLock серіалізує read/compare/journal/write/verify лише cooperating callers цього script project. Він не блокує ручні зміни чи інші проєкти. Перевірки між writes звужують вікно конфлікту, але не є транзакцією з ручним редактором; зовнішнє втручання може бути виявлене після частини scoped writes. CONFLICT не означає rollback вже застосованих scoped cells.

Формули збережено як expressions; їхні обчислені результати можуть природно змінюватися при зміні referenced BOM. Spills/array formulas, protected ranges, external references, notes/rich text та фактичні permissions потребують GAS smoke/schema review перед інтеграцією. Core formulas і merges відхиляються. Нові appended slots потребують достатнього фізичного числа рядків; writer не розширює аркуш автоматично. Якщо range write недоступний, журнал лишається для recovery.

Hash chain перевіряє цілісність і повноту, але не є криптографічним захистом від автора, який навмисно перепише журнал і перерахує hashes. Потрібні permissions/protection журналу. Snapshot read/write confirmation використовує GAS flush/readback; реальна поведінка не тестувалася.

Час виконання й кількість читань залежать від розміру BOM/журналу; readback кожного journal record та кожного scoped row має вартість. Дуже великі операції можуть потребувати окремих quota/load tests і batching без послаблення barrier READY.

## 9. Майбутня Safe Commit orchestration

Потрібні fresh Prepare revalidation, identity resolution, actual creation receipts, OperationID lifecycle, localKey→ID mapping, full physical target-row mapping і збереження meaningful extra columns. Якщо pending Part стала existing, її потрібно виключити з initialize scope й outgoing targets. Old/orphan Parts не видаляти й не змінювати.

Writer відхиляє вкладений ScriptLock. Orchestrator не повинен тримати той самий lock, викликаючи генератор або цей public writer. У наступному етапі потрібно погодити спільну lock ownership і межі creation/write; не оголошувати цей slice атомарною Create Elements + BOM транзакцією. Writer не підключений до чинного маршруту.

## 10. Створення аркуша перед deploy

Після окремого погодження власником ERP:

1. У configured MASTER створити `_BOM_CommitJournal` вручну; не в Master-10.
2. У рядку 1 задати точно: OperationID, Kind, Sequence, Payload, Digest, UpdatedAt. Рівно шість колонок, без додаткових headers, формул або merged cells.
3. Колонки A/B/D/E зробити plain text, C — numeric sequence, F — date/time. Забезпечити права execution user на append/read і захист від випадкового ручного редагування/видалення журналу.
4. Перевірити canonical core BOM headers, extra columns/formulas, достатнє число рядків і права запису лише погодженими тестами. Writer не створює відсутні аркуші.
5. Після інтеграції trusted orchestration провести recovery smoke tests на погоджених тестових даних, перевіряючи всі foreign ParentID. До цього не відкривати writer довільним callers.

Під час цього slice аркуш не створювався, записи GAS не виконувалися. Роботу завершено для перевірки власником ERP.
