# DDS — Material Requirement / (Потреба в матеріалі)

**Тип:** Domain Design Specification / (Доменна специфікація).
**Статус:** Accepted / (Прийнято) — для перенесених правил і рішень власника.

**Другий редакційний прохід:** 2026-10-09.
**Номер:** не присвоєно; потребує окремого погодження.

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
- Product / (Виріб).
- Actual MaterialAllocation / (Фактичний розподіл матеріалу).
- Actual Allocation / (Фактичний розподіл матеріалу).
- Planning Allocation / (Плановий розподіл матеріалу).

- batch-specific weightPerMeter / (маса одного метра для конкретної партії).
- Deferred / (Відкладено).
- Open Design Question / (Відкрите питання проєктування).
- contract / (контракт).
- contracts / (контракти).
- quantity / (кількість).
- required quantity / (потрібна кількість).
- immutable / (незмінний).

- Material Flow / (Матеріальний потік) — джерельне написання MaterialFlow.
- Policy / (Політика технологічних втрат) — скорочення MaterialLossPolicy у цьому DDS.
- Allocation / (Розподіл матеріалу) — скорочення MaterialAllocation у цьому DDS.
- Consumption / (Споживання матеріалу) — скорочення MaterialConsumption у цьому DDS.
- Requirement / (Потреба в матеріалі) — скорочення MaterialRequirement у цьому DDS.
- Planning / (Планування).
- Actual / (Фактичний контекст).
- Write-off / (списання).

## 1. Призначення і межі

MaterialRequirement відповідає на питання: «Скільки матеріалу потрібно за поточного стану виробничих даних?». Це чиста потреба без технологічних втрат. Вона не є фактом споживання чи списання і не визначає конкретної партії.

Нормативна основа: ADR / (Архітектурне рішення) 048, рішення 1; Accepted-документ Material Allocation, розділи 17 і 23; MC-04/MC-05 та остаточне рішення власника H.7.

## 2. Джерела розрахунку

MaterialRequirement формується на основі розрахованої структури потреби в матеріалах, отриманої з BOM через відповідний Business Engine / (механізм бізнес-розрахунку) та представленої через MaterialFlow, з урахуванням виробничого контексту й кількості виробів. Геометрія деталей і нормативні характеристики матеріалу враховуються у відповідних розрахунках. Це опис походження даних, а не твердження, що MaterialRequirement сам читає BOM або MaterialFlow; новий технічний pipeline / (ланцюжок обробки) чи contract / (контракт) тут не встановлюється.

MaterialFlow залишається immutable: повторний розрахунок створює новий результат, не змінюючи вже створений об’єкт.

MaterialRequirement є поточним розрахунком, а не історичною обліковою операцією. Кожну попередню версію не потрібно зберігати як окрему облікову операцію. Зміна вхідних даних може спричинити повторне обчислення.

## 3. Матеріал, кількість і одиниця

Потреба визначає матеріал, чисту кількість та її одиницю. У концептуальних прикладах джерел це materialId, required quantity і unit; остаточний TypeScript контракт не встановлений.

Для довгомірних матеріалів первинна величина — довжина. Нормативна маса й характеристики довідника матеріалу не повинні підміняти чисту технологічну довжину масою, розрахованою через batch-specific weightPerMeter / (маса одного метра для конкретної партії).

Нормативний weightPerMeter довідника матеріалу та фактичний MaterialBatch.weightPerMeter — різні характеристики. Партійна характеристика використовується для відповідного перерахунку партійної маси; вибір партії не визначає геометричну потребу.

## 4. Межа MaterialLossPolicy

Для Actual-контуру чистий MaterialRequirement надходить до MaterialLossPolicy. Policy визначає нормативні втрати та кількість матеріалу, яку має забезпечити Actual Allocation і відобразити MaterialConsumption.

```text
Manufacturing → MaterialRequirement (чиста потреба)
              → MaterialLossPolicy
              → Actual MaterialAllocation
              → MaterialConsumption
              → Material Movement / Write-off
```

Правила Policy визначені MC-05 у Material Consumption DDS. Формула consumptionQuantity = netQuantity + lossQuantity встановлена MC-04. Це не додає втрати до самого MaterialRequirement і не встановлює остаточного контракту даних між Policy та Allocation.

## 5. Межа MaterialAllocation

Allocation розподіляє передану йому кількість між доступними джерелами та визначає Shortage. Він не дублює геометрію, визначення довжини, нормативної маси, BOM-розрахунок або Policy.

Один Manufacturing може забезпечуватися кількома MaterialBatch. Якщо матеріалу бракує, потреба не зникає і не підміняється нульовою масою чи віртуальним запасом.

## 6. Перерахунок та закрита історія

У відкритому періоді зміни підтвердженого Manufacturing можуть викликати перерахунок Requirement → Policy → Actual Allocation → Consumption згідно з MC-06.

Сам факт повторного обчислення поточного MaterialRequirement не дозволяє автоматично змінювати погоджений Consumption або матеріальні рухи закритого періоду. Межу MaterialAccountingClosedThrough, пізні документи та Adjustment / Correction визначає ADR-048.

## 7. Пояснення і приклади

### Чиста технологічна потреба

У ранньому DOCX-джерелі наведено Manufacturing М00000080 та матеріал `R_12_А500С` із потребою 107 м. Це приклад чистої довжини, а не Consumption або Write-off. У ранньому Markdown той самий приклад записаний як `R*12*А500С`; ці джерельні написання не встановлюють нового правила нормалізації MaterialID.

Історичний приклад незабезпеченості: за доступності лише 70 м із 107 м залишаються 37 м незабезпеченої кількості. Позначення RequiredLength = 37 м і BatchId = undefined є поясненням раннього документа, а не затвердженим persistence-контрактом v1 / (Першої версії).

При застосуванні втрат кількість на вході Actual Allocation визначає Policy. Наведений приклад сам по собі не встановлює нульового нормативу втрат.

### Історичні назви довідників

Ранні джерела називають довідник виду матеріалу 05_Materials, а партії — 06_MaterialBatches. Ці назви збережені як контекст існуючих таблиць Google Sheets, не як остаточний repository-контракт нової моделі.

## Deferred / Open Design Question / (Відкладені рішення / Відкриті питання проєктування)

- Остаточні contracts / (контракти) між Requirement, Policy та Allocation, DTO, repository і Google Sheets.
- Точна формула й округлення Policy та вибір нормативу під час повторного розрахунку — в Consumption DDS.
- Застосування Policy у Planning і порядок планових потреб з однаковою датою.
- Деталі persistence розрахунків і UI / (Інтерфейсу користувача).
- Перетворення unresolved-маси в довжину до встановлення batch-specific weightPerMeter — в Unresolved/Reconciliation DDS; це не привід змінювати чисту геометричну потребу.

## Пов’язані документи і джерела

- [DDS-001](<DDS-001 - Material Flow.md>).
- [Material Allocation](<DDS — Material Allocation.md>).
- [Material Consumption: MC-04, MC-05, MC-06](<DDS — Material Consumption.md>).
- [Unresolved Material + Material Reconciliation](<DDS — Unresolved Material + Material Reconciliation.md>).
- [ADR-048](<../adr/ADR-048 — Material Accounting Period Closure and Unresolved Stock.md>).
- Джерела: ADR-048, рішення 1; Allocation, розділи 17/23; MC-04–MC-06; ранні operational / (Операційні) редакції Material Flow, розділи 2–3 і 7; остаточні H.1–H.7.

