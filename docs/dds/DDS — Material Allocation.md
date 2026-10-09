# DDS — Material Allocation / (Розподіл матеріалу)

**Тип:** Domain Design Specification / (Доменна специфікація).
**Статус:** Accepted / (Прийнято).

**Другий редакційний прохід:** 2026-10-09.
**Номер:** не присвоєно; потребує окремого погодження.

Консолідовано Accepted-джерело Material Allocation з остаточними рішеннями власника H.1–H.7. ADR / (Архітектурне рішення) 048 зберігає правила облікового періоду.

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
- MaterialAllocationEngine / (Механізм розподілу матеріалу).
- MaterialAllocationStrategy / (Стратегія розподілу матеріалу).
- MaterialAllocationResult / (Результат розподілу матеріалу).
- Actual MaterialAllocation / (Фактичний розподіл матеріалу).
- Actual Allocation / (Фактичний розподіл матеріалу).
- Planning Allocation / (Плановий розподіл матеріалу).
- Forecast Allocation / (Прогнозний розподіл матеріалу).
- LIFO / (Першою використовується остання доступна партія).
- FIFO / (Першою використовується найраніша доступна партія).
- MaterialReservation / (Резервування матеріалу).
- Virtual Planning Balance / (Віртуальний плановий баланс).
- PlannedMaterialReceipt / (Заплановане надходження матеріалу).
- manual override / (Ручне перевизначення).
- tie-breaker / (додатковий критерій упорядкування).
- concurrency / (Узгодженість одночасних операцій).
- idempotency / (Захист від повторного застосування операції).
- procurement / (Забезпечення закупівлями).
- UI / (Інтерфейс користувача).
- ACTUAL / (Фактичний контекст).
- PLANNING / (Плановий контекст).

Програмні ідентифікатори полів та фрагменти коду зберігають оригінальне написання.

- Application Service / (Прикладний сервіс).
- Value Object / (Об’єкт-значення).

- availability / (доступність).
- primary flow unit / (первинна одиниця матеріального потоку).
- batch-specific weightPerMeter / (маса одного метра для конкретної партії).
- Deferred / (Відкладено).
- Open Design Question / (Відкрите питання проєктування).
- contract / (контракт).
- contracts / (контракти).
- interface / (інтерфейс).
- source / (джерело).
- pure deterministic domain calculation / (чистий детермінований доменний розрахунок).
- quantity / (кількість).
- required quantity / (потрібна кількість).

- Material Flow / (Матеріальний потік) — джерельне написання MaterialFlow.
- Policy / (Політика технологічних втрат) — скорочення MaterialLossPolicy у цьому DDS.
- Allocation / (Розподіл матеріалу) — скорочення MaterialAllocation у цьому DDS.
- Consumption / (Споживання матеріалу) — скорочення MaterialConsumption у цьому DDS.
- Requirement / (Потреба в матеріалі) — скорочення MaterialRequirement у цьому DDS.
- Planning / (Планування).
- Actual / (Фактичний контекст).
- Write-off / (списання).
- deterministic accounting order / (детермінований обліковий порядок).
- technical tie-breakers / (технічні додаткові критерії впорядкування).

## Межа чистої потреби та фактичного забезпечення

MaterialRequirement залишається чистою потребою без технологічних втрат. Для фактичного контуру MaterialLossPolicy визначає нормативні втрати та кількість, яку має забезпечити Actual Allocation і відобразити MaterialConsumption. Allocation не обчислює втрати самостійно.

У подальших розділах quantity потреби на вході фактичного Allocation означає кількість після застосування Policy. Це не змінює визначення чистого MaterialRequirement. Формула requiredQty = allocatedQty + shortageQty застосовується до вхідної кількості Allocation. Остаточна назва та форма її технічного контракту відкладені.

Approved / (Затверджено) та ApprovedAt / (Момент затвердження) не входять до Allocation v1 / (Першої версії). Actual Allocation не зберігається як окремий постійний обліковий документ: його результат зберігається як provenance Consumption згідно з MC-07.

Застосування LossPolicy у Planning залишено відкритим питанням. Наведені нижче планові приклади не встановлюють нормативу втрат.

---

### Призначення

Цей документ визначає доменну модель і правила роботи
`MaterialAllocation` в ERP КУБ.
`MaterialAllocation` розташований між розрахунком потреби в матеріалі
(`MaterialRequirement`) та фактичним обліком використання матеріалу
(`MaterialConsumption`).
Основне питання, на яке відповідає `MaterialAllocation`:
> Якими доступними джерелами матеріалу ERP може забезпечити передану кількість
> на визначену дату? Для Actual це кількість після застосування MaterialLossPolicy.
`MaterialAllocation` не визначає саму потребу в матеріалі та сам по собі
не є фактом списання матеріалу зі складу.

