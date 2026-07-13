docs\domain\00_Elements-v2.md

Див. документ на гугл диску: БС/Луцьк/KUB_Documents/ Модель 00_Elements v2

Призначення

Таблиця 00_Elements є єдиним довідником усіх конкретних елементів, що використовуються ERP КУБ.

Вона містить:

матеріали;
деталі;
складальні одиниці;
готові вироби.

Таблиця є частиною Project Domain і використовується як основа для побудови BOM.

04_Catalog визначає типи елементів, а 00_Elements містить конкретні екземпляри цих типів.

Структура
Поле Тип Обов'язкове Призначення
ID number ✔ Унікальний ідентифікатор елемента ERP
Code string ✔ Код елемента
Name string ✔ Найменування
Type ElementType ✔ material / part / assembly / product
CatalogID number ✔ Посилання на 04_Catalog
ProjectDocumentID number? тільки assembly, product Документ проекту
BaseUnit string ✔ Базова одиниця
ProfileType string? ні Тип профілю
ParentMaterialID number? ні Матеріал
Diameter number? ні Діаметр
Class string? ні Клас сталі
Width number? ні Ширина
Height number? ні Висота
Length number? ні Довжина
Thickness number? ні Товщина
Weight number? ні Маса
Density number? ні Густина
IsActive boolean ✔ Ознака активності
Comment string ні Коментар
CreatedAt Date ✔ Дата створення
Правила
Material

Не залежить від проекту.

ProjectDocumentID = null

Приклади

R_12_A500C

Бетон B25

Полоса 40×4
Part

Не залежить від проекту.

ProjectDocumentID = null

Приклади

R_12_A500C_L2890

R_8_A240_L350
Assembly

Залежить від документа проекту.

ProjectDocumentID = required

Приклади

ВСП-П-1.1

МК-1

КП-3
Product

Залежить від документа проекту.

ProjectDocumentID = required

Приклади

П-1.1

П-2.6

К-4
Область унікальності Code
Material

Глобальна.

Part

Глобальна.

Assembly

Унікальний лише в межах одного документа проекту.

ProjectDocumentID + Code
Product

Унікальний лише в межах одного документа проекту.

ProjectDocumentID + Code
Зв'язки
04_Catalog
│
▼
00_Elements
│
▼
01_BOM

Для assembly та product:

Project
│
▼
ProjectDocument
│
▼
00_Elements
Використання в ERP

00_Elements використовується модулями:

BOM;
Placement;
Material Consumption;
Material Usage;
Warehouse;
Production Planning.
Архітектурні принципи
04_Catalog описує типи елементів.
00_Elements описує конкретні елементи.
Матеріали та деталі є глобальними.
Складальні одиниці та вироби належать конкретному документу проекту.
Проєкт визначається через ProjectDocument, а не безпосередньо через ProjectID.

таблицю допустимих комбінацій полів для кожного типу.

Наприклад:

Поле Material Part Assembly Product
ProjectDocumentID – – ✔ ✔
ParentMaterialID ✔ ✔ – –
Length ✔* ✔ – –
Diameter ✔* ✔ – –
BOM ✖ ✖ ✔ ✔

- — лише для матеріалів, для яких це має зміст (арматура, полоса, кутник тощо).
