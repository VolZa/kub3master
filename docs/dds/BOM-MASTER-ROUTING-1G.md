# ERP КУБ — Implementation Slice 1G

База: `f4d258f`. Локальна реалізація та перевірки з mocks. Google Sheets, Master-10 і реальні лічильники не змінювалися. Commit та clasp push/deploy не виконувалися.

## 1. Змінені та створені файли

Змінено:

- `src/modules/bom/bom.repository.ts` — усі звернення до 01_BOM переведено на явний MASTER.
- `src/modules/elements/root-element.service.ts` — calcAssemblyWeight використовує той самий MASTER BOM accessor.
- `src/utils/id.ts` — collision scan використовує ID для Elements і MaterialID для Materials.
- `src/modules/elements/element.mapper.ts` — canonical string ID через чинний normalizeIntegerId; нормалізація optional ParentMaterialID.
- `src/modules/elements/element.repository.ts` — нормалізація аргументів lookup/update, вставки та кешу.
- `src/utils/id.test.ts` — канонічна схема Materials у fixtures, додаткові перевірки заголовків.
- `src/modules/elements/element-repository-master.test.ts` — числові мігровані/legacy ID, updateType і відсутність хибних збігів.

Створено:

- `src/modules/bom/tests/bom-master-routing.test.ts` — routing tests з GAS mocks і перевірка typed expansion factory.
- `docs/dds/BOM-MASTER-ROUTING-1G.md` — цей звіт.

`docs/dds/MIGRATION-VERIFICATION.md` не редагувався і не входить до змін Slice 1G.

## 2. Остаточна маршрутизація BOM

`getMasterBOMSheet()` у bom.repository.ts викликає наявний `SpreadsheetProvider.open(SpreadsheetKey.MASTER)` і отримує 01_BOM. Відсутній аркуш спричиняє помилку `Лист 01_BOM не знайдено в MASTER`; fallback та автоматичного створення немає.

Accessor використовують insertBOMRows, deleteBOMByParentId, deleteBOMTree, replaceBOMForParent і getAllBOMRows. getChildrenRows/getParentsRows/hasChildren та GoogleSheetsBOMRepository успадковують цей маршрут через getAllBOMRows. calcAssemblyWeight також використовує accessor.

getBOMExpansionService змін не потребував: його getAllBOMRows тепер читає MASTER; Elements, Materials і Catalog уже використовували MASTER. Тест factory виконує справжні BOM reader, ElementRepository, Material datasource та typed expansion на mocked MASTER; лише Catalog factory замінено локальним шаблоном.

Публічні read/write-контракти, алгоритм заміни, порядок колонок, aggregation і deduplication не змінені. getSheetByNameSafe та SpreadsheetProvider залишено без змін. Прямих звернень до active spreadsheet для джерела 01_BOM у runtime src не залишилося.

## 3. Виправлення MaterialID

readOccupiedIds приймає назву ID-колонки. Оркестрація generateIdByType явно задає `00_Elements.ID` та `05_Materials.MaterialID`. Заголовок має бути присутнім рівно один раз. Помилки вказують фактичну назву колонки, лист і, для некоректного значення, рядок.

Збережено всі рядки, включно з неактивними, числову нормалізацію, відхилення непорожніх некоректних значень, історичні резерви, LastID, ScriptLock, flush і finally. id.logic.ts і числові правила генератора не змінено.

Незмінна карта: Product 4000000–4000013, історичний LastID 4000013; Part 2000000–2000009, історичний LastID 2000009. За відсутності вищих резервувань наступні ID — 4000014 та 2000010. Material починається з 1000001, Assembly — з 3000001. Тип існуючого Element не визначається за діапазоном.

## 4. Нормалізація Element ID

normalizeElementId є тонкою обгорткою над наявним normalizeIntegerId: числовий результат перетворюється на canonical string. Це єдине числове правило, спільне з генератором, без parseInt або нового алгоритму.

Sheet mapper нормалізує ID та непорожній ParentMaterialID. Репозиторій нормалізує ID перед insert, findById і updateType; findPartByMaterial нормалізує аргумент Material ID. Вставка зберігає нормалізований рядок у локальному кеші.