---

### Контекст

ERP КУБ повинна автоматично визначати, з яких доступних джерел матеріалу
може бути забезпечена потреба виробництва.
У реальному виробництві працівник не завжди може або повинен визначати,
з якої конкретної документальної партії був фізично взятий матеріал.
Тому вибір партій для матеріального обліку повинен значною мірою
виконуватися ERP автоматично за визначеними правилами.
При цьому система повинна враховувати:

- фактичну дату надходження матеріальної партії;
- доступний залишок партії;
- порядок використання партій;
- матеріал із невстановленим документальним походженням;
- недостатність матеріалу;
- різницю між плановим і фактичним розрахунком;
- правила відкритого та закритого матеріального періоду.
MaterialAllocation повинен працювати як для поточного виробництва,
так і для прогнозування забезпеченості майбутнього виробничого плану.

---

### Місце в матеріальному процесі

Загальний матеріальний потік:

    BOM
      │
      ▼
    Material Flow
      │
      ▼
    MaterialRequirement (чиста потреба)
      │
      ▼
    MaterialLossPolicy (для Actual)
      │
      ▼
    MaterialAllocation
      │
      ▼
    MaterialConsumption
      │
      ▼
    Material Movement / Write-off

Відповідальність розділяється так:

    MaterialRequirement
    "Скільки матеріалу потрібно?"
              ↓
    MaterialAllocation
    "Звідки ця потреба може бути забезпечена?"
              ↓
    MaterialConsumption
    "Що визнано фактично використаним?"
              ↓
    Material Movement / Write-off
    "Як фактичне використання змінює матеріальний залишок?"

---

## 1. MaterialAllocation

### 1.1 Визначення

MaterialAllocation — результат розрахунку розподілу переданої кількості матеріалу між доступними джерелами. Для Actual Allocation ця кількість отримана після застосування MaterialLossPolicy до чистого MaterialRequirement; сам Allocation Policy не обчислює. Застосування Policy у Planning залишається Open Design Question / (Відкритим питанням проєктування).
Джерелами можуть бути:

- `MaterialBatch`;
- `Unresolved Material Stock`.
Якщо доступних джерел недостатньо, незабезпечена частина потреби
повертається як `Shortage`.
Концептуально:

    MaterialRequirement (чиста потреба)
            │
            ▼
    MaterialLossPolicy (для Actual)
            │
            ▼
    MaterialAllocation
            │
            ├── MaterialBatch
            ├── MaterialBatch
            ├── ...
            ├── Unresolved Material Stock
            │
            └── Shortage

---

## 2. Вхідні дані

Для виконання Allocation необхідні щонайменше:

- матеріал, одиниця та кількість до забезпечення: для Actual — після MaterialLossPolicy, а не безпосередньо чистий MaterialRequirement;
- дата, на яку матеріал повинен бути доступний;
- доступні `MaterialBatch`;
- `Unresolved Material Stock`;
- `MaterialAllocationStrategy`.
Концептуально:

    Вхідна кількість Allocation
    ├── materialId
    ├── requiredQty (для Actual — після MaterialLossPolicy)
    └── unit
    AllocationContext
    ├── allocationDate
    ├── mode
    └── strategy
    MaterialAvailability
    ├── MaterialBatch[]
    └── UnresolvedMaterialStock

---

## 3. Дата розподілу

### 3.1 Значення

`allocationDate` — дата, на яку матеріал повинен бути доступний
для забезпечення конкретної потреби.
У фактичному режимі це дата фактичного використання матеріалу
або відповідної виробничої операції.
У плановому режимі це запланована дата використання матеріалу.

---

### 3.2 Часове правило доступності

Матеріальна партія не може використовуватися для операції,
яка відбулася раніше, ніж ця партія була фактично отримана.
Обов'язковий інваріант:

    MaterialBatch.receivedAt <= allocationDate

Наприклад:

    Allocation date: 20.10.2026
    Batch A   received 01.09   eligible
    Batch B   received 15.10   eligible
    Batch C   received 25.10   NOT eligible

`Batch C` не може бути використана для Allocation на 20.10,
навіть якщо розрахунок ERP виконується після 25.10.

---

### 3.3 receivedAt і registeredAt — різні поняття

Необхідно розрізняти:
`receivedAt`
> дата фактичного надходження матеріалу;
та:
`registeredAt` / `createdAt`
> дата внесення інформації про партію в ERP.
Для визначення доступності партії використовується `receivedAt`.
Наприклад:

    receivedAt:    10.09
    registeredAt:  15.10
    allocationDate:20.09

