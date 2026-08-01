ADR-031
GoogleSheetsDataSource returns typed Row objects

де правило буде таким:

GoogleSheetsDataSource
ніколи не повертає unknown[][]

Він повертає тільки Row-об'єкти.

Тоді

GoogleSheetsHouseDataSource

буде автоматично отримувати

HouseRow[]

і HouseRepository більше ніколи не побачить масивів.
