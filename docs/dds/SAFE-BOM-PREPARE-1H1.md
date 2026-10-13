# ERP КУБ — Implementation Slice 1H.1: Prepare

База: `04c03ee`. Локальна реалізація; живі Google Sheets і лічильники не змінювалися. Commit та clasp push/deploy не виконувалися.

## 1. Файли

Створено:

- `src/modules/bom/preparation/bom-preparation.model.ts` — контракти PreparedBOM, тимчасових посилань, помилок і discriminated result.
- `src/modules/bom/preparation/bom-preparation.service.ts` — `prepareBOM(input, dependencies)`.
- `src/modules/bom/tests/bom-preparation.test.ts` — 35 автоматичних тестів з mocks/spies.
- `docs/dds/SAFE-BOM-PREPARE-1H1.md` — цей звіт.

Змінено лише `src/domain/materials/material.resolver.ts`: dependency constructor звужено до `Pick<MaterialRepository, 'findBySpec'>`, щоб повторно використовувати чинне read-only визначення матеріалу без приведення типів чи записувальних можливостей. Поведінка resolve і його бізнес-правила не змінені; чинні callers сумісні.

Не змінено форму, runTableParser, buildBOMFromTable/buildBOMRow, root/element creation services, ID generator, MASTER routing, BOM writer, ScriptLock, BOMReferenceResolver/BOMExpansion, MaterialFlow/MaterialRequirement, Manufacturing/ShiftPlan та Accepted DDS/ADR. `MIGRATION-VERIFICATION.md` не редагувався.

## 2. Модель PreparedBOM

Вхід: parentInput у чинному форматі `Prefix; Code`, specification як багаторядковий текст і optional projectDocumentID. Залежності передаються явно, без factories або Sheet access всередині Prepare.

Модель повторно використовує TableRowInput, ElementFull, Material і ElementRow. Pending row має тип `Omit<ElementRow, 'ID' | 'CreatedAt'>`: він не містить нового ID або часу фактичного створення.

Посилання:

- existing-element — копія наявного ElementFull;
- material — копія канонічного Material;
- pending-element — лише тимчасовий localKey виду `pending:1` у пам'яті.

PreparedBOM містить parent, components із sourceRowIndex, pendingElements, plannedEdges з qty/unit і sourceContext з вихідним текстом та документами пошуку. Існуючі ID залишаються існуючими; нові числові ID не вигадуються й не резервуються.

Result: `{ ok: true, prepared }` або `{ ok: false, errors }`. Помилковий результат не містить prepared, components, edges чи pending rows, придатних до Commit. sourceRowIndex — zero-based номер фізичного рядка, включно з пропущеними порожніми рядками; -1 означає parent/input/context або загальну помилку агрегації. UI зможе показувати rowIndex + 1; відображення ще не підключене.

## 3. Алгоритм

1. Read-only ProjectDocumentResolver визначає search documents, як у чинному buildBOMFromTable.
2. parseParent і findByCode шукають root. Для нового root CatalogHelper/resolveElementType визначають тип і pending row; для існуючого використовуються його дані та document context.
3. Текст розбирається рядок за рядком через чинний parseStructuredLine — той самий leaf parser, що використовується parseTableText. Обробка не припиняється після першої помилки; parseTableText не викликається цілком, оскільки його map може завершитися на першому exception і втратити діагностику інших рядків.
4. Перевіряються required prefix/code/spec, позитивна скінченна qty. Якщо передано третє чи подальше поле, останнє поле має бути явною числовою qty; для двох полів збережено default qty=1. Порожня специфікація повертає EMPTY_SPECIFICATION.
5. Збережено lookup order: існуючий non-material Element у search documents → canonical Material за Code → parseSpec/buildByKind/Catalog. Legacy material Element не стає канонічним Material.
6. Для прямого матеріалу використовується MaterialID з MaterialRepository, включно з побудованим code C_20_25 для C20/25. Потрібна непорожня canonical unit; явна unit бетону після коми має збігтися з нею. Prepare не вводить нового глобального переліку одиниць чи правил конвертації.
7. Для geometry component використовуються чинні builders, resolveElementType та MaterialResolver. Геометричні значення, якщо присутні, мають бути позитивними і скінченними. Явна довжина, яку parser не зміг визначити, відхиляється. Шукається наявна Part за material/code або інший Element за document/type/code.
8. Нові Elements описуються pending rows. Map identity не допускає повторного планування однієї Part за MaterialID/Code чи іншого Element за document/type/code. Material Parts зберігають порожній ProjectDocumentID, як у чинній factory.
9. Для нової material Part до запису перевіряються canonical Material та weightPerMeter. Parent→Part агрегує кількість деталей у виробі. Part→Material планується рівно один раз на нову Part: витрата на одиницю визначається довжиною в метрах і weightPerMeter з округленням до 2 знаків, незалежно від повторень Part. Якщо довжина відсутня, кількість на одиницю — 1. Наявна Part, знайдена за Code або material identity, повторно використовується без планування її вихідних матеріальних зв'язків.
10. Зв'язки агрегуються за parent/child/unit, як у aggregateBOMRows. Перевіряється overflow агрегованої qty. Будь-яка помилка повертає лише errors.

## 4. Перевірки до запису

Аудит поточного маршруту підтвердив: getOrCreateRootElement резервує ID і вставляє root перед обробкою рядків; getOrCreateElementFromBuilt резервує ID/вставляє Part, а buildBOMRow лише потім перевіряє canonical material link і weightPerMeter. Prepare виконує відповідні перевірки без getOrCreate*, resolveElement або ID reservation.