Партія може бути кандидатом для Allocation 20.09,
оскільки фізично існувала на цю дату.

---

## 4. MaterialAllocationStrategy

Алгоритм вибору партій не повинен бути жорстко вбудований
у MaterialAllocation Engine.
Вводиться концепція:
`MaterialAllocationStrategy`
Концептуально:

    MaterialAllocationStrategy
              │
              ├── LIFO
              ├── FIFO
              └── other future strategies

Для ERP КУБ базовою стратегією є:
`LIFO`

---

## 5. Стратегія LIFO

### 5.1 Базове правило

ERP КУБ використовує LIFO як базове правило автоматичного
MaterialAllocation:
> Остання отримана з доступних на відповідну дату партія
> використовується першою.
Після фільтрації за датою:

    receivedAt <= allocationDate

партії сортуються:

    receivedAt DESC → BatchID DESC

---

### 5.2 Приклад

Доступні партії:

    Batch A   received 01.09   300 kg
    Batch B   received 15.09   500 kg
    Batch C   received 02.10   400 kg

Потреба:

    700 kg

Allocation:

    Batch C   400 kg
    Batch B   300 kg
             ------
    Total     700 kg

Batch A не використовується.

---

### 5.3 Облікова інтерпретація

LIFO є правилом облікової атрибуції матеріалу.
Воно не є твердженням, що ERP точно знає фізичне походження кожного
конкретного стержня, профілю або іншої одиниці матеріалу.
Водночас LIFO обрано тому, що воно може краще наближати облікову модель
до фактичної організації складу ERP КУБ, де нові партії можуть фізично
розміщуватися поверх попередніх та використовуватися раніше.
Це також дозволяє виявляти старі залишки, які тривалий час залишаються
на складі.

---

## 6. Unresolved Material Stock

Після використання всіх придатних ідентифікованих `MaterialBatch`
ERP може використовувати `Unresolved Material Stock`.
Порядок:

    eligible MaterialBatch
            │
            ▼
           LIFO
            │
            ▼
    Unresolved Material Stock
            │
            ▼
         Shortage
`Unresolved Material Stock` використовується лише для тієї частини
потреби, яку неможливо забезпечити ідентифікованими партіями.

---

### 6.1 Приклад

Потреба:

    Required = 1000 kg

Доступно:

    Batch C       400 kg
    Batch B       300 kg
    Unresolved    200 kg

Результат:

    Batch C       400 kg
    Batch B       300 kg
    Unresolved    200 kg
                 -------
    Allocated     900 kg
    Shortage      100 kg

ERP повинна зберігати інформацію про те, яка частина Allocation
походить з Unresolved Material Stock.

Unresolved Material Stock може використовуватися Allocation як агрегований стан availability / (доступності). Для Actual Allocation, результат якого стає provenance MaterialConsumption, конкретне історичне джерело повинно бути представлене UnresolvedReceipt відповідно до MC-07. Алгоритм вибору конкретного UnresolvedReceipt залишається Deferred / (Відкладеним); агрегований баланс не підміняє надходження в історичному provenance.

---

## 7. Shortage

### 7.1 Визначення

Shortage — незабезпечена частина переданої Allocation кількості. Для Actual вона визначається щодо кількості після застосування MaterialLossPolicy, не підміняючи чистий MaterialRequirement.
`Shortage` є результатом розрахунку, а не фізичним матеріальним
об'єктом або складською операцією.
Повинна виконуватися рівність:

    requiredQty = allocatedQty + shortageQty

де:

    shortageQty >= 0

---

### 7.2 Заборона віртуального матеріалу

ERP не повинна створювати віртуальний матеріал для автоматичного
закриття нестачі.
Якщо:

    Required       1000 kg
    Available       850 kg

результат:

    Allocated       850 kg
    Shortage        150 kg

а не:

    Allocated      1000 kg

---

## 8. Результат розподілу

Концептуальна форма результату:

    MaterialAllocation
    materialId
    requirementQty
    unit
    allocationDate
    mode
    strategy
    sources[]
        sourceType
        sourceId
        qty
    allocatedQty
    shortageQty

`sourceType` щонайменше може мати:

    MATERIAL_BATCH
    UNRESOLVED

Наприклад:

    MaterialAllocation
    materialId:       R_12_A500C
    requirementQty:   1000 kg
    allocationDate:   20.10.2026
    strategy:         LIFO
    sources:
      Batch B-103       500 kg
      Batch B-097       300 kg
      Unresolved        150 kg
    allocatedQty:       950 kg
    shortageQty:         50 kg

