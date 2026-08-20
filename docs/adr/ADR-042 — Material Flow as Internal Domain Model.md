ADR-042 — Material Flow as Internal Domain Model

Статус: Accepted

Дата: 2026-08-18

Контекст

ERP КУБ містить модулі:

Elements
BOM
Production Planning
Production Log
Material Batches
Reports

Після прийняття ADR-041 встановлено, що всі виробничі та складські розрахунки виконуються через Material Consumption Engine.

Для забезпечення незалежності між розрахунковою логікою та представленням результатів необхідно визначити єдину внутрішню модель, яка буде використовуватися між доменними сервісами.

Проблема

Різні модулі системи потребують однакових даних про використання матеріалів:

виробничі звіти;
списання партій;
планування потреби;
картка виробу;
економічний аналіз;
статистика.

Створення окремої моделі для кожного модуля призводить до дублювання логіки.

Рішення

В ERP вводиться внутрішня доменна модель

Material Flow

Material Flow є єдиною внутрішньою моделлю, яка описує використання одного матеріалу внаслідок розрахунку BOM.

Material Flow не є звітом.

Material Flow не є записом Google Sheets.

Material Flow не зберігається в базі даних.

Він існує лише під час виконання розрахунків.

Архітектура
Product
│
▼
BOM
│
▼
Material Consumption Engine
│
▼
Material Flow
│
┌─────────────┼──────────────┐
▼ ▼ ▼
Presentation MaterialBatch Planning
Layer Service Service
Відповідальність

Material Flow описує одну подію використання матеріалу.

Наприклад

Плита П-2.11

↓

Стержень Ø12 А500С

↓

+33.70 кг

або

Каркас КР-5

↓

Кутник 50×50

↓

+12.40 кг
Структура Material Flow

Базова модель

interface MaterialFlowItem {

    materialId: string;

    quantity: number;

    unit: BaseUnit;

}

Рекомендована модель

interface MaterialFlowItem {

    materialId: string;

    materialCode: string;

    materialName: string;

    materialCategory: MaterialCategory;

    profileType?: ProfileType;

    diameter?: number;

    steelClass?: string;

    quantity: number;

    unit: BaseUnit;

}

Material Flow може містити додаткові службові поля, якщо вони не впливають на бізнес-логіку.

Джерело даних

Material Flow формується виключно шляхом обходу BOM.

Єдиним компонентом, який має право створювати Material Flow, є

Material Consumption Engine

Інші модулі лише використовують вже сформований потік.

Aggregation

Material Flow може агрегуватися за будь-якою ознакою.

Наприклад

MaterialID
MaterialCategory
ProfileType
SteelClass
Diameter
Product
House
Project
Floor
Production Shift
Calendar Period

Сам Material Flow агрегованих значень не містить.

Presentation Layer

Presentation Layer не виконує розрахунків.

Його задача:

групування;
сортування;
форматування;
побудова таблиць;
побудова друкованих форм;
експорт.
Material Batches

Material Batch Allocation використовує Material Flow як вхідні дані.

На основі Material Flow виконується:

вибір партій;
списання матеріалів;
формування залишків.
Production Planning

Планування виробництва використовує Material Flow для визначення потреби в матеріалах.

Наприклад

Позмінне завдання

↓

Material Flow

↓

Потреба складу
Product Card

Картка виробу використовує Material Flow для формування:

витрати матеріалів;
довідкової маси;
технологічної інформації.

Маса виробу не зберігається окремо.

Single Responsibility

Material Flow не виконує:

розрахунок BOM;
списання партій;
побудову звітів;
планування.

Він лише переносить результат роботи Material Consumption Engine між доменними сервісами.

Наслідки
Переваги
єдина внутрішня модель для всіх сервісів;
відсутність дублювання DTO;
незалежність бізнес-логіки від Presentation Layer;
спрощення тестування;
підтримка нових типів звітів без зміни розрахунків;
легке масштабування системи.
Недоліки
збільшується кількість внутрішніх доменних моделей;
для великих обсягів даних можуть знадобитися механізми кешування.
Принципи
Material Flow є внутрішньою доменною моделлю ERP.
Material Flow не є таблицею Google Sheets.
Material Flow не є DTO для Presentation Layer.
Material Flow не зберігається у сховищі даних.
Material Flow створюється лише Material Consumption Engine.
Усі виробничі сервіси працюють із Material Flow як із єдиним внутрішнім представленням використання матеріалів.
Коментар

Я б запропонував ще одну невелику, але важливу ідею для майбутнього розвитку. Зараз ми говоримо про Material Flow, але ця концепція може стати частиною більш загального підходу. У майбутньому можуть з'явитися аналогічні внутрішні моделі:

Material Flow — потік матеріалів;
Labor Flow — трудові витрати;
Equipment Flow — використання оснастки;
Concrete Flow — використання бетонних сумішей.

Тоді Material Flow стане першим представником сімейства внутрішніх доменних моделей типу Flow, що зробить архітектуру ERP КУБ ще більш послідовною та розширюваною без зміни вже прийнятих принципів.

Material Flow є незмінною (immutable) внутрішньою моделлю. Після створення елементи Material Flow не модифікуються. Усі операції групування, фільтрації та агрегації створюють нові колекції без зміни вихідних даних.

Це не просто "модно". Це практично.

Наприклад:

MaterialConsumptionEngine створив 15 000 записів Material Flow.
Planning Engine згрупував їх за матеріалами.
Presentation Layer згрупував їх за діаметрами.
Batch Allocation Engine розподілив їх по партіях.

Усі працюють із тим самим вихідним потоком, не впливаючи один на одного.
