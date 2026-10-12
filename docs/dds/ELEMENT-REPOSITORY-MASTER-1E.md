# Implementation Slice 1E — Explicit MASTER Access

База: `c3b778a`. Реалізовано локально, без commit, clasp push/deploy та звернень до живих Google Sheets.

## Зміни

- `src/modules/elements/element.repository.ts`: конструктор використовує наявний `SpreadsheetProvider.open(SpreadsheetKey.MASTER)`, отримує `00_Elements` і зберігає аркуш у `this.sheet`. За відсутності аркуша кидає `Лист 00_Elements не знайдено в MASTER`. `insert` використовує той самий аркуш, як і `updateType`. Нового механізму підключення та фізичного spreadsheet ID у репозиторії немає.
- `src/modules/elements/element-repository-master.test.ts`: 8 автоматичних Vitest-тестів з GAS mocks.
- `docs/dds/ELEMENT-REPOSITORY-MASTER-1E.md`: цей звіт.

Контракти ElementRepository/ElementFull, mapper, порядок колонок вставки, forceText і локальний кеш збережено. У класі немає універсального методу update: чинна операція оновлення — `updateType`. Інші методи пошуку читають кеш, сформований із MASTER у конструкторі; findPart повертає ElementRow, решта зберігають поточний domain mapping.

## Перевірки

Моки перевіряють findById, findByCode, findByIdentity, findByCodeNormalized, findByCodeInDocuments, findByTypeInDocuments, findPartByMaterial, findPart, findAll і findByType; insert, updateType та оновлення кешу. Перевірено відсутність active context, сторонню active таблицю та її зміну після створення репозиторію. Немає звернень до getActive/getActiveSpreadsheet, сторонніх записів чи insertSheet. Створення Product 4000014, Assembly 3000001 і Part 2000010 через чинні сервіси перевірено з mock генератором; окремо виконано незмінні тести справжнього генератора Slice 1D. MaterialRepository зберігає дані та пошук; provider зберігає маршрутизацію OPERATIONAL і REPORTING.

- Релевантні тести репозиторію, генератора та direct material creation: 70 passed.
- `npm run build`: passed.
- `npx vitest run`: 192 passed / 3 відомі legacy failures. Падіння в bom-material-matrix.integration, bom-materials.service та project-material-matrix.integration стосуються відсутнього матеріалу 3201 і збігаються з baseline.
- `git diff --check`: passed.

## Аудит шляхів запису

Фабрика `app/factories/element.factory.ts` та `core/bootstrap/repositories.ts` створюють GoogleSheetsElementRepository. `root-element.service.ts` (Product/Assembly), `element.factory.ts`, `resolveElement.ts`, старий `services/part.service.ts` і `material.service.ts` вставляють через repo.insert. BOM service використовує ці сервіси та переданий ElementRepository. BOM expansion factory отримує репозиторій через getElementRepository. Фактично підключеного в src шляху прямого створення Elements в обхід репозиторію не виявлено.

`legacy/delete-module/elements.service.ts` містить прямий appendRow до активної таблиці, але імпортів цього legacy модуля з src не знайдено. Не слід повертати його в runtime без окремого виправлення. `services/sheets.service.ts` містить ручний helper setupElementSheetFormats з active spreadsheet: він змінює форматування, не створює Elements; це залишено поза обсягом. Загальні insertRows/appendRowSafe не мають виявленого виклику для прямого створення Elements.

Генератор ID, MaterialRepository, SpreadsheetProvider, getSheetByNameSafe, BOM resolver/expansion, Manufacturing, ShiftPlan, ProductionPlanning та Accepted DDS/ADR не змінювалися. Наявний непідконтрольний файл `docs/dds/MIGRATION-VERIFICATION.md` не редагувався і не входить до цього slice.

## Ризики та контроль перед GAS deploy

Реального GAS виконання не було. Обліковий запис виконання потребуватиме доступу до налаштованого MASTER; помилки openById поширюються без fallback. Локальний кеш, відсутність lock в insert/updateType і прийняття довільного ID при прямому виклику insert залишаються чинною поведінкою. Ручні правки та інші script projects можуть обходити резервування. Цей slice забезпечує місце зберігання Elements, а не атомарну транзакцію створення сутності/BOM.

BOM та Catalog мають інші механізми доступу, включно з active spreadsheet; їхню маршрутизацію цей slice не змінює. Тому для повного створення BOM з іншого контексту потрібна окрема перевірка пов'язаних аркушів.

Після окремого погодження deploy рекомендується контрольний сценарій під фактичним GAS користувачем: читання відомого ID/Code, створення тестового Product/Assembly/Part, повторний пошук і updateType; перевірка, що ID резервуються та Elements записуються у той самий MASTER, стороння таблиця не змінюється, а BOM посилається на створені ID. Виконати також з іншою активною таблицею або без active context, де це дозволяє entry point. Записувальні контрольні сценарії потребують окремого дозволу й підготовлених тестових даних.

Роботу завершено для перевірки. Commit і deploy не виконано.