Це концептуальна модель.
Остаточні TypeScript interfaces / classes / Value Objects визначаються
на етапі реалізації.

---

## 9. Режими розподілу

MaterialAllocation використовується у двох різних контекстах:

    PLANNING

та:

    ACTUAL

Вони використовують спільні доменні правила доступності матеріалу,
але мають різні наслідки.

---

## 10. Planning Allocation

### 10.1 Призначення

Planning Allocation використовується для прогнозування матеріальної
забезпеченості виробничого плану.
Основне питання:
> Якщо виконувати поточний виробничий план у заданій послідовності,
> коли і яких матеріалів не вистачить?

---

### 10.2 Лише прогноз

Planning Allocation є лише прогнозом.
Він:

- не резервує матеріал;
- не змінює `MaterialBatch.remainingQty`;
- не змінює `Unresolved Material Stock`;
- не створює `MaterialConsumption`;
- не створює `Material Movement`;
- не виконує write-off.
Правило:

    Forecast != Reservation
    Forecast != Consumption
    Forecast != Write-off

---

## 11. Virtual Planning Balance

Хоча Planning Allocation не змінює реальний склад, у межах одного
прогнозного розрахунку ERP повинна вести віртуальний матеріальний баланс.
Інакше кожна наступна запланована виробнича операція бачила б один і той
самий початковий залишок.
Наприклад:

    Initial stock: 5000 kg
    05.11 need 1200 → virtual balance 3800
    12.11 need 1500 → virtual balance 2300
    18.11 need 1400 → virtual balance  900
    24.11 need 1100 → virtual balance -200

Отже:

    Shortage starts: 24.11
    Shortage:         200 kg

Реальний склад після завершення прогнозу залишається незмінним.

---

## 12. Планова нестача

Planning Allocation повинен дозволяти визначати не лише загальну
нестачу матеріалу, а й момент її виникнення.
Наприклад:

    Material: R_12_A500C
    Available for plan:          5000 kg
    Planned requirement:         6200 kg
    First shortage date:   24.11.2026
    Shortage on that date:       200 kg
    Total shortage:             1200 kg

Це дозволяє ERP заздалегідь показувати:

- який матеріал закінчиться;
- коли він закінчиться;
- скільки матеріалу не вистачить;
- яку кількість необхідно забезпечити для виконання плану.

---

## 13. Відсутність резервування матеріалу

У поточній моделі ERP КУБ не вводиться `MaterialReservation`.
Плановий розрахунок не закріплює конкретний матеріал за майбутнім виробом.
Причини:

- виробничий план може змінюватися;
- порядок виробництва може змінюватися;
- можуть надходити нові матеріали;
- можуть уточнюватися накладні;
- прогноз можна дешево перерахувати повторно.
Якщо в майбутньому виникне реальна бізнес-потреба у резервуванні,
`MaterialReservation` повинен бути спроєктований як окремий механізм,
а не прихована властивість Planning Allocation.

---

## 14. Actual Allocation

Actual Allocation використовується для фактичного виробничого контексту.
Загальна послідовність:

    Manufacturing
          │
          ▼
    MaterialRequirement (чиста потреба)
          │
          ▼
    MaterialLossPolicy
          │
          ▼
    Actual MaterialAllocation
          │
          ▼
    MaterialConsumption

Actual Allocation визначає, з яких доступних джерел ERP відносить
фактичне використання матеріалу.

---

## 15. Forecast Allocation не визначає Actual Allocation

Результат планового Allocation не є зобов'язанням використати
ті самі партії під час фактичного виробництва.
Наприклад, прогноз міг визначити:

    Product X
        ↓
    Batch B

Але до моменту фактичного виробництва могли:

- з'явитися нові партії;
- змінитися залишки;
- змінитися виробничий план;
- бути введені пропущені накладні;
- пройти reconciliation;
- змінитися доступний `Unresolved Material Stock`.
Тому Actual Allocation повинен виконуватися за актуальним станом
матеріалів на відповідну дату.

---

## 16. Плановий і фактичний розподіл

Концептуально:
                  MaterialRequirement
                         │
              ┌──────────┴──────────┐
              │                     │
              ▼                     ▼
          PLANNING                ACTUAL
              │                     │
              │              MaterialLossPolicy
              │                     │
              ▼                     ▼
        Forecast Allocation    Actual Allocation
              │                     │
              ▼                     ▼
       Shortage Forecast      MaterialConsumption
              │
              ▼
       no stock mutation
Обидва режими можуть використовувати один доменний механізм Allocation,
але різні контексти виконання та різні наслідки.

---

