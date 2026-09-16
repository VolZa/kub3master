MFG-RESET-001 — Повна реконструкція виробничого стану Placement
(див doc в google.docs)

1. Призначення

Повністю відновити актуальний виробничий стан 13*Placement та ManufacturingSyncState на основі поточного стану 01*Виготовлення.

Операція потрібна для усунення наслідків:

тестових записів;
видалених Manufacturing;
ручних змін;
неповної або невдалої попередньої синхронізації. 2. Джерело істини
01_Виготовлення
│
├──→ 13_Placement
│
└──→ ManufacturingSyncState

ManufacturingSyncState не використовується для визначення результату реконструкції.

3. Які Manufacturing враховуємо

Беремо всі записи 01_Виготовлення, але для визначення вироблених позицій враховуємо тільки:

Status = ACTIVE
PlacementId заданий

Наприклад:

Manufacturing Status Placement Враховується
М00000077 ACTIVE 1 ✅
М00000078 ACTIVE 4 ✅
М00000079 ACTIVE 51 ✅
М00000080 ACTIVE — ❌
М00000050 CANCELLED 20 ❌

Отримуємо множину:

ProducedPlacementIds = { 1, 4, 51 } 4. Реконструкція 13_Placement

Для кожної позиції 13_Placement визначаємо, чи є її ID серед актуальних PlacementId у Manufacturing.

Якщо є:
PlacementId ∈ ProducedPlacementIds
↓
PRODUCED
Якщо немає:

Тут важливо не затирати наступні виробничі стани.

Поки пропоную таке правило:

Поточний статус Немає ACTIVE Manufacturing Результат
NONE так NONE
SCHEDULED так NONE
PRODUCED так NONE
REJECTED так NONE
SHIPPED так SHIPPED
INSTALLED так INSTALLED

А якщо PlacementId є серед вироблених:

NONE → PRODUCED
SCHEDULED → PRODUCED
PRODUCED → PRODUCED
REJECTED → PRODUCED

А SHIPPED та INSTALLED не змінюємо, навіть якщо відповідний Manufacturing існує.

5. Реконструкція ManufacturingSyncState

Тут робимо саме повну перебудову.

Старий стан:

ManufacturingSyncState
↓
очистити
↓
сформувати заново

Для кожного актуального Manufacturing:

Є Placement
ACTIVE + PlacementId
↓
Status = SYNCED
Немає Placement
ACTIVE + no PlacementId
↓
Status = NO_PLACEMENT
CANCELLED
CANCELLED
↓
Status = CANCELLED

Таким чином, після Rebuild у ManufacturingSyncState не залишиться записів для фізично видалених Manufacturing.

6. dryRun

Перший режим нічого не записує.

Він повинен сформувати результат приблизно такого виду:

MFG-RESET-001

Manufacturing:
всього: 80
ACTIVE: 79
CANCELLED: 1
з Placement: 74
без Placement: 5

Placement:
всього: 100
буде PRODUCED: 72
буде повернуто NONE: 23
без змін: 5

SyncState:
буде створено: 80

Числа тут, звичайно, приклад.

7. execute

Після dryRun:

execute
↓
перебудувати 13_Placement
↓
перебудувати ManufacturingSyncState
↓
зберегти

Операція повинна бути ідемпотентною:

Rebuild()
Rebuild()
Rebuild()

повинно давати один і той самий стан, якщо 01_Виготовлення не змінився.

8. Важливе правило

MFG-RESET-001 не змінює сам 01_Виготовлення.

Тобто напрямок завжди:

01_Виготовлення
↓
RESET
↓
13_Placement +
ManufacturingSyncState

ніколи:

13*Placement
↓
RESET
↓
01*Виготовлення ❌

Для ACTIVE Manufacturing одна PlacementId повинна мати не більше одного актуального запису Manufacturing.

При цьому CANCELLED записи в дублікати не враховуємо — вони є історією і не повинні блокувати Rebuild.

==============================================================
Остаточна версія: (див. документ гугла)
==============================================================

# <!--

ERP КУБ
Document: MFG-RESET-001
Type: Algorithm
Path: docs/algorithms/MFG-RESET-001.md

# Повна реконструкція виробничого стану Placement

-->

# MFG-RESET-001 — Повна реконструкція виробничого стану Placement

## 1. Призначення

`MFG-RESET-001` — адміністративний алгоритм повної реконструкції виробничого стану `Placement`.

Алгоритм використовується для відновлення узгодженого стану після:

- тестування;
- імпорту даних;
- ручного редагування;
- масових змін;
- інших ситуацій, коли `01_Виготовлення`, `13_Placement`
  та `ManufacturingSyncState` могли втратити синхронність.

Основне джерело істини:

