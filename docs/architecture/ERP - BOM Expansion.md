Архітектурне рішення

BOM Expansion виділяємо в окремий універсальний механізм:

01_BOM
↓
InMemoryBOMRepository
↓
BOMExpansionService
↓
деталізовані BOM Expansion Rows
↓
Product-level Aggregation
↓
┌─────────────────────────┐
│ Product Specification │
│ Material Matrix │
│ Material Consumption │
│ інші звіти │
└─────────────────────────┘

Ключові правила:

рекурсія працює через directQty;
totalQty накопичується множенням по ланцюжку;
під час Expansion не агрегуємо однакові елементи;
path зберігається для кожної гілки;
рекурсія завершується на terminal material;
material із Recipe у майбутньому може бути розгорнутий далі;
агрегування виконується окремим етапом у межах одного Product;
ключ агрегації: elementId + unit;
BOMExpansionService не повинен бути прив'язаний до конкретного звіту.

Це рішення вважаємо базовим для наступного етапу.

Наступний крок: визначаємо BOMExpansionRow і точний контракт BOMExpansionService, після чого вже реалізуємо його невеликим окремим модулем.

Ще одне рішення, яке пропоную зафіксувати

BOMExpansionRow не повинен містити productId.

Причина проста: Product є контекстом усього Expansion, а не властивістю кожного вузла.

Тобто:

expandProduct(productId)

вже визначає, для якого Product отримані рядки.

А якщо пізніше нам знадобиться пакетний Expansion кількох Product, тоді зробимо окремий рівень контексту.

Отже, зараз фіксуємо три речі:

BOMExpansionRow — детальний, неагрегований результат.
BOMExpansionService.expandProduct(productId) — основний контракт.
Aggregation — окремий наступний етап, не частина Expansion.