## 17. Зв’язок із MaterialRequirement та MaterialLossPolicy

MaterialAllocation не повинен самостійно визначати нормативну потребу, геометрію або технологічні втрати. MaterialRequirement визначає materialId, чисту required quantity та unit. Для Actual MaterialLossPolicy визначає нормативні втрати і кількість до забезпечення, яку передають Allocation.

MaterialAllocation відповідає за розподіл вхідної кількості між доступними джерелами та визначення Shortage. Цей розподіл запобігає дублюванню розрахунку потреби або Policy всередині Engine.

---

## 18. Зв’язок із MaterialConsumption

`MaterialAllocation` сам по собі не є фактом використання матеріалу.
Allocation відповідає:
> З яких джерел може або повинна бути віднесена потреба?
`MaterialConsumption` відповідає:
> Яке використання матеріалу ERP визнала фактичним?
Тому:

    Allocation != Consumption

Actual Allocation є основою для створення або уточнення
`MaterialConsumption`, але не замінює його.

---

## 19. Зв’язок зі списанням MaterialBatch

MaterialAllocation не повинен безпосередньо змінювати:

    MaterialBatch.remainingQty

Фактична зміна матеріального залишку належить наступному етапу:

    MaterialConsumption
            ↓
    Material Movement / Write-off
            ↓
    MaterialBatch balance

Це дозволяє відокремити:

- розрахунок;
- обліковий факт;
- зміну складського стану.

---

## 20. Зв’язок із ADR-048

MaterialAllocation повинен виконувати правила ADR-048
`Material Accounting Period Closure and Unresolved Material Stock`.
У відкритому періоді можуть уточнюватися:

- доступні MaterialBatch;
- Unresolved Material Stock;
- Allocation;
- зв'язок використаного матеріалу з конкретними партіями;
- залежний MaterialConsumption.
Наприклад:

    Before reconciliation:
    Consumption
        ↓
    Unresolved

Після введення пропущеної накладної:

    Reconciliation
        ↓
    MaterialBatch B-001

Allocation відкритого періоду може бути уточнений відповідно
до нової інформації.

---

## 21. Закритий період

Якщо:

    allocationDate <= MaterialAccountingClosedThrough

відповідна погоджена матеріальна історія не повинна автоматично
перераховуватися через новий запуск Allocation Engine.
Зокрема пізніше введена накладна не повинна автоматично перепризначати
закритий MaterialConsumption іншій партії.
Корекція закритого періоду виконується відповідно до ADR-048
через `Adjustment`.

---

## 22. Reconciliation

Reconciliation може змінювати ступінь документальної визначеності
Allocation у відкритому періоді.
Наприклад:

    Before:
    Requirement 500 kg
    Batch A       300 kg
    Unresolved    200 kg

Пізніше знайдено накладну, яка ідентифікує відповідний матеріал.
Після reconciliation:

    Batch A       300 kg
    Batch B       200 kg
    Unresolved      0 kg

Загальна кількість матеріалу не повинна змінитися лише через
встановлення його документального походження.

---

## 23. Allocation і довгомірні матеріали

Для довгомірних матеріалів Allocation працює в primary flow unit / (первинній одиниці матеріального потоку), визначеній доменною моделлю MaterialRequirement. MaterialAllocationEngine не повинен повторно визначати геометрію деталі, технологічну довжину потреби, нормативну масу, перетворення BOM у потребу або сам MaterialRequirement. Ці розрахунки виконуються до Allocation.

Batch-specific weightPerMeter / (маса одного метра для конкретної партії) може бути потрібний для приведення availability конкретного MaterialBatch із фізично прийнятої або облікової маси до primary flow unit Allocation. Це приведення одиниць доступного ресурсу, а не повторний розрахунок чистої потреби. Партійні характеристики можуть також використовуватися на подальших відповідних етапах матеріального обліку.

Перетворення unresolved kg → m до відомого batch-specific weightPerMeter залишається Deferred / Open Design Question / (Відкладеним рішенням / Відкритим питанням проєктування). Цей розділ не визначає такого алгоритму.

---

## 24. Алгоритм розподілу

Базовий алгоритм Actual Allocation:

    INPUT:
        materialId, unit та кількість після MaterialLossPolicy
        allocationDate
        MaterialBatch[]
        Unresolved Material Stock
        MaterialAllocationStrategy
    1. Select batches for required MaterialID.
    2. Exclude batches where:
           receivedAt > allocationDate
    3. Exclude batches with no available quantity.
    4. Apply MaterialAllocationStrategy.
       Default:
           LIFO
           receivedAt DESC → BatchID DESC
    5. Allocate from eligible MaterialBatch until:
           requirement is covered
       or:
           eligible batches are exhausted.
    6. If requirement remains:
           allocate from Unresolved Material Stock.
    7. If requirement still remains:
           create Shortage.
    8. Return MaterialAllocationResult.
    9. Do NOT mutate persistent stock.

