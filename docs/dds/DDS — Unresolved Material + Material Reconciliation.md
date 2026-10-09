# DDS — Unresolved Material + Material Reconciliation / (Матеріал із невстановленим документальним походженням та узгодження матеріалу)

**Тип:** Domain Design Specification / (Доменна специфікація).
**Статус:** Accepted / (Прийнято).

**Другий редакційний прохід:** 2026-10-09.
**Номер:** не присвоєно; потребує окремого погодження.

Цей DDS об’єднує US-01 і US-02. ADR / (Архітектурне рішення) 048 є канонічним джерелом правил облікового періоду.

## Термінологія

- MaterialRequirement / (Потреба в матеріалі).
- MaterialAllocation / (Розподіл матеріалу).
- MaterialConsumption / (Споживання матеріалу).
- MaterialLossPolicy / (Політика технологічних втрат).
- Manufacturing / (Запис про виготовлення).
- BOM / (Специфікація складу виробу).
- MaterialFlow / (Матеріальний потік).
- MaterialBatch / (Партія матеріалу).
- UnresolvedReceipt / (Невизначене надходження).
- Unresolved Material Stock / (Матеріал із невстановленим документальним походженням).
- MaterialReconciliation / (Узгодження матеріалу).
- provenance / (походження).
- Shortage / (Нестача).
- Material Movement / (Рух матеріалу).
- write-off / (списання).
- MaterialAccountingClosedThrough / (Дата, до якої матеріальний облік закритий).
- Adjustment / (Облікове коригування).
- Correction / (Виправлення).
- weightPerMeter / (Маса одного метра матеріалу).
- persistence / (збереження даних).
- DTO / (Об’єкт передавання даних).
- repository / (сховище даних).
- Unresolved Material / (Матеріал із невстановленим документальним походженням).
- Material Reconciliation / (Узгодження матеріалу).
- reconciliation / (узгодження матеріалу).
- Actual Allocation / (Фактичний розподіл матеріалу).
- OPEN / (Відкритий період).
- CLOSED / (Закритий період).

Програмні ідентифікатори полів та фрагменти коду зберігають оригінальне написання.

- batch-specific weightPerMeter / (маса одного метра для конкретної партії).
- Deferred / (Відкладено).
- Open Design Question / (Відкрите питання проєктування).
- contract / (контракт).
- contracts / (контракти).
- interface / (інтерфейс).
- receipt quantity / (кількість фізичного приймання).
- primary flow quantity / (первинна технологічна кількість).
- accounting write-off quantity / (облікова кількість списання).
- quantity / (кількість).
- persistence model / (модель збереження даних).

- Material Flow / (Матеріальний потік) — джерельне написання MaterialFlow.
- Allocation / (Розподіл матеріалу) — скорочення MaterialAllocation у цьому DDS.
- Consumption / (Споживання матеріалу) — скорочення MaterialConsumption у цьому DDS.
- Requirement / (Потреба в матеріалі) — скорочення MaterialRequirement у цьому DDS.
- Actual / (Фактичний контекст).

## Прийняті правила

### US-01 — Unresolved Receipt History / (Історія невизначених надходжень)

**Статус:** Accepted / (Прийнято)

`Unresolved Material Stock` представляє агрегований поточний баланс
матеріалу, який фізично наявний або був використаний, але документальне
походження якого ще не встановлено.

Кожне фізичне надходження матеріалу з невстановленим документальним
походженням фіксується окремим історичним фактом `UnresolvedReceipt`.

`UnresolvedReceipt` щонайменше визначає:

- `materialId`;
- `receivedQuantity`;
- `receivedUnit`;
- `receivedAt`;
- ідентифікатор самого факту надходження.

`UnresolvedReceipt` не є `MaterialBatch` і не створює фіктивного
документа постачання.

`UnresolvedMaterialStock` є агрегованим станом, сформованим на основі
невирішених надходжень, їх споживання та reconciliation (узгоджень).

Подальша поява первинного документа може ідентифікувати повністю або
частково конкретний `UnresolvedReceipt` як `MaterialBatch`.

Така операція є MaterialReconciliation / (Узгодження матеріалу) і не збільшує загальну фізичну
кількість матеріалу.

UnresolvedReceipt повинен зберігати фактично виміряну кількість та її одиницю, а не обов'язково primary flow quantity.

### US-02 — Material Reconciliation / (Узгодження матеріалу)

**Статус:** Accepted / (Прийнято)

`MaterialReconciliation` є окремим обліковим фактом, який встановлює
документальне походження повністю або частково матеріалу, раніше
зафіксованого як `UnresolvedReceipt`, шляхом віднесення його до
конкретного `MaterialBatch`.

