# DDS-001 — Material Flow / (Матеріальний потік)

**Тип:** Domain Design Specification / (Доменна специфікація)

**Статус:** Accepted / (Прийнято)

**Другий редакційний прохід:** 2026-10-09.

**Версія джерела:** 1.0

**Редакційна консолідація:** 2026-10-07

**Дата в джерелі:** 2026-08-19

---

## Термінологія

- MaterialFlow / (Матеріальний потік).
- MaterialFlowEvent / (Подія матеріального потоку).
- BOM / (Специфікація складу виробу).
- MaterialRequirement / (Потреба в матеріалі).
- MaterialAllocation / (Розподіл матеріалу).
- MaterialConsumption / (Споживання матеріалу).
- MaterialBatch / (Партія матеріалу).
- Business Engines / (механізми бізнес-розрахунку).
- Business Engine / (механізм бізнес-розрахунку).
- Business Layer / (Бізнес-рівень).
- Batch Allocation Engine / (Механізм розподілу за партіями).
- Material Consumption Engine / (Механізм розрахунку споживання матеріалу).
- Planning Engine / (Механізм планування).
- Presentation Layer / (Шар відображення).
- Persistence Layer / (Шар збереження даних).
- Reports / (Звіти).
- Product Passport / (Паспорт виробу).
- Material Demand / (Потреба в матеріалах).
- Cost Calculation / (Розрахунок вартості).
- Origin / (Походження розрахунку).
- Context / (Бізнес-контекст).
- Domain Value Object / (Доменний об’єкт-значення).
- immutable / (незмінний).
- Aggregation / (Агрегація).
- Presentation / (Відображення).
- Single Source of Truth / (Єдине канонічне джерело істини).
- Product / (Виріб).
- ProductInstance / (Екземпляр виробу).
- House / (Будинок).
- Project / (Проєкт).
- Repository / (сховище даних).
- DTO / (Об’єкт передавання даних).
- Waste Flow / (Потік відходів).
- Concrete Flow / (Потік бетону).
- Equipment Flow / (Потік використання обладнання).
- Labor Flow / (Потік трудовитрат).
- Energy Flow / (Потік енергії).
- Transport Flow / (Потік транспорту).

- Event / (Подія). У межах цього DDS скорочення означає саме MaterialFlowEvent, а не ProductionConfirmed / (Підтвердження виготовлення) чи іншу domain event / (доменну подію).
- ID / (Ідентифікатор).
- PLANNING / (Плановий контекст); PRODUCTION / (Виробничий контекст); ESTIMATION / (Оцінювальний контекст); SIMULATION / (Контекст моделювання).
- IMPORT / (Імпортоване походження); MANUAL / (Ручне походження); CORRECTION / (Походження з коригування).
- By Material / (За матеріалом); By Diameter / (За діаметром); By Steel Class / (За класом сталі); By Category / (За категорією); By Product / (За виробом); By House / (За будинком); By Project / (За проєктом); By Period / (За періодом).

- Deferred / (Відкладено).
- Open Design Question / (Відкрите питання проєктування).
- contract / (контракт).
- contracts / (контракти).

- Material Flow / (Матеріальний потік) — джерельне написання MaterialFlow.
- Allocation / (Розподіл матеріалу) — скорочення MaterialAllocation у цьому DDS.
- Consumption / (Споживання матеріалу) — скорочення MaterialConsumption у цьому DDS.
- Requirement / (Потреба в матеріалі) — скорочення MaterialRequirement у цьому DDS.
- Planning / (Планування).
- Actual / (Фактичний контекст).

## 1. Призначення

Material Flow є внутрішньою доменною моделлю ERP КУБ, що описує використання матеріалів у процесі виконання виробничих або розрахункових операцій.

Material Flow не є моделлю збереження даних.

Material Flow не є звітом.

Material Flow не є DTO.

Material Flow існує лише всередині бізнес-логіки ERP.

---

## 2. Мета

Основне призначення Material Flow — бути універсальною мовою обміну інформацією між Business Engines.

Матеріальні потоки використовуються незалежно від джерела їх виникнення.

---

## 3. Джерела

Material Flow може бути сформований внаслідок:

- розрахунку BOM;
- планування виробництва;
- фактичного виробництва;
- імпорту даних;
- ручного коригування;
- майбутніх бізнес-процесів.

---

## 4. Споживачі моделі

Material Flow використовується:

- Batch Allocation Engine;
- Planning Engine;
- Presentation Layer;
- Reports;
- Product Passport;
- Material Demand;
- Cost Calculation (майбутнє).

---

## 5. Доменна модель

```
MaterialFlow
    │
    ├── MaterialFlowEvent
    ├── MaterialFlowEvent
    ├── MaterialFlowEvent
    └── ...
```

Material Flow являє собою незмінну (immutable) колекцію MaterialFlowEvent.

---

## 6. MaterialFlowEvent

MaterialFlowEvent є атомарною подією використання матеріалу.

Кожний Event описує використання одного матеріалу.

Event ніколи не містить агрегованих даних.

---

## 7. Ідентичність

MaterialFlow не має власного ідентифікатора.

MaterialFlow визначається лише своєю колекцією подій.

MaterialFlowEvent не має глобального ID.

Його ідентичність визначається бізнес-контекстом.

---

## 8. Життєвий цикл

```
BOM

↓

Material Consumption Engine

↓

MaterialFlowEvent

↓

MaterialFlow

↓

Aggregation

↓

Presentation
```