---

## 25. Алгоритм прогнозування

Базовий алгоритм прогнозування:

    INPUT:
        Production Plan
        MaterialRequirement[]
        current material availability
    1. Create virtual material balance.
    2. Order planned requirements by planned usage date.
    3. For each requirement:
           run allocation against virtual balance.
    4. Reduce only virtual balance.
    5. Record shortages.
    6. Record first shortage date.
    7. Continue calculation through requested planning horizon.
    8. Return forecast result.
    9. Discard virtual balance.
    10. Do NOT mutate persistent stock.

---

## 26. Детермінований порядок виробничих потреб

Для послідовної обробки фактичного споживання використовується deterministic accounting order:

```text
Manufacturing.date ASC → Manufacturing.shift ASC → ManufacturingID ASC
```

ManufacturingID усередині однієї дати та зміни є технічним tie-breaker і не доводить точну фізичну послідовність споживання. Обліковий порядок застосовується, коли календарної дати недостатньо для однозначного порядку.

Порядок рядків Google Sheets не є доменним критерієм і не повинен впливати на Allocation. Порядок планових потреб з однаковою датою залишається Deferred / Open Design Question / (Відкладеним рішенням / Відкритим питанням проєктування).

---

## 27. Детермінований порядок партій

Після перевірки доступності на allocationDate базова LIFO використовує:

```text
receivedAt DESC → BatchID DESC
```

BatchID при однаковому receivedAt є технічним tie-breaker і не є доказом фізичної послідовності надходження. За однакових вхідних даних результат однаковий. Технічний алгоритм порівняння рядкових ID, наприклад B-9 / B-10, цим документом не визначається.

---

## 28. Захист від повторного застосування та детермінованість

Сам розрахунок MaterialAllocation повинен бути детермінованим.
За однакових:

- MaterialRequirement;
- allocationDate;
- MaterialBatch state;
- Unresolved state;
- AllocationStrategy;
результат повинен бути однаковим.
Повторний запуск розрахунку не повинен сам по собі змінювати
матеріальні залишки.
Це особливо важливо для:

- повторних запусків Google Apps Script;
- перерахунку плану;
- reconciliation;
- відновлення після помилок;
- тестування.

---

## 29. Shortage у плануванні

`Shortage` має особливе значення для виробничого планування.
ERP повинна мати можливість показати:

    Material
    Required through date
    Available
    Shortage
    First shortage date

Наприклад:

    Material:              R_12_A500C
    Planning horizon:      30.11.2026
    Required:              11500 kg
    Available:              9500 kg
    Shortage:               2000 kg
    First shortage date:   21.11.2026

Це дозволяє використовувати MaterialAllocation не лише для обліку,
а й для попередження майбутньої нестачі матеріалів.

---

## 30. Заплановані надходження

Поточна версія моделі не вимагає підтримки майбутніх запланованих
надходжень.
Базовий прогноз може відповідати на питання:
> На скільки вистачить фактично наявного матеріалу за поточного
> виробничого плану?
Майбутнє поняття:
`PlannedMaterialReceipt`
може бути додано окремо.
`PlannedMaterialReceipt` не повинен бути представлений як
`MaterialBatch`, доки матеріал фактично не отримано.
Додавання PlannedMaterialReceipt не повинно вимагати зміни базових
правил MaterialAllocation.

---

## 31. Ручне перевизначення

Базовий MaterialAllocation повинен виконуватися ERP автоматично.
Користувач не повинен бути зобов'язаний вручну вибирати партію
для кожного виробу.
Можливість ручного override може бути додана пізніше для виняткових
ситуацій.
Якщо manual override буде реалізований, він повинен:

- бути явним;
- мати причину;
- не порушувати temporal availability;
- не створювати матеріал, якого немає;
- бути доступним для аудиту.
Конкретна модель manual override цим DDS не визначається.

---

## 32. Некоректні вхідні дані

MaterialAllocation повинен виявляти некоректні вхідні дані.
Прикладами є:

- negative requiredQty;
- negative availableQty;
- incompatible units;
- відсутній MaterialID;
- некоректна дата надходження;
- спроба використати партію до `receivedAt`;
- дубльоване джерело Allocation;
- інші порушення доменних інваріантів.
Недостатність матеріалу сама по собі не є технічною помилкою.
Вона повинна повертатися як:
`Shortage`
а не як exception.