`MaterialReconciliation` не є новим фізичним надходженням матеріалу,
не є його споживанням або переміщенням і не збільшує загальну фізичну
кількість матеріалу.

#### Базовий принцип

Якщо матеріал був фізично прийнятий раніше без достатніх документальних
даних, він фіксується як `UnresolvedReceipt`.

Наприклад:

UnresolvedReceipt UR-001

materialId = R_12_A500C
receivedAt = 03.10.2026
receivedQuantity = 180
receivedUnit = кг

Після отримання або внесення первинного документа може бути створений:

MaterialBatch B-205

materialId = R_12_A500C
receivedAt = 03.10.2026
registeredAt = 10.10.2026
quantity = 150 кг
weightPerMeter = 0.900 кг/м

Reconciliation:

UR-001 ──150 кг──> B-205

Після reconciliation:

identified as B-205 = 150 кг
still unresolved = 30 кг
─────────────────────────────
physical quantity = 180 кг

Загальна фізична кількість матеріалу при reconciliation не змінюється.

#### Одиниця reconciliation

`MaterialReconciliation.quantity` задається в одиниці фізичного
приймання матеріалу.

Для лінійних матеріалів, які при прийманні фактично зважуються,
reconciliation виконується у масі (`кг`), навіть якщо технологічний
Material Flow, BOM, MaterialRequirement, MaterialAllocation та
MaterialConsumption використовують довжину (`м`) як primary flow
quantity.

Таким чином для лінійного матеріалу розділяються:

- receipt quantity / (кількість фізичного приймання) — фактично виміряна маса (`кг`);
- primary flow quantity / (первинна технологічна кількість) — довжина (`м`);
- accounting write-off quantity / (облікова кількість списання) — маса (`кг`), отримана при списанні через відповідний `weightPerMeter`.

`MaterialBatch.weightPerMeter` є характеристикою конкретної партії,
яка дозволяє виконувати перерахунок між масою партії та її
технологічною довжиною.

#### Часткове узгодження

Один `UnresolvedReceipt` може бути reconciled частково.

Наприклад:

UR-001 = 180 кг

MR-001:
UR-001 → B-205 = 150 кг

залишається:

UR-001 unresolved = 30 кг

Залишок не перетворюється автоматично на іншу партію і продовжує
існувати як unresolved material.

Один `UnresolvedReceipt` може бути частково reconciled з кількома
`MaterialBatch`.

Один `MaterialBatch` також може бути документальним визначенням
матеріалу з кількох `UnresolvedReceipt`.

Таким чином зв'язок між `UnresolvedReceipt` і `MaterialBatch`
реалізується через `MaterialReconciliation`, а не прямим полем
`batchId` у `UnresolvedReceipt`.

#### Інваріант ідентичності матеріалу

`UnresolvedReceipt` і `MaterialBatch`, що беруть участь у reconciliation,
повинні належати одному `MaterialID`.

Обов'язково:

UnresolvedReceipt.materialId === MaterialBatch.materialId

Reconciliation між різними матеріалами заборонена.

#### Кількісні інваріанти

Сумарна кількість reconciliation для конкретного `UnresolvedReceipt`
не може перевищувати його фактично прийняту кількість:

Σ reconciliation.quantity
<= UnresolvedReceipt.receivedQuantity

Сумарна кількість матеріалу, віднесена через reconciliation до
конкретного `MaterialBatch`, не може перевищувати документальну
кількість цієї партії:

Σ reconciliation.quantity
<= MaterialBatch.quantity

Порівняння виконується у сумісній одиниці фізичного приймання.

#### Часова семантика

`receivedAt` означає дату фактичного фізичного надходження матеріалу.

`registeredAt` означає дату внесення документальної інформації про
`MaterialBatch` до ERP.

Reconciliation не переносить фізичне надходження на дату внесення
документа.

Наприклад:

UnresolvedReceipt.receivedAt = 03.10.2026
MaterialBatch.receivedAt = 03.10.2026
MaterialBatch.registeredAt = 10.10.2026

означає, що матеріал фізично був доступний з 03.10.2026, хоча його
документальне походження було встановлено лише 10.10.2026.

#### Зв’язок із MaterialAllocation і MaterialConsumption

`MaterialReconciliation` сама не створює і не змінює
`MaterialConsumption`.

MaterialReconciliation змінює документальну визначеність походження матеріалу та може стати підставою для повторного MaterialAllocation у відкритому періоді. Вона не змінює вже створений immutable MaterialFlow.

