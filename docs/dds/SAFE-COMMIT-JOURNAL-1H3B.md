# ERP КУБ — Safe Commit Journal — Slice 1H.3B

Дата: 2026-10-13. База: `5f48b07`; архітектурна основа: `SAFE-COMMIT-INTEGRATION-AUDIT-1H3A.md`.

## Результат і межі

Реалізовано окремий append-only протокол загальної операції Create Elements + BOM у наявному шестиколонковому `_BOM_CommitJournal`. Реальних GAS-функцій і Google Sheets не викликали. Код не резервує ID, не вставляє Elements, не змінює `01_BOM` та не підключений до вебформи. Safe Commit Orchestrator і фізичний verifier залишаються наступними етапами.

Нові файли:

- `src/modules/bom/commit/commit-operation.model.ts`: контракт manifest, подій, стану, intent і trusted creation verifier.
- `src/modules/bom/commit/commit-operation-journal.ts`: `CommitOperationJournal`, цілісність, переходи, retry, receipts та MASTER factory.
- `src/modules/bom/tests/commit-operation-journal.test.ts`: GAS mocks і 36 регресійних тестів.

`prepareBOM()`, Product Policy, генератор ID, legacy writer, Safe Writer, Accepted DDS/ADR та `MIGRATION-VERIFICATION.md` не змінені.

## Операція та durable manifest

`OperationManifest` містить `version = 1`, стабільний `operationID = O`, `writerOperationID = O_BOM`, SHA-256 `requestDigest`, вихідний `BOMPreparationInput` і повний `PreparedBOM`. Суфікс `_BOM` зарезервовано для writer; ідентифікатор O має обмежений формат і довжину, щоб похідний O_BOM відповідав чинному контракту writer.

Повний PreparedBOM зберігає root type та existing/pending root, sourceContext, контекст ідентичності компонентів, pending rows, канонічні Material references, геометрію, planned edges і writeScope. `begin()` перевіряє узгодженість input/sourceContext, references, pending localKeys, тип кореня, scope та матеріальні initialization edges. Майбутні Part→Material дозволені лише для зазначених у scope нових матеріальних Parts; для кожної потрібен один відповідний канонічний material edge. Перевірка schema не замінює fresh business revalidation перед початком операції.

Manifest незмінний. Повтор O із тим самим input і планом повертає `ALREADY_APPLIED`; інший input або план повертає `CONFLICT`. Наявні осиротілі записи O_BOM блокують новий begin для O. Manifest стає доступним для side effects тільки після повністю підтверджених `INITIALIZED` і `READY`.

## Фізичний формат і цілісність

Збережено заголовки чинного writer: `OperationID`, `Kind`, `Sequence`, `Payload`, `Digest`, `UpdatedAt`. Нових колонок або аркушів немає. `openCommitOperationJournal()` відкриває `SpreadsheetProvider.open(SpreadsheetKey.MASTER)`; відсутній журнал спричиняє помилку, factory його не створює.

Кожна логічна подія має стабільний eventID і записується як:

1. `OP_FRAME`: eventID, кількість chunks, довжина serialized event і digest.
2. `OP_DATA`: chunks до 20 000 UTF-16 code units без розриву surrogate pair.
3. `OP_END`: eventID і digest завершеної події.

Канонічна JSON-серіалізація сортує ключі, зберігає порядок масивів, кодує Date через ISO tag і відкидає unsupported/nonfinite values. Кожний фізичний рядок містить SHA-256 chain від `[OperationID, Kind, Sequence, Payload, previousDigest]`. Читання перевіряє sequence, chain, framing, count, length, content digest, completion та унікальність eventID. Після append виконуються `SpreadsheetApp.flush()` і readback. Неповна подія не видається як durable evidence.

Digest виявляє випадкове пошкодження, але не є цифровим підписом: користувач із доступом до журналу, який перепише payload і всі hashes, знаходиться поза моделлю гарантій. UpdatedAt — службова дата, а не доказ походження Element.

## Події та переходи

| Подія | Умова і результат |
| --- | --- |
| INITIALIZED | Перший незмінний manifest; стан PREPARING. |
| READY | Лише після INITIALIZED; дозвіл почати рішення щодо pending Elements. |
| RESERVING | Відомий нерозв'язаний localKey; durable намір резервування, без виклику генератора. |
| INSERT_INTENT | Після RESERVING; localKey, reservedID і повний canonical ElementRow із CreatedAt. ID та row перевіряються проти pending plan і відомих ID. |
| CREATED | Лише після durable INSERT_INTENT і trusted fresh physical readback; містить зв'язок із intent та точний row digest. |
| REUSED | До INSERT_INTENT; existing row перевіряється за відповідною project/material identity. Не надає права initialization BOM. |
| BOM_READY | Усі pending Elements мають CREATED або REUSED. |
| COMPLETED | Після BOM_READY, із правильним O_BOM і статусом COMMITTED, RECOVERED або ALREADY_APPLIED. |
| CONFLICT | Явна terminal подія з причиною; нові переходи заборонені. |

