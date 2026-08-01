Наступний практичний крок
— ProjectInMemoryRepository
' Етап 1 — ProjectInMemoryRepository
' еталон для всіх довідникових репозиторіїв ERP.

    📁 Структура
    src/domain/projects/

    project.model.ts                     ✅
    project.mapper.ts                    ✅
    project.repository.ts                ✅

, потім
project-inmemory.repository.ts ✅

project.factory.ts ←
Нагадаю його місце в архітектурі:

' SheetProvider
│
▼
' GoogleSheetsProjectDataSource
│
▼
' ProjectRow[]
│
▼
' ProjectInMemoryRepository
│
▼
' IProjectRepository
' Factory — єдине місце, яке знає, як побудувати репозиторій.

- ProjectDocumentInMemoryRepository, зараз
  ' domain/project-documents/
  ' ├── project-document.model.ts ✅ (якщо вже є)
  ' ├── project-document.mapper.ts ✅
  ' ├── project-document.repository.ts ✅
  ' ├── project-document-inmemory.repository.ts
  ' infrastructure/sheets/project-documents/
  ' └── GoogleSheetsProjectDocumentDataSource.ts
  ' app/factories/
  ' └── project-document.factory.ts

- HouseInMemoryRepository, потім
  і завершення
- ProjectContextService
