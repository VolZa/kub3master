//docs\adr\ADR-009 — 04_Catalog

Призначення 04_Catalog
04_Catalog є службовим довідником шаблонів типів елементів.

Він містить лише властивості, спільні для всіх елементів певного типу, і не містить властивостей конкретних екземплярів.
Відповідальність 04_Catalog
04_Catalog визначає:

• Type
• Category
• ProfileType
• ProductionType
• HasBOM
• SupportsLength

та інші характеристики, що описують клас елементів.
Чого не повинно бути в 04_Catalog
04_Catalog не повинен містити властивостей конкретних елементів, таких як:

• BaseUnit
• ParentMaterialID
• Density
• WeightPerMeter
• Diameter
• Length
• Width
• Height
• Thickness
• ProjectDocumentID

Ці властивості належать конкретному елементу або матеріалу і зберігаються відповідно у:

• 00_Elements
• 05_Materials
Правило створення елементів
Під час створення нового елемента ERP використовує 04_Catalog лише для визначення:

• типу елемента;
• категорії;
• технологічних властивостей.

Після створення всі подальші операції виконуються лише через 00_Elements.

Роль 04_Catalog

04_Catalog є довідником шаблонів (Template Catalog).

Під час створення будь-якого нового елемента ERP виконується класифікація
PrefixName за допомогою TypeCode.

Отриманий CatalogItem є шаблоном створення елемента і визначає:

• Type
• Category
• ProfileType
• HasBOM
• ProductionType
• SupportsLength

Поле Name використовується лише як людиночитний опис шаблону і не бере
участі у формуванні Name елемента в 00_Elements.
