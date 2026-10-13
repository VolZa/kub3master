# ERP КУБ — Physical BOM Mapping and Stable-Slot Reader — 1H.3D

Дата: 2026-10-13. Перевірена база HEAD: `c919b1d`.

## Фактична схема

За підтвердженням власника ERP основний контракт 01_BOM:

| A | B | C | D | E | F | G |
| --- | --- | --- | --- | --- | --- | --- |
| ParentID | ChildID | Qty | Unit | Comment | ParentCode | ChildCode |

CreatedAt у BOM відсутній. ParentCode/ChildCode є значеннями, а не формулами. Заголовки перевіряються точно, включно з порядком і кількістю. У цьому slice додаткові колонки не підтримуються: без погодженого mapping вони блокують запис. Автоматичної міграції немає.

ID допускає number або string, нормалізується як додатне integer ID без визначення Type за діапазоном. Qty — скінченне додатне number; Unit та обидва Codes — непорожні strings; Comment — string, включно з порожнім. Date, boolean, formula та неповні рядки не приймаються як нормальний physical BOM. Ширина кожного рядка — сім комірок. Literal strings, зокрема текст із початковим '=', writer записує з escaping, без утворення формул.

## Змінені файли

- `src/modules/bom/commit/physical-bom-schema.ts`: нові PHYSICAL_BOM_HEADERS, PhysicalBOMRow, validateBOMHeaders()/validateBOMRow().
- `src/modules/bom/commit/physical-bom-mapper.ts`: нові ResolvedBOMBinding, BOMCommentChange і mapPreparedBOMToPhysicalPlan().
- `src/modules/bom/commit/safe-bom-writer.ts`: схема Comment, значуща семантика колонки E, preflight, durable append floor.
- `src/modules/bom/bom.repository.ts`: лише getAllBOMRows() — перевірка читання і пропуск порожніх stable slots. Старі mutation methods не змінені.
- `src/modules/bom/model/bom-row.model.ts`: additive optional comment для читання.
- `src/modules/bom/tests/physical-bom-mapping.test.ts`: 30 нових mapper/reader тестів.
- `src/modules/bom/tests/safe-bom-writer.test.ts`: 14 нових регресій, адаптація чинних fixtures до семи value-only колонок; усі старі recovery/lock/integrity сценарії збережені.
- `src/modules/bom/tests/commit-operation-journal.test.ts`, `bom-master-routing.test.ts`: BOM fixtures переведені на Comment. CreatedAt Elements і journal timestamps залишаються чинними.

Product Policy, ID generator, MaterialFlow, Accepted DDS/ADR, робочі форми й legacy записувальні методи не змінені. `MIGRATION-VERIFICATION.md` не змінено.

## Політика Comment

Mapper використовує logical edge key `(ParentID, ChildID, Unit)`; Qty та номер physical slot до ключа не входять.

1. При зміні Qty того самого edge зберігається snapshot Comment.
2. Для нового edge початковий Comment — порожній string.
3. Для іншого ChildID, ParentID або Unit коментар не успадковується від попереднього slot.
4. Явний `commentChanges` може замінити Comment, включно з явним порожнім string для очищення.
5. Кілька existing rows того самого edge без явного comment рішення блокують mapping як неоднозначність. Явна зміна comment дозволяє визначити результат для цього target edge. Чужі дублікати mapper не видаляє.
6. Дубльовані explicit comment changes або зміни для відсутнього/чужого target edge блокуються.

Safe Writer тепер включає Comment у semantic equality, repeat request comparison і verification. Зміна тільки Comment є реальною зміною BOM. Повтор того самого OperationID з іншим Comment повертає CONFLICT.

## Physical target-row mapper

`mapPreparedBOMToPhysicalPlan()` — чиста функція без GAS calls, reservation або writes. Вона приймає PreparedBOM, writerOperationID O_BOM, server-side fresh-verified bindings для всіх references, scoped creation receipts, physical headers/rows і optional explicit comment changes.

Bindings містять ref, real ID, перевірений Code та origin existing/material/created/reused. Existing/material ID і Code перевіряються проти reference. Pending Code перевіряється проти plan; матеріальні Codes порівнюються нормалізовано. Вихід використовує actual verified Code binding. Missing, duplicate або contradictory bindings блокують mapping. Перевіряються також components і всі pending references.

Mapper створює лише `[ParentID, ChildID, Qty, Unit, Comment, ParentCode, ChildCode]`. Він не генерує formulas або timestamps. Прямий canonical Material стає ChildID без проміжної Part. Підготовлені агреговані Qty зберігаються; дубльований planned edge відхиляється. Part→Material лишається витратою на одну Part.

Scope — resolved root плюс лише pending material Parts із origin CREATED та відповідними receipts O_BOM. Якщо pending Part стала REUSED, її planned initialization edge виключається, а батьківський edge використовує наявний real ID. Відсутні/чужі receipts, сторонній ParentID або вже існуючий BOM нібито нової Part блокують операцію. Mapper не змінює snapshot чи характеристики Elements.

Bindings — trusted server-side contract, а не доказ, отриманий від вебформи. Fresh lookup/readback забезпечується coordinator 1H.3C та майбутнім revalidator 1H.3E. Повний orchestrator у цьому slice не створено.