Числа 4000000, 2000000, 4185 і відповідні рядки збігаються. Зовнішні пробіли та початкові нулі нормалізуються чисельно. Некоректний аргумент findById/findPartByMaterial повертає null; некоректні збережені ID, вставка та updateType кидають помилку. Порожній optional ParentMaterialID зберігається порожнім, відсутній — undefined. Дані Sheets при читанні не переписуються. Code, Type, Category, ProjectDocumentID та бізнес-пошук не змінено.

BOMReferenceResolver не змінено: normalizeReferenceId має текстову семантику, обрізає пробіли, але зберігає початкові нулі. BOM reader теж зберігає чинне String-перетворення без числової canonicalization. Тому BOM із рядковим ChildID `02000000` не зобов'язаний збігтися з canonical Element ID `2000000`. Для звичайних мігрованих чисел/рядків без початкових нулів семантика узгоджена. Окреме рішення: погодити загальний контракт reference ID і регресійні тести перед зміною resolver; не виправляти реальні дані або Accepted ADR у цьому slice.

## 5. Результати перевірок

- Релевантні suites BOM routing, Elements MASTER і ID generator: 74 passed (14 + 10 + 50).
- `npm run build`: passed.
- `npx vitest run`: 210 passed / 3 відомі legacy failures, 20 test files.
- `git diff --check`: passed.

Три наявні failures: bom-material-matrix.integration, bom-materials.service, project-material-matrix.integration — очікуваний матеріал 3201 відсутній у результаті. Старі тести не змінено й не вимкнено. Fixtures генератора змінено лише для канонічного MaterialID; існуючий сценарій відсутнього обов'язкового заголовка збережено.

BOM tests покривають читання, insert/update, replace, delete parent/tree, повторне читання, відсутній аркуш, сторонню/відсутню active spreadsheet, calcAssemblyWeight та typed expansion. В усіх сценаріях підтверджено відсутність active access, сторонніх звернень і створення аркушів. Реальний MASTER не відкривався.

## 6. Залишкові ризики

- clearContents/setValues залишаються двома операціями; збій після очищення може втратити BOM.
- buildBOMFromTable досі записує успішні рядки попри помилки інших; порожній результат може видалити склад.
- Element і резерв LastID можуть залишитися після помилки формування/запису BOM.
- ScriptLock захищає лише резервування ID, а не створення бізнес-сутності або заміну BOM; concurrent rewrites можуть втратити зміни.
- Кеші репозиторіїв не утворюють атомарного знімка та не оновлюються від зовнішніх правок.
- Незмінна схема BOM використовує позиційні колонки; їх порядок/ширина потребують підтвердження.
- Непорожні некоректні Element ID/ParentMaterialID тепер явно блокують завантаження репозиторію. Це не прихована міграція; потрібна read-only перевірка якості даних перед deploy.
- Typed resolver і числова модель Elements мають описану вище відмінність для неканонічних текстових ID.
- Форма досі має обмежену обробку failure/partial success; це не змінювалося.

## 7. Питання для Slice 1H

Погоджене правило: якщо хоча б один рядок специфікації помилковий, наявний BOM не змінюється; порожня специфікація не є видаленням. У 1G це правило навмисно не впроваджено.

Для 1H потрібно визначити prevalidation до BOM write, політику щодо вже створених Elements/зарезервованих ID, явну операцію видалення, scope lock для concurrent writers із урахуванням ScriptLock генератора, повторне читання перед записом, безпечну фізичну заміну/відновлення та повідомлення оператору. Окремо визначити вплив deduplication на інших батьків і повторне введення того самого складу.

## 8. Перед GAS deploy

Після окремого погодження перевірити права execution user на configured MASTER; наявність 00_Elements.ID, 05_Materials.MaterialID, 01_BOM та погоджених колонок. Виконати read-only пошук числових/рядкових мігрованих і legacy ID та expansion відомого виробу, включно з відсутньою/сторонньою active spreadsheet.

Записувальні сценарії виконувати лише на погоджених тестових даних: ID reservation і Element insert у той самий MASTER, insert/replace та повторне читання BOM, відсутність змін сторонніх таблиць. До реалізації 1H поточний writer не гарантує погоджене правило збереження BOM при помилках, безпечне відновлення або захист від паралельного перезапису.

Роботу завершено для перевірки власником ERP, без commit і deploy.