---

## 33. Інваріанти

1. `MaterialAllocation` не визначає `MaterialRequirement`.
2. `MaterialAllocation` не є `MaterialConsumption`.
3. `MaterialAllocation` сам по собі не виконує write-off.
4. MaterialBatch може бути використана лише якщо:
       receivedAt <= allocationDate
5. Дата реєстрації партії в ERP не замінює дату фактичного надходження.
6. Базовою стратегією ERP КУБ є LIFO.
7. LIFO застосовується тільки серед партій, доступних на дату Allocation.
8. LIFO є правилом облікової атрибуції та не гарантує ідентичності
   фактичному фізичному відбору матеріалу.

9. Після доступних MaterialBatch може використовуватися
   `Unresolved Material Stock`.

10. Використання `Unresolved Material Stock` повинно бути явно видимим

    у результаті Allocation.

11. Якщо матеріалу недостатньо, формується `Shortage`.
12. Недостатність матеріалу не повинна приховуватися створенням

    віртуального запасу.

13. Повинна виконуватися рівність:
        requiredQty = allocatedQty + shortageQty
14. Planning Allocation не змінює persistent material state.
15. Planning Allocation не створює MaterialReservation.
16. Planning Allocation не створює MaterialConsumption.
17. Planning Allocation використовує virtual material balance.
18. Actual Allocation виконується за актуальним станом матеріалу,

    а не за старим прогнозом.

19. Forecast Allocation не зобов'язує Actual Allocation використовувати

    ті самі MaterialBatch.

20. Повторний запуск Allocation за однакових вхідних даних повинен

    давати однаковий результат.

21. Allocation Engine не повинен залежати від випадкового порядку

    рядків Google Sheets.

22. Allocation не повинен дублювати розрахунок геометрії,

    MaterialRequirement або нормативної матеріальної потреби.

23. Reconciliation відкритого періоду може уточнювати Allocation.
24. Закритий матеріальний період не повинен автоматично

    переалоковуватися.

25. Корекції закритого періоду виконуються відповідно до ADR-048.
26. `PlannedMaterialReceipt` не є `MaterialBatch`.
27. Shortage є розрахунковим результатом, а не складським матеріалом.

---

## 34. Наслідки

### Позитивні

- Вибір матеріальних партій значною мірою автоматизується.
- Працівнику не потрібно вручну визначати партію для кожного виробу.
- LIFO може краще наближати обліковий рух до фактичної організації складу.
- Старі залишки стають видимими.
- Неможливо використати партію раніше її фактичного надходження.
- Неповні накладні не блокують Allocation.
- Unresolved Material Stock інтегрований у звичайний алгоритм.
- Нестача матеріалу стає явним результатом.
- Виробничий план можна перевіряти на матеріальну забезпеченість наперед.
- ERP може визначати дату майбутнього дефіциту.
- Планування не створює складних резервів.
- Повторний прогноз не потребує скасування попередніх резервувань.
- Allocation відокремлений від Consumption і write-off.
- Стратегія вибору партій може бути змінена без перепроєктування
  MaterialAllocation Engine.

### Негативні

- Для коректного Allocation потрібна надійна дата `receivedAt`.
- Потрібен контроль залишків MaterialBatch.
- Потрібна підтримка Unresolved Material Stock.
- Для прогнозу необхідний virtual balance.
- Потрібно дотримуватися прийнятого порядку фактичного споживання; порядок планових потреб на одну дату ще відкритий.
- Потрібно реалізувати прийнятий BatchID tie-breaker; технічне порівняння ID ще не визначене.
- LIFO є моделлю облікового руху, а не доказом фактичного фізичного
  використання конкретної партії.

- Для повного прогнозування майбутніх закупівель згодом може знадобитися
  PlannedMaterialReceipt.

---

## 35. Відкладені рішення та відкриті питання проєктування

**Статус цього розділу:** Deferred / Open Design Question / (Відкладені рішення / Відкриті питання проєктування).

- Остаточні contracts / (контракти), TypeScript interfaces / (Інтерфейси типів), DTO, repository та Google Sheets структура.
- Вибір конкретного UnresolvedReceipt для provenance; перетворення його фізично прийнятої маси в довжину до визначення batch-specific weightPerMeter.
- Алгоритм reconciliation між UnresolvedReceipt і MaterialBatch.
- Застосування LossPolicy у Planning та порядок планових потреб з однаковою датою.
- Технічне порівняння рядкових ID. Самі правила сортування Batch і Manufacturing уже прийняті.
- Збереження технічних даних розрахунку, якщо знадобиться для діагностики; це не змінює MC-07 про відсутність окремого постійного облікового документа Actual Allocation v1.
- Material Movement / Write-off journal / (Журнал рухів і списання), transaction model / (Транзакційна модель), concurrency та конкретна idempotency проведення.
- Конкретний механізм Adjustment / Correction.
- manual override, PlannedMaterialReceipt, procurement, UI прогнозу, reconciliation та деталі звітів.