---

## 9. Інваріанти

Material Flow завжди задовольняє такі правила.

### 9.1 Незмінність

Після створення MaterialFlow не модифікується.

Будь-яке перетворення створює новий MaterialFlow.

---

### 9.2 Додатна кількість

Кількість матеріалу повинна бути більшою за нуль.

```
Quantity > 0
```

---

### 9.3 Один матеріал

Один Event описує лише один Material.

---

### 9.4 Одна одиниця

Один Event використовує лише одну одиницю виміру.

---

### 9.5 Пояснюваність

Кожний Event повинен мати можливість бути поясненим через Origin.

---

## 10. Context

Material Flow існує у певному бізнес-контексті.

Наприклад:

- PLANNING
- PRODUCTION
- ESTIMATION
- SIMULATION

Context визначає бізнес-сценарій, але не змінює структуру моделі.

---

## 11. Origin

Кожний Event має походження.

Приклади:

- BOM
- IMPORT
- MANUAL
- CORRECTION

Origin дозволяє відтворити джерело розрахунку.

---

## 12. Агрегація

Material Flow сам по собі не містить агрегованих даних.

Агрегація виконується окремими компонентами.

Наприклад:

- By Material
- By Diameter
- By Steel Class
- By Category
- By Product
- By House
- By Project
- By Period

---

## 13. Зв’язок із BOM

Material Flow не є частиною BOM.

Material Flow створюється на основі BOM.

Після створення він не залежить від структури BOM.

---

## 14. Зв’язок із Product

Material Flow може бути побудований для:

- одного Product;
- множини Product;
- House;
- Project;
- будь-якої виробничої вибірки.

---

## 15. Зв’язок із MaterialBatch

Material Flow не містить інформації про партії.

Batch Allocation Engine використовує Material Flow для вибору партій.

---

## 16. Зв’язок із відображенням

Presentation Layer не змінює Material Flow.

Presentation лише відображає результат.

---

## 17. Доменні правила

Material Flow не:

- читає Repository;
- записує Repository;
- будує звіти;
- агрегує дані;
- виконує сортування;
- взаємодіє з Google Sheets.

---

## 18. Майбутні розширення

Без зміни моделі можуть бути додані:

- Waste Flow;
- Concrete Flow;
- Equipment Flow;
- Labor Flow;
- Energy Flow;
- Transport Flow.

Усі вони повинні наслідувати принципи DDS-001.

---

## 19. Приклади

Наведені числа в кг збережені як пояснювальна розрахункова ілюстрація джерела. Вони не встановлюють первинної одиниці Actual Allocation/Consumption довгомірних матеріалів і не визначають норматив втрат. Групування і подання залишаються зовнішніми щодо неагрегованих Event.

Плита П-2.11

↓

Material Flow

```
Ø12 А500С      33.70 кг

Ø10 А500С       9.46 кг

Ø8 А500С       30.28 кг

Ø12 А240С       3.36 кг

Ø4 Вр-1         0.44 кг
```

Після виготовлення 10 плит

```
Ø12 А500С     337.00 кг

Ø10 А500С      94.60 кг

Ø8 А500С      302.80 кг

...
```

Material Flow залишається неагрегованою моделлю.

Звіти виконують групування самостійно.

---

## 20. Принципи проєктування

1. Material Flow є внутрішньою доменною моделлю.

2. Material Flow не залежить від Persistence Layer.

3. Material Flow не залежить від Presentation Layer.

4. Material Flow є immutable.

5. Material Flow складається лише з MaterialFlowEvent.

6. Material Flow використовується як універсальна модель взаємодії між Business Engines.

7. Material Flow не містить бізнес-логіки.

8. MaterialFlow є канонічним внутрішнім представленням розрахованого використання матеріалів у межах відповідного розрахунку Business Layer. Single Source of Truth тут стосується результату цього розрахунку, а не історичної облікової істини MaterialConsumption.

## 21. Доменна класифікація

Material Flow є Domain Value Object.

Material Flow:

- не має власної ідентичності;
- визначається лише своїм вмістом;
- є immutable;
- створюється Business Engine;
- використовується як вхідна модель для інших Business Engines.

## Межі документа і пов’язані рішення

Цей DDS описує виключно MaterialFlow / MaterialFlowEvent. Наскрізний виробничий процес, облікове споживання та історія надходжень документуються окремо. Незмінність створеного Value Object / (Об’єкта-значення) не забороняє повторний розрахунок із побудовою нового MaterialFlow.

- [Material Requirement](<DDS — Material Requirement.md>).
- [Material Allocation](<DDS — Material Allocation.md>).
- [Material Consumption](<DDS — Material Consumption.md>).
- [Unresolved Material + Material Reconciliation](<DDS — Unresolved Material + Material Reconciliation.md>): повні US-01 і US-02 перенесені сюди з наданої розширеної редакції DDS-001.
- [ADR-042](<../adr/ADR-042 — Material Flow as Internal Domain Model.md>).
- [ADR / (Архітектурне рішення) 048](<../adr/ADR-048 — Material Accounting Period Closure and Unresolved Stock.md>): облікові періоди, окремі від незмінності Value Object.

## Deferred / Open Design Question / (Відкладені рішення / Відкриті питання проєктування)

Остаточні технічні TypeScript contracts / (контракти) не встановлюються цією редакційною консолідацією. Питання Allocation, Consumption і Unresolved наведені у власних DDS, а не розширюють модель MaterialFlow.
