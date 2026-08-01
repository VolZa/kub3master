1. Реалізувати GenericSheetObjectMapper. ✅
структура
<!--
src/
└── infrastructure/
    └── sheets/
        ├── GoogleSheetsDataSource.ts
        ├── SheetProvider.ts
        ├── SheetKey.ts
        ├── mapping/
        │   ├── GenericSheetObjectMapper.ts
        │   ├── SheetObjectMapper.ts
        │   └── RawSheetRow.ts
        └── ... --> ✅

2.Модернізувати GoogleSheetsDataSource.
структура

<!-- src/
└── infrastructure/
    └── sheets/
        ├── GoogleSheetsReader.ts
        ├── GoogleSheetsWriter.ts
        ├── GoogleSheetsDataSource.ts
        ├── SheetProvider.ts
        ├── mapping/
        │   ├── RawSheetMatrix.ts
        │   ├── RawSheetRow.ts
        │   ├── SheetObjectMapper.ts
        │   └── GenericSheetObjectMapper.ts -->

3.Перевести на новий механізм лише HouseDataSource і переконатися, що ProjectContextService проходить тест.
4.Після успішного тесту перевести Projects, ProjectDocuments, Catalog, Materials та інші модулі.

Оновлений роадмап зі змінами в архітектурі:
Інфраструктура
──────────────

✔ SheetProvider

✔ GoogleSheetsReader

✔ GoogleSheetsWriter

⬜ GenericSheetObjectMapper

⬜ GoogleSheetsDataSource v2

Домен
─────

✔ Projects

✔ ProjectDocuments

✔ Houses

Контекст
────────

⬜ ProjectContextService

⬜ ImportContextService

Import
──────

⬜ ElementFactory(ProjectDocumentID)

⬜ resolveElement()

⬜ BOM import

2. Завершити GenericSheetObjectMapper.

3. Завершити GoogleSheetsDataSource<T>.

4. Перевести HouseDataSource.

5. Створити HouseFactory.

6. Перевірити HouseRepository.

7. Реалізувати ProjectContextService.

8. Перевести ProjectDataSource.

9. Перевести ProjectDocumentDataSource.

10. Далі Catalog, Materials, ...

Тому я пропоную невелике коригування roadmap
GoogleSheetsReader
✔

GenericSheetObjectMapper
✔ (майже)

⬜ HeaderSchema ← я б зробив зараз

⬜ GoogleSheetsWriter

⬜ GoogleSheetsDataSource v2
