# ERP КУБ — Product BOM Policy, Slice 1H.2C

Базовий коміт: `ef02934`. Локальна реалізація з mocks. Commit, clasp push/deploy, зміни Google Sheets і Master-10 не виконувалися.

## Змінені файли

- `src/modules/bom/preparation/bom-preparation.service.ts`: спільний Prepare з Product policy, перевіркою множини кандидатів та розділеною ідентичністю.
- `src/modules/bom/preparation/bom-preparation.model.ts`: rootType, component identity та writeScope.
- `src/modules/bom/tests/bom-preparation.test.ts`: уточнені fixtures і 63 тести.
- `docs/dds/PRODUCT-BOM-POLICY-1H2C.md`: цей звіт.

Незмінені: writer/replaceBOMForParent, фізичний запис 01_BOM, генератор ID, BOMReferenceResolver/BOMExpansionService, MaterialFlow/MaterialRequirement, форма й чинний записувальний маршрут, Accepted DDS/ADR та MIGRATION-VERIFICATION.md.

## Остаточна технологічна політика

Уточнення власника замінює попередній висновок аудиту 1H.2B про абсолютну заборону нових дочірніх Parts під Product.

Product може бути новим pending root. Проєктні Parts/Assemblies мають уже існувати; відсутність дає row diagnostic без partial prepared plan. Матеріальна Part із canonical Material і допустимою геометрією може бути запланована під Product, Assembly або Part. Прямий Material, зокрема C20/25, використовується за canonical MaterialID без проміжного Element.

Для нової матеріальної Part формується один pending row, Parent→Part із агрегованою кількістю та один Part→Material із витратою на одиницю. Приклад 1+2 Parts з витратою 0,46 кг дає 3 шт і 0,46 кг. Existing матеріальна Part повторно використовується без планування її вихідного BOM. Це стосується і Parts з історичними ID, наприклад 4001; тип не визначається за числовим діапазоном.

Збережено окреме введення Assembly з новими матеріальними Parts і нової/існуючої кореневої проєктної Part без обов'язкового ParentMaterialID. Для Assembly/Part залишено чинний geometry/Catalog шлях планування допустимих інших Elements. Обмеження старої factory на створення нової проєктної Part як дочірньої без Material залишається; створення такої Part як кореня підтримується. Відсутні assembly/unknown із непридатною для створення специфікацією не створюються автоматично.

## Ідентичність і неоднозначність

Prepare читає snapshot усіх підтриманих Element Types через наявний `findByType`, щоб мати всіх кандидатів. First-match методи не використовуються як доказ унікальності. Це мінімальна зміна read-only dependency Prepare, без змін ElementRepository чи таблиці Elements.

Проєктний компонент визначається Catalog Type, точним Code і документами пошуку. Точні document matches перевіряються в порядку ProjectDocumentResolver; лише після відсутності точних збігів у доступних документах допускається чинний fallback до запису без документа. Вибір іншого непов'язаного документа не допускається. Дублікати у вибраному контексті, невідповідний Type або material origin у компоненті, очікуваному як проєктний, повертають діагностику. Пошук не приховує неоднозначність вибором першого запису.

Матеріальна Part визначається через material Catalog template, supportsLength, parsed geometry, MaterialResolver та normalized built Code. Всі Elements з відповідним normalized Code перевіряються: Type має бути part, ParentMaterialID має збігатися чисельно з canonical MaterialID; геометричні поля, class і profile мають відповідати побудованій заготовці. ProjectDocumentID не є обов'язковим для material Part і сам по собі не замінює material identity. Конфліктний Code/Type/MaterialID/geometry/profile/class або кілька кандидатів блокують Prepare без створення дубліката. Матеріальні Codes нормалізуються чинним normalizeCode; класи — normalizeClassName; ID — normalizeIntegerId.

Додатково перевірено неоднозначність canonical Materials із характеристиками, які використовує чинний MaterialResolver. Direct Material lookup зберігає перевірку неоднозначного Code у MaterialRepository. Структура 00_Elements, Code та дані репозиторіїв не переписуються.

Root також перевіряється за Catalog Type та документною ідентичністю; неоднозначний або конфліктний root блокує план.

## PreparedBOM для майбутнього Commit

- `rootType` явно задає product/assembly/part відповідно до перевіреного кореня.
- `parent` зберігає existing або pending root.
- `components[].identity` містить project-element, material-part або direct-material, Code, document/material context і geometry для material Part.
- `writeScope.root` — кореневе посилання.
- `writeScope.initializeMaterialBOMFor` — localKeys лише нових pending material Parts, для яких сформовано початкові Part→Material.