Read-only повторно використано існуючі parsers, builders, CatalogHelper, resolveElementType, MaterialResolver та lookup contracts. Матеріальний resolver отримує лише findBySpec. Записувальні функції не викликаються й не імпортуються Prepare. Поточний writer не перероблявся.

## 5. Доказ відсутності побічних ефектів

BOMPreparationDependencies містить тільки Pick read-методів Elements/Materials/Catalog/documents. Prepare не має SpreadsheetApp, LockService, BOM writer, generator, insert/update чи setData.

У всіх тестах mocked generateIdByType і BOM writers мають zero calls; SpreadsheetApp.openById і LockService.getScriptLock також не викликаються. Для кожного setup після виконання перевірено zero calls repo.insert/updateType і materialRepo.setData та повну рівність Elements/Materials snapshots до і після. Перевірки працюють і для успішних, і для помилкових результатів. Окремо доведено, що зміна returned existing Element copy не змінює repository state.

Планування може читати передані repository snapshots. Це read-only стосовно даних ERP, але не гарантує актуальності snapshot на майбутній момент Commit.

## 6. Перевірки

- `npx vitest run src/modules/bom/tests/bom-preparation.test.ts`: 35 passed.
- `npm run build`: passed.
- `npx vitest run`: 245 passed / 3 відомі legacy failures, 21 suite.
- Ізольований strict TypeScript check Prepare model/service/tests із src baseUrl: passed.
- `git diff --check`: passed.

Покрито новий Product і material Part без ID/insert, canonical concrete, rebar/angle/plate length Parts, existing migrated і legacy IDs, матеріальне повторне використання, deduplication/aggregation, всі row errors, порожній input, некоректну qty/unit/length, required fields, Catalog/type/material failures, weightPerMeter до вставки, document dependency errors та quantity overflow.

Три незмінені failures: bom-material-matrix.integration, bom-materials.service та project-material-matrix.integration — очікуваний матеріал 3201 відсутній у результаті. Старі тести не змінювалися й не вимикалися.

## 7. Залежності для майбутнього Commit 1H.2

Commit повинен повторно прочитати/перевірити sourceContext, існуючі IDs, Catalog, Materials, business identities і актуальний BOM. Pending localKeys потрібно зіставити з фактичними IDs після повторного lookup і reservation; CreatedAt встановлюється лише під час створення. PreparedBOM не є транзакцією, доказом збереження або дозволом пропустити revalidation.

Потрібно погодити application orchestration, блокування з урахуванням ScriptLock генератора, стан/відновлення при збоях Element creation/BOM write, повідомлення оператору та verification після запису. Порожня специфікація не видаляє BOM; окреме видалення ще не реалізоване.

Форма й GAS entrypoints не підключені до Prepare. Експортований TypeScript module API `prepareBOM` доступний майбутньому application caller з явно переданими read-only залежностями. Успіх Prepare ніде не показується як успіх запису. Чинний записувальний маршрут залишається попереднім до 1H.2.

## 8. Ризики та невирішені питання

- Погоджене правило «одна помилка — BOM не змінюється, Elements/ID не створюються» забезпечено для Prepare; воно ще не застосоване до чинної форми/writer. Поточні clearContents, часткове збереження та concurrent writes залишаються ризиками до 1H.2.
- Після уточнення власника виправлено лише Prepare: повторені Part→Material більше не агрегуються за кількістю входжень; формується один зв'язок на нову Part. Чинний записувальний маршрут не змінено. Commit 1H.2 має дотримуватися цього інваріанта та не перезаписувати BOM повторно використаної Part без окремого погодженого сценарію.
- Чинна factory не може створити нову project Part без Material: Prepare відхиляє її до ID reservation. Це наявне обмеження, не нова політика створення; підтримка таких Parts потребує окремого погодження. Існуючі Parts можуть бути повторно використані.
- Наявні assembly/unknown компоненти повторно використовуються за Code; відсутні assembly/unknown компоненти відхиляються, як у buildBOMRow. Нові дочірні сутності допускаються лише там, де це допускає чинна parsing/Catalog логіка.
- Prepare не запускає BOMCompletenessChecker/typed expansion існуючих піддерев, не змінює їхні правила і не запитує BOM. Після commit необхідна окрема verification повного складу.
- Для одиниць збережено canonical repository unit; перевірка explicit concrete unit не додає конвертацій і не розширює старий TableRowInput контракт.
- Якщо Prepare і старий writer надалі розвиватимуться незалежно, бізнес-логіка може розійтися. У 1H.2 потрібно використовувати PreparedBOM як єдиний план і погодити спільні pure правила створення, замість повторного виконання старого write flow.

Роботу завершено для перевірки власником ERP. Commit, deploy і зміни Google Sheets не виконано.

## Уточнення перед commit

Регресійний приклад підтверджено: одна Part у рядках 1 шт і 2 шт дає Parent→Part 3 шт та один Part→Material 0,46 кг. Для існуючої Part перевірено обидва шляхи lookup (document/Code та MaterialID/Code): план містить лише Parent→Part 3 шт, без pending Elements і без вихідних зв'язків Part. Prepare не читає та не змінює її чинний BOM; його перевірка й політика можливого ремонту є окремою відповідальністю Commit. У всіх сценаріях збережено zero calls generator/insert/BOM writer і незмінність repository snapshots.
