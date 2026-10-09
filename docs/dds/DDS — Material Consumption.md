# DDS — Material Consumption / (Споживання матеріалу)

**Тип:** Domain Design Specification / (Доменна специфікація).
**Статус:** Accepted / (Прийнято).

**Другий редакційний прохід:** 2026-10-09.
**Номер:** не присвоєно; потребує окремого погодження.

Цей документ містить повну прийняту серію MC-01–MC-07. Правила облікового періоду застосовуються за ADR / (Архітектурне рішення) 048.

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
- MaterialConsumptionLine / (Рядок споживання матеріалу).
- MaterialConsumptionSource / (Джерело споживання матеріалу).
- ProductionConfirmed / (Підтвердження виготовлення).
- PRODUCED / (Виготовлено).
- Placement / (Позиція розміщення виробу).
- ProductInstance / (Екземпляр виробу).
- Actual MaterialAllocation / (Фактичний розподіл матеріалу).
- Actual Allocation / (Фактичний розподіл матеріалу).
- MaterialAllocationEngine / (Механізм розподілу матеріалу).
- OPEN / (Відкритий період).
- CLOSED / (Закритий період).

Програмні ідентифікатори полів та фрагменти коду зберігають оригінальне написання.

- batch-specific weightPerMeter / (маса одного метра для конкретної партії).
- Deferred / (Відкладено).
- Open Design Question / (Відкрите питання проєктування).
- contract / (контракт).
- contracts / (контракти).
- quantity / (кількість).

- Material Flow / (Матеріальний потік) — джерельне написання MaterialFlow.
- Policy / (Політика технологічних втрат) — скорочення MaterialLossPolicy у цьому DDS.
- Allocation / (Розподіл матеріалу) — скорочення MaterialAllocation у цьому DDS.
- Consumption / (Споживання матеріалу) — скорочення MaterialConsumption у цьому DDS.
- Requirement / (Потреба в матеріалі) — скорочення MaterialRequirement у цьому DDS.
- Planning / (Планування).
- Actual / (Фактичний контекст).
- Write-off / (списання).

## Прийнятий напрямок фактичного обліку

```text
Manufacturing
  → MaterialRequirement (чиста потреба)
  → MaterialLossPolicy
  → Actual MaterialAllocation
  → MaterialConsumption
  → Material Movement / Write-off
```

Матеріальні втрати не включаються до самого MaterialRequirement. MaterialLossPolicy визначає кількість із нормативними втратами для забезпечення Actual Allocation та відображення в Consumption. У v1 / (першій версії) MaterialLossPolicy документується тут; окремий DDS для неї не створюється.

## Прийняті доменні правила

### MC-01 — Consumption Trigger / (Підстава виникнення споживання) — Accepted

MaterialConsumption виникає внаслідок підтвердження фактичного
виготовлення продукції (ProductionConfirmed).

У поточній моделі ERP КУБ такому підтвердженню відповідає
перехід Manufacturing у стан PRODUCED.

Створення або планування Manufacturing саме по собі
не створює MaterialConsumption.

Для одного підтвердженого Manufacturing не допускається
створення дублюючих активних MaterialConsumption.

### MC-02 — Placement Relationship / (Зв’язок із позицією розміщення) — Accepted

MaterialConsumption не має обов'язкового прямого зв'язку
з Placement.

Первинним виробничим джерелом MaterialConsumption є Manufacturing.

Зв'язок із Placement, якщо він існує, визначається через
виробничий контекст Manufacturing та/або подальше призначення
ProductInstance.

### MC-03 — Consumption Granularity / (Рівень деталізації споживання) — Accepted

Один MaterialConsumption відповідає одному підтвердженому
Manufacturing.

MaterialConsumption охоплює всю фактично підтверджену
Manufacturing.quantity.

Матеріальні складові представляються окремими
MaterialConsumptionLine.

ProductInstance не отримує штучно розподілену частину
MaterialConsumption, якщо фактична виробнича трасованість
цього не підтверджує.

### MC-04 — Material Consumption Line / (Рядок споживання матеріалу) — Accepted

MaterialConsumptionLine представляє споживання одного MaterialID у межах одного MaterialConsumption.