Element-рішення дозволені у READY/CREATING. INSERT_INTENT не підтверджує створення. Повтор тієї самої події не виконує повторний перехід. Недопустимий перехід відхиляється до append.

API: `begin()`, `load()`, `reserving()`, `insertIntent()`, `reused()`, `confirmCreated()`, `createdReceipts()`, `bomReady()`, `completed()`, `conflict()`. Generic persist закритий, тому caller не може просто передати подію CREATED в обхід verifier.

## Retry і втрата acknowledgment

Caller зберігає O, eventID і незмінний payload між спробами. Повністю записана однакова подія повертає ALREADY_APPLIED без append. Той самий eventID з іншим payload відхиляється.

Якщо append фізично відбувся, але підтвердження втрачено, повтор читає журнал. Точний незавершений prefix тієї самої події дозволяє дописати лише відсутні chunks/end. Інший event не може перескочити незавершений tail. `begin()` аналогічно відновлює початкові INITIALIZED/READY. Пошкоджений chain або невідповідний prefix не ремонтуються автоматично.

Результат API `CONFLICT` може означати відмову або невизначеність підтвердження append; він сам по собі не додає terminal CONFLICT у журнал. Для lost acknowledgment потрібно retry тієї самої події. Terminal стан записується лише явним `conflict()`.

Протокол не гарантує exactly-once резервування лічильника. Збій між майбутнім резервуванням і durable INSERT_INTENT може залишити пропуск ID. Після RESERVING не можна починати нове рішення під іншим eventID; майбутній coordinator повинен відновити те саме рішення і не вставляти Element до підтвердження intent.

## CREATED, ownership і контракт Slice 1H.3C

`confirmCreated()` без `CreationVerifier` відмовляє. Verifier отримує cloned intent і context: O, O_BOM, requestDigest, insertIntentEventID та insertIntentDigest. Він повинен виконати fresh фізичне читання, довести зв'язок створення з durable intent і повернути точний ElementRow. Відсутній або відмінний row не дає CREATED. Cache, збіг Code і відсутність BOM не є доказами.

У цьому slice verifier — trusted injection contract, а не реалізований доказ фізичного походження. Сам по собі журнал ще не доводить, що Element створила саме ця операція. 1H.3C має розрізнити retry власної вставки, зовнішню колізію та вже існуючу сутність; перевірити physical row після невідомого результату вставки; повертати conflict за недостатніх доказів.

`createdReceipts()` читає тільки повний журнал і повертає `{ id, operationID: O_BOM }` лише для підтверджених CREATED матеріальних Parts у initialization scope. Root і REUSED не дають такого receipt. Receipt не означає завершення всієї операції. Існуючі Parts, їхні характеристики й BOM не змінюються; orphan cleanup не передбачено.

## Lock і сумісність Safe Writer

Весь API вимагає переданий caller-owned ScriptLock з `hasLock()`. Журнал не захоплює й не звільняє lock. Майбутній orchestration повинен узгодити ці межі із self-locking генератором і Safe Writer; вкладене захоплення не реалізоване і не дозволене цим slice.

O використовує OP_FRAME/OP_DATA/OP_END, а O_BOM — чинні META/CHUNK/STATUS writer. Записи незалежні, зв'язок однозначний у manifest. `writeSafeBOM()` / `recoverSafeBOM()` і їх зовнішня поведінка не змінені. Тест викликає реальний Safe Writer на GAS mocks, повторює його до ALREADY_APPLIED і перевіряє незмінність O. `completed()` поки приймає trusted спостереження caller щодо результату writer; перевірку writer outcome виконуватиме orchestrator.

## Перевірки

- Новий протокол: 36 passed. Включено incomplete/corrupt manifest, missing chunks, digest mismatch, retry initial/event/CREATED після lost acknowledgment, immutable input/plan, invalid transitions, nondurable intent, відсутній/невірний physical verifier result, receipt scope, ID collision, великі Unicode chunks, lock і відсутній journal.
- Новий протокол разом із Safe Writer: 76 passed (36 + 40).
- Targeted strict TypeScript `--noEmit`: passed.
- `npm run build`: passed.
- `npx vitest run`: 349 passed / 3 відомі legacy failures. Три failures залишаються у старих тестах із відсутнім очікуваним Material 3201; baseline був 313 passed / ті самі 3 failures.
- `git diff --check`: passed після створення звіту.

Commit, push/deploy та live Sheets changes не виконувалися. Інтеграцію з резервуванням, Elements і вебформою не розпочато.
