Ядро інфраструктури ERP

Після аналізу всієї архітектури КУБ я пропоную таку остаточну схему.

<!--
                    Google Sheets
                          │
                          ▼
                  SheetProvider
                          │
                          ▼
                 SheetMatrixReader
                          │
                          ▼
                  RawSheetMatrix
                          │
                          ▼
            GenericSheetObjectMapper
                          │
                          ▼
                HouseRow / ProjectRow
               MaterialRow / CatalogRow
                          │
                          ▼
                  Domain Mapper
          (toHouse, toProject, ...)
                          │
                          ▼
                   Domain Model
                          │
                          ▼
                    Repository
                          │
                          ▼
                 Application Service -->

Відповідальність кожного шару

1. SheetProvider

Вже існує.

Його задача:

<!--
SheetKey
    ↓
Google Sheet  -->

2. SheetMatrixReader

Єдина задача:

<!--
Google Sheet
    ↓
RawSheetMatrix -->

Він:

- відкриває Sheet;
- читає getValues();
- більше нічого не робить.

Він не знає, що таке House чи Material.

3. RawSheetMatrix

Новий тип.

<!--
    export type RawSheetCell = unknown;

    export type RawSheetRow = readonly RawSheetCell[];

    export type RawSheetMatrix = readonly RawSheetRow[]; -->

Тепер у всій ERP більше не буде

unknown[][]

4. GenericSheetObjectMapper

Його задача:

<!--
RawSheetMatrix
    ↓
Row[] -->

Саме він:

- бере перший рядок;
- вважає його заголовком;
- створює об'єкти.

Наприклад

ID | Code | Name

↓

{
ID: "...",
Code: "...",
Name: "..."
}

5. GoogleSheetsDataSource

Ось тут буде найважливіша зміна.

Його задача стане лише:

<!--
 Reader
   ↓
 Mapper
   ↓
 Row[] -->

В ньому більше не буде:

- slice();
- headers;
- map();
- getValues().

Він лише координує.

6. Domain Mapper

Тут нічого не змінюється.

Наприклад

<!--
 HouseRow
   ↓
 House
 -->

Тут вже:

- Date;
- enum;
- валідація;
- інваріанти.
  Чому ця схема мені дуже подобається

Зверни увагу.

Якщо завтра ми захочемо читати не Google Sheets, а CSV:

<!--
   CSV
    ↓
CsvMatrixReader
    ↓
RawSheetMatrix
    ↓
GenericSheetObjectMapper -->

Весь інший код ERP не зміниться.

Те саме для:

Excel;
REST API;
SQLite;
PostgreSQL.