Для відкритого облікового періоду результат повторного Allocation може
уточнити provenance існуючого `MaterialConsumption` відповідно до
MC-06 та MC-07.

Наприклад:

було:

MaterialConsumption MC-1001
└── provenance:
UnresolvedReceipt UR-001

після reconciliation та повторного Allocation:

MaterialConsumption MC-1001
└── provenance:
MaterialBatch B-205

якщо MaterialBatch B-205 за `receivedAt` був фізично доступний на дату
відповідного Manufacturing.

#### Закритий обліковий період

Якщо `MaterialConsumption` належить закритому обліковому періоду,
подальший `MaterialReconciliation` не переписує його історичний
provenance.

Reconciliation при цьому залишається окремим поточним обліковим фактом,
який встановлює пізніше визначене документальне походження матеріалу.

Таким чином система зберігає одночасно:

1. історичний стан знань, зафіксований у закритому
   `MaterialConsumption`;

2. пізніше встановлене документальне походження матеріалу,
   зафіксоване через `MaterialReconciliation`.

#### Мінімальна доменна модель

Концептуальний interface / (інтерфейс) MaterialReconciliation наведений для пояснення зв’язків. Він не є остаточною persistence model / (моделлю збереження даних) або TypeScript contract / (контрактом):

```typescript
interface MaterialReconciliation {
id: string;

unresolvedReceiptId: string;
materialBatchId: string;

quantity: number;
unit: string;

reconciledAt: Date;

comment: string;
createdAt: Date;
}
```

`materialId` не дублюється в `MaterialReconciliation`, оскільки він
визначається через `UnresolvedReceipt` і `MaterialBatch`.

Перед створенням reconciliation система зобов'язана перевірити
відповідність їх `materialId`.

#### Обґрунтування одиниць і пояснювальна схема

Reconciliation для лінійних матеріалів не виконується автоматично в primary flow unit / (первинній одиниці матеріального потоку). Воно виконується у фізичній одиниці, в якій матеріал був фактично прийнятий та може бути ідентифікований; для арматури в поточній моделі це кг.

А технологічний потік залишається:

Приймання
кг
│
▼
MaterialBatch
quantityKg + weightPerMeter
│
▼
доступний ресурс
м
│
▼
MaterialRequirement
MaterialAllocation
MaterialConsumption
м
│
▼
конкретний MaterialBatch.weightPerMeter
│
▼
Списання
кг

## Узгодження з ADR-048

Для одного MaterialID існує один логічний активний Unresolved Material Stock, побудований з історії надходжень, використання та узгоджень. Механізм діє протягом усього життя ERP / (Системи управління ресурсами підприємства), а не лише під час міграції.

Документальна неповнота не блокує облік. Окремо показуються unresolved-кількість, уже використана у виробництві, фізично доступний залишок і загальна кількість, не закрита накладними. Погоджена невизначеність не блокує закриття періоду; залишок переноситься через його межу без обнулення.

Ідентифікована кількість одночасно виключається з відповідної unresolved-частини; одна фізична кількість не може бути двічі врахована як Batch і Unresolved. Повторне застосування reconciliation не повинно подвійно змінювати залишок. Повний перелік правил періоду, пізніх документів і Adjustment залишається в ADR-048.

## Deferred / Open Design Question / (Відкладені рішення / Відкриті питання проєктування)

- Алгоритм зіставлення UnresolvedReceipt із MaterialBatch; сама поява накладної не доводить відповідність будь-якому попередньому споживанню.
- Вибір конкретного UnresolvedReceipt для provenance під час Actual Allocation.
- Перетворення фактично прийнятої маси в технологічну довжину, поки batch-specific weightPerMeter невідомий.
- Остаточні persistence, DTO, repository та Google Sheets contracts / (контракти).
- Конкретний механізм захисту від повторного застосування, одночасних операцій та Adjustment; прийняті інваріанти вже діють.
- UI / (Інтерфейс користувача) для reconciliation та деталі звітів.

## Пов’язані документи та джерела

- [ADR-048](<../adr/ADR-048 — Material Accounting Period Closure and Unresolved Stock.md>).
- [Material Consumption: MC-06 і MC-07](<DDS — Material Consumption.md>).
- [Material Allocation](<DDS — Material Allocation.md>).
- [Material Requirement](<DDS — Material Requirement.md>).
- [DDS-001](<DDS-001 - Material Flow.md>).
- Джерело US-01/US-02: C:/www/26/10/dds/DDS-001 - Material Flow.md; повні правила, інваріанти, rationale / (Обґрунтування) і приклади перенесені.