Для Product допустимий логічний scope — прямий BOM root плюс початковий material BOM лише Parts, фактично створених цією операцією. У плані немає outgoing BOM існуючих дочірніх Elements.

Commit має повторно перевірити identities і mappings. Якщо pending Part уже існує на момент Commit, її outgoing material edge не можна застосовувати лише тому, що localKey був у початковому scope. Scope не є доказом створення та не замінює revalidation/operation state. Компоненти та pending refs не містять нових зарезервованих ID.

## Перевірки

- Релевантний Vitest Prepare: 63/63 passed.
- `npm run build`: passed.
- Ізольований strict TypeScript check model/service/tests: passed.
- `npx vitest run`: 273 passed / 3 відомі legacy failures, 21 test file.
- `git diff --check`: passed.

Відомі failures незмінні: bom-material-matrix.integration, bom-materials.service, project-material-matrix.integration — матеріал 3201 відсутній у результаті. Старі тести поза Prepare не змінено та не вимкнено.

Покрито new/existing Product із existing project Parts/Assemblies і concrete; відсутні проєктні Part/Assembly; ГСк-1 у документі 9 без ParentMaterialID; матеріальну Part 4001/R_12_A500C_L400 із MaterialID 3014 без документа; різні документи; duplicate/type/material/geometry/class/profile conflicts; ambiguous canonical Materials; normalized material Code; root ambiguity; повторення 1+2; scope без existing child BOM; new/existing project root Part і Assembly з новою material Part.

Чинні geometry creation tests rebar/angle/plate та pending deduplication перенесено до Assembly-сценарію, а не видалено. Окремі Product тести підтверджують уточнений дозвіл на new material Parts. У всіх Prepare tests збережено zero calls генератора, insert/update, BOM writers, SpreadsheetApp та LockService і рівність repository snapshots до/після.

## Залишкові ризики та наступний крок

Prepare не читає й не ремонтує власний BOM existing Part. При відсутньому material link потрібна окрема діагностика/політика recovery, а не автоматичний overwrite під час Product input.

Конфлікт або відсутня геометрія у stored material Part повертається як помилка; Prepare не домислює характеристики та не виправляє реальні дані. Точні проєктні Codes залишаються точними, матеріальні Codes нормалізуються; це різні правила ідентичності.

Snapshots не гарантують актуальності між Prepare і Commit. Потрібні revalidation, resolution localKeys, перевірка фактичного створення нових Parts, збереження інших ParentID, recovery і verification. Safe Commit не реалізовано.

Чинний writer все ще виконує глобальний deduplication і clearContents/setValues; writeScope PreparedBOM ще не застосовується до робочої форми. Тому інваріант фізичної незмінності чужих ParentID має бути забезпечений майбутнім Safe Commit/writer, а не оголошений уже реалізованим.

Роботу завершено для перевірки власником ERP, без commit і deploy.

## Життєвий цикл самостійної матеріальної Part

Додатковий інваріант власника підтверджено для PreparedBOM без зміни production-коду: material Part lookup не обмежений документом або батьком, використовує material identity та геометрію. Наявна Part передається як копія existing-element з її ID; її характеристики не змінюються, outgoing BOM не планується. Pending material Part має порожній ProjectDocumentID і не є власністю Product, який ініціював створення.

Додано 8 регресійних сценаріїв: повторне використання спільної Part іншим Product/Assembly/Part у іншому документі; зміна специфікації з R_12_A500C_L400 на R_14_A500C_L500 з existing або pending новою Part; окремі зміни діаметра, довжини та класу. Тести перевіряють збереження старої Part і характеристик, відсутність outgoing edges старої/повторно використаної Part, scope лише root та нової pending Part, zero calls generator/insert/update/BOM writers і незмінність snapshots. Жодних cleanup/deletion інструкцій план не містить.

Майбутній Safe Commit повинен замінювати лише прямі зв'язки поточного root і ініціалізувати матеріальний BOM лише фактично створених цією операцією Parts. Старі Parts залишаються в Elements незалежно від використання; їхні власні BOM і зв'язки інших ParentID зберігаються. Автоматичне orphan cleanup, оновлення геометрії старої Part або каскадне видалення заборонені. Зміна identity означає reuse іншої Part або створення нової. Якщо pending Part уже створена іншою операцією, її ID повторно використовується без нового reservation та без outgoing BOM overwrite.

Ці тести доводять властивості плану Prepare, а не фізичне збереження після Commit: Safe Commit ще відсутній, чинний writer не змінено й він не гарантує незмінність інших ParentID. Перевірки persistent BOM preservation, збоїв і concurrency потрібно реалізувати разом із Safe Commit. У цьому уточненні змінено лише Prepare tests та цей звіт.