## Stable-slot reader та writer

`getAllBOMRows()` відкриває MASTER через чинний getMasterBOMSheet(), перевіряє schema/formulas, пропускає тільки сім повністю порожніх cells і повертає нормальні rows із optional comment. Непорожній partial row, неправильний ID/Qty/type/width або formula спричиняє controlled error; для row validation повідомлення містить фізичний номер рядка. Читання не видаляє та не зсуває рядків. getChildrenRows()/getParentsRows() використовують цей самий reader.

Writer зберігає scoped stable-row replacement: використовує positions поточного scope, очищає зайві positions сімома порожніми значеннями, нові positions додає в кінці. Foreign ParentID rows, коментарі, коди, duplicate rows та раніше створені Part BOM не записуються й не дедуплікуються.

`CommitJournal.appendFloor()` додатково враховує positions у durable writer snapshots інших операцій. Google Sheets може не включати повністю очищений tail у getDataRange; нова операція все одно додає rows після journal-reserved positions. OP_FRAME події загальної операції не трактуються як writer META. Пошкоджений/неповний сторонній writer journal блокує визначення безпечного append floor до його розв'язання.

Reader не приховує partial rows. Writer recovery має окремий вузький виняток: partial cells тільки у власних durable slots допускаються до перевірки against before/target. Це потрібно для roll-forward після часткового фізичного запису. Foreign partial rows блокуються; довільні scoped values, яких немає у before/target, перезаписувати не дозволено.

## Preflight, journal і recovery

Чинні public/internal API, six-column `_BOM_CommitJournal`, digest chain, chunks, READY/verification, locks і operation linkage O/O_BOM збережені. Нові snapshots також мають version 1, але містять точні headers Comment; persisted headers визначають physical meaning.

До нових journal/BOM mutations writer перевіряє targets і physical sheet: точні headers, ширину, типи, merged cells і відсутність formulas. Recovery виконує preflight перед append status. Unsupported schema повертає CONFLICT без journal/BOM changes.

Старі journal records читаються тим самим framing/hash protocol. Snapshot із headers CreatedAt не переінтерпретується як Comment і не застосовується до нової схеми: recovery повертає CONFLICT без автоматичної міграції чи змін записів. Це навмисна межа сумісності для запобігання перетворенню dates у comments.

Foreign fingerprint продовжує включати physical positions і всі values. Регресії підтверджують зупинку recovery при зовнішній зміні foreign Comment/ParentCode/ChildCode та збереження незмінних foreign duplicates.

## Перевірки

- Релевантні Vitest: **175 passed** — mapper/reader 30, Safe Writer 57, durable operation journal 37, recoverable creation 37, MASTER routing 14.
- Повний `npx vitest run`: **434 passed / 3 відомі legacy failures**; baseline 390 / 3. Нових failures немає, тести попередніх slices не вимикалися.
- Незмінні legacy failures: `bom-material-matrix.integration.test.ts`, `bom-materials.service.test.ts`, `project-material-matrix.integration.test.ts` — відсутній очікуваний Material 3201.
- Targeted strict TypeScript `--noEmit`: **passed**.
- `npm run build`: **passed**.
- `git diff --check`: **passed**.

Нові регресії охоплюють exact schema, Comment при Qty change/retry, новий ChildID, explicit clearing, ambiguity, canonical Material, pending CREATED/REUSED, receipt/scope gates, fully empty slots, partial row/type/width/formula errors, mixed parents, foreign comments/codes/duplicates, невикористання retired tail positions, unsupported recovery schema та старий CreatedAt journal snapshot. GAS writes виконувалися лише у mocks.

## Залишкові ризики й наступний крок

1. До 1H.3E mapper не підключено до форми. Майбутній orchestrator має робити fresh revalidation, створення Elements, fresh physical snapshot, mapping і internal writer під одним caller-owned ScriptLock. Stale snapshot поза цим протоколом може втратити актуальний comment між mapping і write.
2. ScriptLock не блокує manual Sheets edits або інші Apps Script-проєкти. Foreign/schema conflicts виявляються перевірками; атомарної транзакції щодо зовнішніх редакторів немає.
3. Legacy writer/route залишено без змін за вимогою slice. Він може використовувати старе припущення про date у колонці E та глобальні clear/rewrite. Новий строгий reader діагностує такі rows. Перед production інтеграцією цей маршрут потрібно замінити/закрити у погодженому slice.
4. Durable slot reservation залежить від збереження journal snapshots; їх видалення може прибрати high-water evidence. Incomplete/corrupt writer journals потрібно відновити або розв'язати до нових append operations. Автоматичного purge немає.
5. Додаткові колонки та formulas потребують окремо погодженого mapping; цей slice їх не підтримує. Можливе вичерпання фізичної місткості sheet лишається writer error/recovery concern; автоматичне розширення sheet тут не впроваджено.
6. Schema підтверджена власником і відтворена mocks. Реальний MASTER не читали та не змінювали; live acceptance checks залишаються окремою погодженою дією.

Git commit, clasp push/deploy, зміни MASTER/Master-10 і MIGRATION-VERIFICATION.md не виконувалися. Роботу зупинено для перевірки власником ERP.
