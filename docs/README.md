# ERP КУБ

Документація ERP-системи для технолога виробництва залізобетонних виробів.

## Структура документації

- roadmap.md — етапи розвитку ERP.
- glossary.md — словник термінів.

docs/
│
├── README.md
│
├── adr/ ← журнал архітектурних рішень (Architecture Decision Records).
│ ├── ADR-000 ...
│ ├── ADR-001 ...
│ ├── ...
│ ├── ADR-018 UI Pattern.md
│ └── ADR-019 Google Sheets as Administration Interface.md
│
├── architecture/ ← загальна архітектура ERP
│
├── domain/ ← предметна модель
│
├── ui/ ← інтерфейс користувача
│ ├── UI-001 Import Project Document.md
│ └── ...
│
└── refactoring/

## Основні принципи

- ERP повторює структуру проектної документації.
- MASTER є єдиним джерелом істини.
- Бізнес-логіка реалізується у Service.
- Repository відповідають лише за доступ до даних.
