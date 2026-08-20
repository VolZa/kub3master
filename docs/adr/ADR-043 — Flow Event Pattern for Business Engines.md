ADR-043 — Flow Event Pattern for Business Engines

Статус: Accepted

Дата: 2026-08-18

Контекст

Після прийняття ADR-041 та ADR-042 у системі з'явилися:

Material Consumption Engine;
Material Flow;
внутрішні доменні моделі типу Flow.

Під час проєктування було встановлено, що результат роботи Business Engine не є звітом, таблицею або записом Google Sheets.

Результатом є набір незалежних подій (Events), які можуть бути агреговані різними способами залежно від потреб конкретного бізнес-процесу.

Проблема

Business Engines використовуються різними підсистемами ERP:

планування;
виробництво;
склад;
звітність;
економічний аналіз.

Якщо кожен Engine буде повертати власні DTO або агреговані результати, виникне дублювання логіки та сильна залежність між модулями.

Рішення

Business Engines повинні повертати Flow Events.

Flow Event є атомарною, незмінною (immutable) подією, яка описує результат виконання бізнес-правила.

Business Engine ніколи не повертає агреговані дані.

Агрегація виконується окремими компонентами.

Архітектура
Business Engine
│
▼
Flow Events
│
┌───────────────┼────────────────┐
▼ ▼ ▼
Aggregator Presentation Other Engine
Основні принципи

1. Engine створює події

Engine не створює звіти.

Engine не виконує групування.

Engine не виконує сортування.

Engine лише створює Flow Events.

2. Flow Events є immutable

Після створення Event не змінюється.

Будь-яке перетворення створює нову колекцію.

3. Aggregator є окремим компонентом

Групування не належить Engine.

Aggregator може виконувати:

group by Material;
group by Product;
group by House;
group by Floor;
group by Diameter;
group by SteelClass;
group by Category;
group by Period. 4. Presentation Layer не виконує розрахунків

Presentation Layer лише:

відображає;
сортує;
форматує;
друкує;
експортує.
Базова модель Event

Кожен Flow Event повинен містити:

Context
OriginType
OriginId

ResourceId

Quantity
Unit

де:

Context — бізнес-контекст (PLANNING, PRODUCTION, ESTIMATION тощо);
OriginType — тип джерела (BOM, MANUAL, IMPORT, CORRECTION тощо);
OriginId — ідентифікатор джерела;
ResourceId — ідентифікатор ресурсу (для Material Flow — MaterialID);
Quantity — кількість;
Unit — одиниця виміру.
Material Flow

Material Flow є спеціалізацією загального Flow Event.

Flow Event
│
▼
Material Flow Event
Майбутні розширення

Такий самий шаблон можуть використовувати:

Labor Flow Event

Equipment Flow Event

Concrete Flow Event

Energy Flow Event

Transport Flow Event

Усі вони підпорядковуються одним принципам.

Наслідки
Переваги
єдина модель взаємодії між Business Engines;
відсутність дублювання DTO;
легке тестування Engine;
незалежність Engine від Presentation Layer;
можливість створення нових типів Flow без зміни архітектури;
повторне використання Aggregator.
Недоліки
збільшується кількість внутрішніх доменних моделей;
для великих потоків можуть знадобитися оптимізації та кешування.
Принципи
Business Engines повертають лише Flow Events.
Flow Events є immutable.
Engine не виконує агрегацію.
Aggregator не виконує бізнес-логіку.
Presentation Layer не виконує бізнес-логіку.
Один Engine може бути використаний багатьма бізнес-процесами без зміни своєї реалізації.
Я б запропонував ще одну невелику зміну термінології

У цьому ADR я спеціально використав поле ResourceId, а не MaterialId.

Чому?

Тому що це робить шаблон універсальним.

Наприклад:

Material Flow → ResourceId = MaterialID
Labor Flow → ResourceId = ProfessionID або OperationID
Equipment Flow → ResourceId = EquipmentID
Concrete Flow → ResourceId = ConcreteMixID

Тобто ADR-043 описує не матеріали, а загальний шаблон Flow Event, а ADR-042 вже конкретизує його для матеріалів. Це створює красиву ієрархію:

ADR-041 — звідки беруться дані (Material Consumption Engine);
ADR-042 — яка внутрішня модель використовується (Material Flow);
ADR-043 — загальний шаблон взаємодії Business Engines через Flow Events.

На мою думку, така послідовність зробить архітектуру ERP КУБ дуже цілісною і дозволить безболісно додавати нові "Flow"-моделі в майбутньому.
