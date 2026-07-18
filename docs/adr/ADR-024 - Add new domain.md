docs\adr\ADR-024 - Add new domain.md

Новий домен повинен максимально використовувати вже існуючу інфраструктуру.

Тобто при додаванні нового домену (Projects, Houses, Warehouse, Production тощо) ми не створюємо нові механізми роботи з Google Sheets. Ми лише додаємо новий SheetKey, невеликий DataSource, доменні моделі та репозиторій. Це означає, що інфраструктурний шар ERP уже достатньо зрілий і тепер нові модулі будуть будуватися значно швидше та з меншою кількістю коду.

ЗМІНА в нашому плані

Раніше ми говорили:

Projects
↓

Repository
↓

Factory

Тепер я пропоную інший цикл.

Google Sheets
↓

SheetKey

↓

GoogleSheetsDataSource

↓

Mapper

↓

InMemoryRepository

↓

Factory

↓

Application Service

Саме цей цикл ми будемо повторювати для будь-якого нового домену.
