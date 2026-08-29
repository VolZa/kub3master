MaterialConsumptionEngine EDD v1.0

Document Type: Engineering Design Document (EDD)

Status: Draft v1.0

Depends on:

ADR-018 Presentation Layer
ADR-041 Material Consumption Engine
ADR-042 Material Flow
ADR-043 Flow Event Pattern
ADR-044 Use Case as Orchestrator

1. Purpose
   Призначення

Material Consumption Engine відповідає за визначення фактичної потреби у матеріалах на основі структури виробу (BOM).

Engine є центральним компонентом ERP КУБ для всіх розрахунків використання матеріалів.

Engine НЕ відповідає за
списання матеріалів;
залишки;
партії;
звіти;
Google Sheets;
UI;
Presentation;
ProductionLog. 2. Responsibilities

Engine повинен:

✅ пройти структуру BOM

✅ визначити всі матеріали

✅ сформувати Material Flow Events

✅ повернути Material Flow

Engine НЕ повинен:

❌ агрегувати

❌ групувати

❌ записувати

❌ читати SpreadsheetApp

3. Inputs

Engine працює тільки з Domain Models.

Наприклад

Product

Quantity

BOM Tree

Calculation Context

Можливий інтерфейс

calculate(
product: Product,
quantity: number,
bom: BomTree,
context: CalculationContext
): MaterialFlow 4. Outputs

Єдиний результат

MaterialFlow

тобто

MaterialFlowEvent[] 5. Internal Architecture
MaterialConsumptionEngine
│
├── Traverser
├── EventBuilder
├── Validator
├── Facade
└── Aggregator (optional helper) 6. Component Responsibilities
Traverser

Відповідає лише за обхід дерева BOM.

Він не знає нічого про Material Flow.

Він лише говорить:

ось Material

ось Qty
EventBuilder

Створює

MaterialFlowEvent

Не виконує обходу.

Не агрегує.

Validator

Перевіряє

відсутні матеріали;
цикли BOM;
Qty <= 0;
некоректні одиниці виміру.
Facade

Публічний API Engine.

calculate(...)

Всередині викликає всі компоненти.

7. Traversal Algorithm
   Start Product

↓

Load root node

↓

Traverse child

↓

Assembly ?

↓

Yes

↓

Traverse recursively

↓

No

↓

Material ?

↓

Yes

↓

Create Event

↓

Continue 8. MaterialFlowEvent Lifecycle
BOM

↓

Traverser

↓

EventBuilder

↓

MaterialFlowEvent

↓

MaterialFlow Collection

↓

Return 9. MaterialFlowEvent

Поки що базова модель.

Context

OriginType

OriginId

ProductId

MaterialId

Quantity

Unit

Пізніше може бути розширена.

10. Context

Engine повинен підтримувати різні режими роботи.

Наприклад

PLANNING

PRODUCTION

ESTIMATION

SIMULATION

Business Rules можуть залежати від Context.

11. Origin

Origin визначає походження Event.

Приклади

BOM

MANUAL

IMPORT

CORRECTION 12. Error Handling

Engine повинен генерувати Domain Errors.

Наприклад

Circular BOM

Missing Material

Invalid Quantity

Unsupported Unit

Missing Product

Ніколи

Spreadsheet Error

Range Error

Sheet Error 13. Performance

Traversal повинен виконуватись

O(n)

де

n

кількість вузлів BOM.

14. Future Extensions

Engine повинен підтримувати:

кешування BOM;
паралельний розрахунок;
інші Flow;
альтернативні BOM;
технологічні варіанти;
різні редакції проектів. 15. Non-Goals

Engine ніколи не повинен:

друкувати звіт;
відкривати Google Sheets;
працювати зі SpreadsheetApp;
знати про MaterialBatch;
знати про ProductionLog;
знати про HTML. 16. Testing Strategy

Потрібні окремі тести для:

Traverser
BOM traversal
EventBuilder
MaterialFlowEvent creation
Validator
Invalid BOM

Cycles

Missing Materials
Facade

Повний сценарій

Product

↓

Material Flow 17. Definition of Done

Engine вважається завершеним, якщо:

✅ проходить будь-який BOM

✅ не залежить від Google Sheets

✅ не залежить від Repository

✅ повертає тільки MaterialFlow

✅ проходить Unit Tests

18. Open Questions (v1.0)

На цьому етапі залишаються питання, які ми свідомо відкладаємо до появи відповідних бізнес-сценаріїв:

Альтернативні BOM (кілька технологій виготовлення одного виробу).
Умовні гілки BOM (залежно від типу оснастки або обладнання).
Втрати матеріалу (технологічні відходи, коефіцієнти запасу).
Повторне використання матеріалів.
Кешування Material Flow для великих розрахунків.

Ці можливості не входять до версії 1.0, але архітектура Engine повинна дозволяти їх додати без зміни публічного API.
