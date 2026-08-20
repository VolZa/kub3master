ADR-044 — Use Case as Orchestrator of Business Engines

Статус: Accepted

Дата: 2026-08-18

Контекст

ERP КУБ використовує багатошарову архітектуру.

На момент прийняття цього ADR вже визначено:

Repository Layer;
Domain Models;
Business Engines;
Internal Domain Models (Flow);
Presentation Layer.

Business Engines реалізують окремі алгоритми предметної області, але не повинні знати про спосіб збереження даних або взаємодію між іншими підсистемами.

Потрібен окремий компонент, який координує виконання бізнес-процесів.

Проблема

Реальний бізнес-процес майже завжди включає кілька незалежних компонентів.

Наприклад:

Закриття виробничої зміни

↓

прочитати ProductionLog

↓

прочитати BOM

↓

розрахувати Material Flow

↓

розподілити матеріали по партіях

↓

оновити залишки

↓

повернути результат користувачу

Якщо таку логіку розміщувати всередині Business Engine або Repository, виникає сильне зв'язування між компонентами.

Рішення

У системі вводиться окремий рівень

Use Cases

Use Case є координатором (Orchestrator) бізнес-процесу.

Він:

читає дані через Repository;
викликає один або декілька Business Engines;
передає результати між Engine;
записує результати через Repository;
формує результат для Presentation Layer.
Архітектура
Presentation Layer
│
▼
Use Case
│
┌──────┼───────────────┐
▼ ▼ ▼
Repository Business Engines
│ │
└──────────┬──────────┘
▼
Internal Domain Models
Відповідальність Use Case

Use Case може:

читати Repository;
викликати Engine;
викликати декілька Engine;
виконувати транзакційний сценарій;
записувати Repository;
повертати DTO або View Model.
Business Engine

Business Engine:

не читає Repository;
не записує Repository;
не взаємодіє з Google Sheets;
не будує Presentation;
не координує інші Engine.

Business Engine працює виключно з доменними моделями.

Repository

Repository:

не містить бізнес-логіки;
читає та записує дані;
не викликає Engine.
Presentation Layer

Presentation Layer:

не виконує бізнес-логіку;
не викликає Repository напряму;
взаємодіє лише з Use Case.
Приклад
Close Production Shift
Presentation

↓

CloseProductionShiftUseCase

↓

ProductionLogRepository

↓

BOMRepository

↓

MaterialConsumptionEngine

↓

Material Flow

↓

BatchAllocationEngine

↓

Batch Allocation

↓

MaterialBatchRepository

↓

Presentation
Product Material Report
Presentation

↓

BuildProductMaterialReportUseCase

↓

BOMRepository

↓

MaterialConsumptionEngine

↓

Material Flow

↓

MaterialAggregator

↓

Presentation
Production Planning
Presentation

↓

BuildShiftPlanUseCase

↓

PlanningEngine

↓

Shift Plan

↓

MaterialConsumptionEngine

↓

Material Flow

↓

Presentation
Dependency Rule

Залежності дозволені лише в одному напрямку:

Presentation

↓

Use Cases

↓

Business Engines

↓

Repositories

↓

Persistence Layer

Business Engines не можуть залежати від:

Repository;
Google Sheets;
SpreadsheetApp;
UI;
Presentation Layer.
Наслідки
Переваги
чіткий розподіл відповідальності;
незалежність Business Engines;
повторне використання Engine в різних сценаріях;
просте тестування Engine;
легке масштабування бізнес-процесів;
відсутність циклічних залежностей.
Недоліки
збільшується кількість класів;
прості сценарії потребують окремого Use Case.
Принципи
Use Case координує бізнес-процес.
Business Engine виконує лише бізнес-алгоритм.
Repository працює лише зі збереженням даних.
Presentation Layer взаємодіє лише з Use Case.
Internal Domain Models використовуються для передачі даних між Business Engines.
Business Engines можуть повторно використовуватися різними Use Case без модифікації.
Типові Use Cases ERP КУБ
BuildShiftPlanUseCase

ImportProjectDocumentUseCase

BuildMaterialDemandUseCase

CloseProductionShiftUseCase

SynchronizeOperationalBookUseCase

GenerateProductPassportUseCase

GenerateMaterialConsumptionReportUseCase

AllocateMaterialBatchesUseCase

RegisterProductionResultUseCase
Архітектурний принцип

Use Case є єдиним компонентом системи, який має право координувати взаємодію між Repository, Business Engines та Presentation Layer.

Коментар

На мою думку, після ADR-044 базова архітектура ERP КУБ стала цілісною. Якщо подивитися на прийняті рішення, вони утворюють послідовний ланцюг:

Persistence Layer
│
▼
Repositories
│
▼
Use Cases
│
▼
Business Engines
│
▼
Internal Domain Models (Flow)
│
▼
Presentation Layer

Саме цю схему я пропонував би вважати референсною архітектурою ERP КУБ. Надалі нові модулі (планування, облік оснастки, бетонний вузол, транспорт тощо) варто вписувати саме в цей каркас, а не проєктувати кожен окремо. Це забезпечить єдність архітектури та значно спростить розвиток системи в довгостроковій перспективі.