```text
01_Виготовлення
       │
       ├──────────────► 13_Placement
       │
       └──────────────► ManufacturingSyncState

ManufacturingSyncState не використовується як джерело для реконструкції.

2. Пов'язані документи
ADR-047 — Повна реконструкція виробничого стану Placement.
01_Виготовлення — джерело виробничих фактів.
13_Placement — джерело позицій та їх виробничого стану.
ManufacturingSyncState — технічний стан синхронізації.
3. Режими роботи

Алгоритм має два режими:

DRY_RUN
EXECUTE
3.1. DRY_RUN

DRY_RUN:

читає поточний стан;
визначає необхідні зміни;
формує результат аналізу;
не змінює жодну таблицю.

Призначення:

перевірка;
діагностика;
контроль перед виконанням.
3.2. EXECUTE

EXECUTE виконує план реконструкції:

змінює необхідні Placement.Status;
зберігає 13_Placement;
повністю перебудовує ManufacturingSyncState;
зберігає ManufacturingSyncState.

Таблиця 01_Виготовлення під час реконструкції не змінюється.

4. Вхідні дані

Алгоритм читає:

Manufacturing

З 01_Виготовлення:

ID;
Будинок;
Код виробу;
Кількість;
Позиція;
Статус;
Змінено.
Placement

З 13_Placement:

ID;
Статус;
інші атрибути позиції.
ManufacturingSyncState

Поточний стан ManufacturingSyncState для виконання реконструкції не потрібен.

Він повністю замінюється новим станом.

5. Побудова виробничого стану

Для визначення вироблених позицій враховуються тільки записи:

Manufacturing.Status = ACTIVE

та:

Manufacturing.PlacementId визначений

Для кожного такого запису:

Manufacturing.PlacementId
        ↓
виробнича позиція Placement
        ↓
Status = PRODUCED

Записи CANCELLED не вважаються виробленими.

6. Обробка Placement.Status

Для кожного Placement визначається, чи існує відповідний активний Manufacturing.

6.1. Є активний Manufacturing

Якщо:

ACTIVE Manufacturing
+
PlacementId = поточний Placement.ID

тоді:

Placement.Status → PRODUCED

Виняток:

SHIPPED
INSTALLED

Ці стани не змінюються.

Правило
Поточний статус	Новий статус
NONE	PRODUCED
SCHEDULED	PRODUCED
PRODUCED	PRODUCED
REJECTED	PRODUCED
SHIPPED	SHIPPED
INSTALLED	INSTALLED
6.2. Немає активного Manufacturing

Якщо для Placement немає активного Manufacturing, тоді:

Placement.Status → NONE

але тільки для станів:

NONE
SCHEDULED
PRODUCED
REJECTED

Стани:

SHIPPED
INSTALLED

не змінюються.

Правило
Поточний статус	Новий статус
NONE	NONE
SCHEDULED	NONE
PRODUCED	NONE
REJECTED	NONE
SHIPPED	SHIPPED
INSTALLED	INSTALLED
7. Обробка CANCELLED Manufacturing

Запис:

Manufacturing.Status = CANCELLED

не створює виробничого стану PRODUCED.

Наприклад:

Manufacturing
ID = М00000010
Status = CANCELLED
PlacementId = 25

не означає:

Placement 25 → PRODUCED

Якщо іншого активного Manufacturing для Placement 25 немає:

Placement 25 → NONE

за загальним правилом розділу 6.2.

8. Manufacturing без Placement

Якщо:

Manufacturing.PlacementId = undefined

виріб не пов'язується з конкретною проектною позицією.

Такий запис:

не змінює Placement;
отримує стан:
NO_PLACEMENT

у ManufacturingSyncState.

Це дозволяє використовувати Manufacturing для:

виробництва в запас;
виробництва поза проектом;
резерву;
інших виробничих операцій без конкретної Placement.
9. Побудова ManufacturingSyncState

ManufacturingSyncState перебудовується повністю.

Для кожного запису Manufacturing створюється один запис:

Manufacturing → ManufacturingSyncState
9.1. CANCELLED
Manufacturing.Status = CANCELLED

отримує:

SyncState.Status = CANCELLED
9.2. Без Placement
Manufacturing.PlacementId = undefined

отримує:

SyncState.Status = NO_PLACEMENT
9.3. З Placement

Для активного Manufacturing з визначеним Placement:

SyncState.Status = SYNCED
9.4. Поля SyncState

При реконструкції:

ManufacturingId  = Manufacturing.ID
PlacementId      = Manufacturing.PlacementId
Status           = визначений статус
SourceUpdatedAt  = Manufacturing.UpdatedAt
UpdatedAt        = час виконання реконструкції
10. Дублікати PlacementId

Для активних Manufacturing контролюється унікальність:

ACTIVE Manufacturing.PlacementId

Якщо декілька активних Manufacturing посилаються на один Placement:

PlacementId = 25

М00000010
М00000015
М00000021

це вважається дублюванням.

Алгоритм:

виявляє дублікати;
додає їх до результату аналізу;
повідомляє PlacementId;
повідомляє список відповідних ManufacturingId.
Важливо

Дублікати не змінюють логіку визначення виробленого стану:

є хоча б один ACTIVE Manufacturing
        ↓
Placement = PRODUCED

Але дублікати повинні бути явно показані адміністратору.

CANCELLED записи при визначенні дублікатів не враховуються.

11. Результат analyze()

analyze() повертає план реконструкції.

Результат містить:

Manufacturing summary
totalManufacturing
activeManufacturing
cancelledManufacturing
withPlacement
withoutPlacement
rebuiltRecords
Placement summary
totalPlacements
markProduced
resetToNone
unchanged
Changes

Для кожної зміни:

placementId
currentStatus
newStatus
action

Доступні дії:

NONE
MARK_PRODUCED
RESET_TO_NONE
Duplicates

Список дублювань PlacementId.

SyncState

Повний набір майбутніх записів ManufacturingSyncState.

12. Виконання execute()

execute() приймає результат:

analyze('EXECUTE')

і виконує його.

Послідовність:

analyze('EXECUTE')
        │
        ▼
перевірка плану
        │
        ▼
оновлення Placement
        │
        ▼
save Placement
        │
        ▼
побудова нового ManufacturingSyncState
        │
        ▼
replaceAll()
        │
        ▼
save ManufacturingSyncState

01_Виготовлення не змінюється.

13. Ідемпотентність

Алгоритм повинен бути ідемпотентним.

Тобто:

EXECUTE
   ↓
стан реконструйований
   ↓
повторний DRY_RUN
   ↓
немає змін

Очікуваний результат:

MARK_PRODUCED = 0
RESET_TO_NONE = 0
unchanged = кількість усіх Placement

Повторний запуск EXECUTE також не повинен створювати нових змін.

14. Контрольний тест

Для перевірки алгоритму використовується:

testManufacturingPlacementRebuildExecute()

Тест виконує:

1. analyze('EXECUTE')
2. execute()
3. analyze('DRY_RUN')
4. перевірка результату
15. Результат контрольного запуску

Контрольний запуск на поточних даних:

Manufacturing: 80
  ACTIVE: 78
  CANCELLED: 2

ACTIVE з Placement: 18
без Placement: 60

Placement: 793

MARK_PRODUCED: 4
RESET_TO_NONE: 86
unchanged: 703

Duplicates: 0

Після виконання:

MARK_PRODUCED: 0
RESET_TO_NONE: 0
unchanged: 793
Duplicates: 0

ManufacturingSyncState:

SYNCED:       18
NO_PLACEMENT: 60
CANCELLED:     2
Разом:        80

Результат:

MFG-RESET-001 EXECUTE + IDEMPOTENCY: OK
16. Інваріанти

Після успішного виконання повинні виконуватися такі правила:

Manufacturing
01_Виготовлення не змінюється
Placement
ACTIVE Manufacturing з Placement
        ⇒
Placement.Status = PRODUCED

крім:

SHIPPED
INSTALLED
Manufacturing без Placement
PlacementId = undefined
        ⇒
SyncState.Status = NO_PLACEMENT
CANCELLED
Manufacturing.Status = CANCELLED
        ⇒
SyncState.Status = CANCELLED
SyncState
кількість SyncState записів
=
кількість Manufacturing записів
Ідемпотентність
повторний analyze()
        ⇒
відсутність нових змін
17. Обмеження

MFG-RESET-001 є адміністративним алгоритмом.

Його не слід використовувати як звичайний механізм щоденної синхронізації.

Для штатної роботи використовується інкрементальна синхронізація.

Повна реконструкція застосовується тоді, коли необхідно гарантовано відновити стан на основі поточного 01_Виготовлення.

18. Реалізація

Основний сервіс:

src/modules/manufacturing/synchronization/
└── manufacturing-placement-rebuilder.ts

Тест:

src/modules/manufacturing/tests/
└── manufacturing-placement-rebuild.test.ts

Пов'язані компоненти:

ManufacturingRepository
PlacementRepository
ManufacturingSyncStateRepository
19. Статус

MFG-RESET-001 — реалізовано та протестовано.

Перевірено:

DRY_RUN;
EXECUTE;
реконструкцію Placement;
повну реконструкцію ManufacturingSyncState;
обробку CANCELLED;
Manufacturing без Placement;
контроль дублікатів;
збереження SHIPPED / INSTALLED;
ідемпотентність.

Контрольний тест завершено:

✅ MFG-RESET-001 EXECUTE + IDEMPOTENCY: OK

### Один важливий нюанс

У розділі 13 я свідомо написав:

> `analyze()` повертає план реконструкції.

а не те, що `analyze('EXECUTE')` **щось виконує**. Це важливо зафіксувати документально: `EXECUTE` тут є **режимом побудови плану**, а фактична зміна стану відбувається тільки через `execute()`.

І ще: цей документ не дублює повністю ADR-047. Він описує **операційні правила алгоритму**, що якраз відповідає прийнятій у проєкті еволюції документації: `ADR → чому`, `Algorithms → який алгоритм`. :contentReference[oaicite:1]{index=1}

Я б **зараз просто зберіг цей текст як `docs/algorithms/MFG-RESET-001.md`**, а після цього перейшов до наступної задачі, не ускладнюючи MFG-RESET-001.
```