Ці питання не змінюють Accepted-статус решти правил. Резервування у v1 не вводиться; можливе майбутнє резервування — окремий механізм. Майбутній ручний approval / (Процес затвердження) також є окремим workflow / (Робочим процесом), а не станом Allocation.

---

## 36. Пов’язані рішення

- ADR-041
- ADR-042 — Material Flow as Internal Domain Model
- ADR-043
- ADR-044 — Use Case as Orchestrator of Business Engines
- ADR-048 — Material Accounting Period Closure and Unresolved Material Stock
- DDS-001 — Material Flow

---

## 37. Рекомендації реалізації

MaterialAllocationEngine є pure deterministic domain calculation / (чистим детермінованим доменним розрахунком) без прямої залежності від Google Sheets.
Концептуально:

    Google Sheets / Repositories
              │
              ▼
        Application Service
              │
              ▼
    MaterialAllocationEngine
              │
              ├── MaterialAllocationStrategy
              │         └── LIFO
              │
              ▼
    MaterialAllocationResult
              │
              ▼
        Application Service
              │
              ├── Planning Report
              │
              └── MaterialConsumption

MaterialAllocationEngine не повинен:

- читати Google Sheets;
- записувати Google Sheets;
- змінювати MaterialBatch;
- створювати MaterialConsumption;
- виконувати write-off.
Його задача:
> Отримати стан потреби та доступності матеріалу і повернути
> детермінований результат Allocation.

---

## 38. Рекомендації міграції

Існуючу матеріальну логіку ERP КУБ не потрібно одномоментно
переписувати під цей DDS.
Рекомендований порядок:

    1. Зафіксувати доменні contracts.
    2. Реалізувати MaterialAllocationEngine як чистий розрахунок.
    3. Реалізувати LIFO strategy.
    4. Додати temporal availability rule.
    5. Додати Unresolved Material Stock як allocation source.
    6. Додати Shortage.
    7. Перевірити engine на тестових сценаріях.
    8. Підключити Planning mode без запису в production data.
    9. Порівняти прогноз з існуючими матеріальними звітами.
    10. Лише після перевірки підключати Actual Allocation
        до MaterialConsumption.
    11. Write-off реалізовувати окремим наступним етапом.

На першому етапі новий MaterialAllocation повинен мати можливість
працювати паралельно з існуючими матеріальними розрахунками,
не змінюючи робочі production data.

---

### Підсумок

MaterialAllocation в ERP КУБ є доменним механізмом автоматичного розподілу переданої йому кількості матеріалу між доступними джерелами. Для Actual Allocation ця кількість формується після застосування MaterialLossPolicy до чистого MaterialRequirement.
Базове правило:

    requirement
        ↓
    batches available on allocationDate
        ↓
    LIFO
        ↓
    Unresolved Material Stock
        ↓
    Shortage

Для планування:

    Production Plan
        ↓
    MaterialRequirement[]
        ↓
    Virtual Material Balance
        ↓
    Forecast Allocation
        ↓
    Shortage + First Shortage Date

без:

    reservation
    consumption
    write-off

Для фактичного виробництва:

    Manufacturing
        ↓
    MaterialRequirement
        ↓
    MaterialLossPolicy
        ↓
    Actual Allocation
        ↓
    MaterialConsumption

MaterialAllocation таким чином забезпечує спільний доменний механізм
для двох задач ERP КУБ:

1. автоматичного облікового визначення джерел фактично використаного
   матеріалу;

2. прогнозування майбутньої матеріальної забезпеченості виробничого плану.

## Канонічні посилання та походження

- [Material Requirement](<DDS — Material Requirement.md>).
- [Material Consumption: MC-05 і MC-07](<DDS — Material Consumption.md>).
- [Unresolved Material + Material Reconciliation](<DDS — Unresolved Material + Material Reconciliation.md>).
- [ADR-048](<../adr/ADR-048 — Material Accounting Period Closure and Unresolved Stock.md>).
- [DDS-001](<DDS-001 - Material Flow.md>).
- Джерело: C:/www/26/10/dds/# DDS — Material Allocation.docx, усі розділи 1–38, обґрунтування, приклади та інваріанти; зміни тільки за погодженими H.1–H.7 і поправкою до першої хвилі.

