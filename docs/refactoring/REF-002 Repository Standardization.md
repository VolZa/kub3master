docs\refactoring\REF-002 Repository Standardization.md

Зміст:

Нові модулі використовують:

- інтерфейс репозиторію;
- одну або кілька реалізацій;
- фабрику.

Існуючі модулі поступово переводяться на цей стандарт без зміни бізнес-логіки.

Repository = тільки In-Memory

Google Sheets
│
▼
GoogleSheetsDataSource
│
▼
ProjectRow[]
│
▼
Mapper
│
▼
GoogleSheetsProjectRepository
│
▼
Application Services

Тобто:

DataSource читає Google Sheets.
Mapper перетворює рядки.
Repository лише зберігає об'єкти в пам'яті та виконує пошук.
Service реалізує бізнес-логіку.

Repository ніколи не звертається до SpreadsheetApp.

остаточна схема

Google Sheets

↓

GoogleSheetsProjectDataSource

↓

ProjectRow[]

↓

ProjectInMemoryRepository

↓

ProjectContextService
