ADR-032 — Generic Sheet Object Mapper

Правила
GoogleSheetsDataSource працює лише з Google Sheets.
Він не знає про домени.
Заголовок першого рядка є схемою таблиці.
Кожний рядок автоматично перетворюється в Row-об'єкт.
Repository ніколи не працює з unknown[][].
Mapper (toHouse, toProject тощо) завжди отримує типізований Row.
Це, на мою думку, буде одним із найважливіших ADR у всій ERP, тому що він визначить єдиний механізм роботи для всіх таблиць Google Sheets.

Архітектура

<!--
Google Sheet
      │
      ▼
GoogleSheetsDataSource
      │
      ▼
GenericSheetObjectMapper
      │
      ▼
HouseRow / ProjectRow / MaterialRow / ...
      │
      ▼
Domain Mapper (toHouse, toProject, ...)
      │
      ▼
Domain Model -->

Розподіл відповідальності
Компонент Відповідальність
GoogleSheetsDataSource Читає та записує дані Google Sheets. Не знає про доменні моделі.
GenericSheetObjectMapper Перетворює unknown[][] у типізовані Row-об'єкти за заголовками таблиці.
Domain Mapper Перетворює Row у доменний об'єкт і виконує валідацію.
Repository Працює лише з доменними об'єктами.
Правила
GoogleSheetsDataSource ніколи не повертає unknown[][] назовні.

Перший рядок аркуша є схемою (headers).
Кожен наступний рядок автоматично перетворюється на Row-об'єкт.
toHouse(), toProject() тощо завжди отримують типізований HouseRow, ProjectRow і т.д.
Репозиторії не працюють із сирими масивами.

Будь-який DataSource в ERP повинен повертати тільки типізовані Row-об'єкти. Сирі результати getValues() не можуть залишати шар інфраструктури.

<!--
Google Sheets
      │
      ▼
┌────────────────────┐
│ Header (1 рядок)   │
├────────────────────┤
│ ID                 │
│ Code               │
│ Name               │
│ ProjectID          │
│ ...                │
└────────────────────┘

        │

        ▼

GenericSheetObjectMapper<T>

        │

        ▼

HouseRow
ProjectRow
CatalogRow
MaterialRow
ElementRow -->

                ЧИТАННЯ

<!--
Google Sheets
      │
      ▼
GoogleSheetsReader
      │
      ▼
unknown[][]
      │
      ▼
GenericSheetObjectMapper
      │
      ▼
Row[] -->

                 ЗАПИС

<!--
Row[]
      │
      ▼
GenericSheetObjectMapper
      │
      ▼
unknown[][]
      │
      ▼
GoogleSheetsWriter
      │
      ▼
Google Sheets -->

Кожна Row-модель має власний список заголовків (\*\_HEADERS).
Перед читанням або записом HeaderSchema перевіряє, що структура аркуша сумісна з цим списком.