Рядок фіксує чисту потребу (netQuantity), норматив технологічних втрат (lossPercent), кількість нормативних втрат (lossQuantity) та загальну кількість, визнану спожитою (consumptionQuantity).

consumptionQuantity = netQuantity + lossQuantity.

Кількості задаються у первинній фізичній одиниці матеріалу. Для довгомірних матеріалів первинною величиною є довжина; маса є похідною розрахунковою величиною.

Походження consumptionQuantity повинно бути простежуваним до результату Actual MaterialAllocation: конкретного MaterialBatch, конкретного UnresolvedReceipt та, за наявності, непокритої частини Shortage. Unresolved Material Stock є агрегованим станом доступності для Allocation; історичний provenance MaterialConsumption фіксує конкретне надходження згідно з MC-07. Алгоритм вибору конкретного UnresolvedReceipt залишається Deferred / (Відкладеним).

Shortage не скасовує підтверджений MaterialConsumption і не перетворюється автоматично на Unresolved Material Stock.

### MC-05 — Material Loss Policy / (Політика технологічних втрат) — Accepted

Норматив технологічних втрат є окремою MaterialLossPolicy і не є єдиним глобальним відсотком MaterialConsumption.

Норма втрат визначається залежно від матеріалу або його категорії.

MaterialLossPolicy застосовується до чистого MaterialRequirement і визначає нормативну величину втрат та кількість матеріалу, що підлягає віднесенню на виробництво.

MaterialConsumption фіксує результат застосованої на момент розрахунку політики: чисту потребу, норматив втрат та кількість, визнану спожитою.

Подальша зміна нормативної політики не змінює автоматично історичний MaterialConsumption.

### MC-06 — Material Consumption Lifecycle / (Життєвий цикл споживання матеріалу) — Accepted

MaterialConsumption створюється внаслідок підтвердження фактичного виробництва (ProductionConfirmed) відповідно до MC-01.

Для одного підтвердженого Manufacturing існує один актуальний MaterialConsumption; повторний запуск розрахунку не створює дубліката.

Поки Manufacturing.date та MaterialConsumption.accountingDate належать відкритому обліковому періоду, обліково значущі дані підтвердженого Manufacturing, зокрема date, productCode та quantity, можуть бути виправлені. Таке виправлення викликає перерахунок залежного Material Flow:

Manufacturing
↓
MaterialRequirement
↓
MaterialLossPolicy
↓
Actual MaterialAllocation
↓
MaterialConsumption

Виправлення Manufacturing.date дозволяється лише тоді, коли нова дата також належить відкритому обліковому періоду.

У відкритому періоді також допускається уточнення MaterialAllocation, походження матеріалу (MaterialBatch / Unresolved) та інших залежних розрахункових даних.

Після закриття облікового періоду Manufacturing та пов'язаний з ним MaterialConsumption не змінюються автоматичним перерахунком і розглядаються як історичні облікові факти.

Виявлені після закриття помилки виправляються через окремий механізм Adjustment / Correction у поточному відкритому періоді без переписування закритої історії.

Стан OPEN/CLOSED не зберігається як окремий статус MaterialConsumption, а визначається за датою та MaterialAccountingClosedThrough.

Окремий MaterialConsumptionStatus у першій версії не вводиться без конкретної бізнес-потреби.

### MC-07 — Actual Allocation Provenance / (Походження фактичного розподілу) — Accepted

Actual MaterialAllocation є результатом роботи MaterialAllocationEngine для підтвердженого Manufacturing і в першій версії не зберігається як окремий постійний обліковий документ.

Результат Actual Allocation, який став підставою для MaterialConsumption, зберігається як provenance відповідного MaterialConsumptionLine.

Provenance складається з MaterialConsumptionSource та визначає кількість споживання, віднесену до конкретного MaterialBatch, конкретного UnresolvedReceipt або непокритої частини Shortage.

**Редакційне пояснення:** MaterialConsumptionSource тут визначає доменне поняття provenance і не встановлює остаточного TypeScript або persistence contract.

Для MaterialBatch та UnresolvedReceipt діє часовий інваріант: джерело може бути використане лише для Consumption, дата якого не раніше фізичного receivedAt відповідного джерела.

