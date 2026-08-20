# DDS-001 — Material Flow

**Document Type:** Domain Design Specification

**Status:** Accepted

**Version:** 1.0

**Last Updated:** 2026-08-19

---

# 1. Purpose

Material Flow є внутрішньою доменною моделлю ERP КУБ, що описує використання матеріалів у процесі виконання виробничих або розрахункових операцій.

Material Flow не є моделлю збереження даних.

Material Flow не є звітом.

Material Flow не є DTO.

Material Flow існує лише всередині бізнес-логіки ERP.

---

# 2. Goal

Основне призначення Material Flow — бути універсальною мовою обміну інформацією між Business Engines.

Матеріальні потоки використовуються незалежно від джерела їх виникнення.

---

# 3. Sources

Material Flow може бути сформований внаслідок:

- розрахунку BOM;
- планування виробництва;
- фактичного виробництва;
- імпорту даних;
- ручного коригування;
- майбутніх бізнес-процесів.

---

# 4. Consumers

Material Flow використовується:

- Batch Allocation Engine;
- Planning Engine;
- Presentation Layer;
- Reports;
- Product Passport;
- Material Demand;
- Cost Calculation (майбутнє).

---

# 5. Domain Model

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

# 6. MaterialFlowEvent

MaterialFlowEvent є атомарною подією використання матеріалу.

Кожний Event описує використання одного матеріалу.

Event ніколи не містить агрегованих даних.

---

# 7. Identity

MaterialFlow не має власного ідентифікатора.

MaterialFlow визначається лише своєю колекцією подій.

MaterialFlowEvent не має глобального ID.

Його ідентичність визначається бізнес-контекстом.

---

# 8. Lifecycle

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

# 9. Invariants

Material Flow завжди задовольняє такі правила.

## 9.1 Immutable

Після створення MaterialFlow не модифікується.

Будь-яке перетворення створює новий MaterialFlow.

---

## 9.2 Positive Quantity

Кількість матеріалу повинна бути більшою за нуль.

```
Quantity > 0
```

---

## 9.3 Single Material

Один Event описує лише один Material.

---

## 9.4 Single Unit

Один Event використовує лише одну одиницю виміру.

---

## 9.5 Explainable

Кожний Event повинен мати можливість бути поясненим через Origin.

---

# 10. Context

Material Flow існує у певному бізнес-контексті.

Наприклад:

- PLANNING
- PRODUCTION
- ESTIMATION
- SIMULATION

Context визначає бізнес-сценарій, але не змінює структуру моделі.

---

# 11. Origin

Кожний Event має походження.

Приклади:

- BOM
- IMPORT
- MANUAL
- CORRECTION

Origin дозволяє відтворити джерело розрахунку.

---

# 12. Aggregation

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

# 13. Relationship with BOM

Material Flow не є частиною BOM.

Material Flow створюється на основі BOM.

Після створення він не залежить від структури BOM.

---

# 14. Relationship with Product

Material Flow може бути побудований для:

- одного Product;
- множини Product;
- House;
- Project;
- будь-якої виробничої вибірки.

---

# 15. Relationship with Material Batch

Material Flow не містить інформації про партії.

Batch Allocation Engine використовує Material Flow для вибору партій.

---

# 16. Relationship with Presentation

Presentation Layer не змінює Material Flow.

Presentation лише відображає результат.

---

# 17. Business Rules

Material Flow не:

- читає Repository;
- записує Repository;
- будує звіти;
- агрегує дані;
- виконує сортування;
- взаємодіє з Google Sheets.

---

# 18. Future Extensions

Без зміни моделі можуть бути додані:

- Waste Flow;
- Concrete Flow;
- Equipment Flow;
- Labor Flow;
- Energy Flow;
- Transport Flow.

Усі вони повинні наслідувати принципи DDS-001.

---

# 19. Examples

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

# 20. Design Principles

1. Material Flow є внутрішньою доменною моделлю.

2. Material Flow не залежить від Persistence Layer.

3. Material Flow не залежить від Presentation Layer.

4. Material Flow є immutable.

5. Material Flow складається лише з MaterialFlowEvent.

6. Material Flow використовується як універсальна модель взаємодії між Business Engines.

7. Material Flow не містить бізнес-логіки.

8. Material Flow є Single Source of Truth для розрахованого використання матеріалів усередині Business Layer.

# 21. Domain Classification

Material Flow є Domain Value Object.

Material Flow:

- не має власної ідентичності;
- визначається лише своїм вмістом;
- є immutable;
- створюється Business Engine;
- використовується як вхідна модель для інших Business Engines.