У відкритому обліковому періоді provenance може уточнюватися внаслідок повторного Allocation або MaterialReconciliation.

Після закриття періоду provenance є частиною незмінної історії MaterialConsumption і автоматично не переписується подальшою reconciliation.

MaterialReconciliation / (Узгодження матеріалу) є окремим доменним фактом і не створює нового фізичного надходження матеріалу.

## Пояснення меж відповідальності

MaterialAllocation є розрахунковим результатом, а MaterialConsumption — обліковим фактом споживання. Результат Actual Allocation зберігається через MC-07, а не як окремий постійний обліковий документ. Approved / (Затверджено) та ApprovedAt / (Момент затвердження) не є станами канонічного Allocation v1.

Зміну фізичного матеріального залишку виконує подальший Material Movement / Write-off. Його повний DDS зараз не створюється: журнал рухів і транзакційна модель не визначені.

Reconciliation у відкритому періоді може бути підставою уточнення provenance через повторний Allocation. Пізніше встановлене документальне походження закритого Consumption фіксується окремим MaterialReconciliation без автоматичного переписування історичного provenance. Пізні коригування регулює ADR-048.

## Пояснювальні приклади довжини та партійної маси

Ці приклади перенесені з ранніх операційних редакцій Material Flow. Вони показують тільки розподіл заданої довжини та перерахунок маси; не встановлюють нульового нормативу втрат або остаточного write-off контракту.

Один Manufacturing М00000080 може використовувати кілька партій. Для розподілюваної довжини 107 м:

У ранньому прикладі характеристик B001 також наведено RemainingQty = 1250 кг і weightPerMeter = 0.895 кг/м. Це пояснювальні значення конкретного прикладу, а не новий persistence-контракт.

| Партія | Довжина | weightPerMeter | Похідна маса |
|---|---|---|---|
| B001 | 70 м | 0.895 кг/м | 62.650 кг |
| B002 | 37 м | 0.888 кг/м | 32.856 кг |
| Разом | 107 м | різний для кожної партії | 95.506 кг |

Уточнення B001.weightPerMeter з 0.888 до 0.895 змінює похідну масу для тих самих 70 м з 62.160 до 62.650 кг. Геометрична довжина при цьому не змінюється. Допустимість перерахунку Consumption визначають MC-06/MC-07 та ADR-048, а не approval-стан / (Стан затвердження) Allocation.

Історичний арифметичний приклад зміни залишку: 1000 − 62.650 = 937.350 кг. Він пояснює окрему відповідальність подальшого списання й не встановлює, що Allocation сам змінює MaterialBatch.remainingQty.

## Deferred / Open Design Question / (Відкладені рішення / Відкриті питання проєктування)

- Точна формула MaterialLossPolicy, округлення та вибір нормативу під час повторного розрахунку.
- Застосування MaterialLossPolicy у Planning / (Плановому контексті).
- Вибір конкретного UnresolvedReceipt для provenance.
- Перетворення unresolved-маси в технологічну довжину до встановлення batch-specific weightPerMeter.
- Остаточні persistence, DTO, repository та Google Sheets contracts / (контракти); фіксація історичних значень і технічна версійність.
- Material Movement / Write-off journal / (Журнал рухів і списання), transaction model / (Транзакційна модель), concurrency / (Узгодженість одночасних операцій) та idempotency / (Захист від повторного застосування операції).
- Конкретна модель Adjustment / Correction, UI / (Інтерфейс користувача) та деталі звітів.

## Пов’язані документи та джерела

- [Material Requirement](<DDS — Material Requirement.md>).
- [Material Allocation](<DDS — Material Allocation.md>).
- [Unresolved Material + Material Reconciliation: US-01 і US-02](<DDS — Unresolved Material + Material Reconciliation.md>).
- [ADR-048](<../adr/ADR-048 — Material Accounting Period Closure and Unresolved Stock.md>).
- [DDS-001](<DDS-001 - Material Flow.md>).
- Джерело повних MC-01–MC-07: C:/www/26/03/kub3master-ts/docs/dds/Робоча сакція майбутнього DDS.md.
- Умови v1 і межа чистої потреби: остаточні рішення власника H.1–H.7 та погоджене завдання першої хвилі.

