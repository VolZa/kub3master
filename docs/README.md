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

ERP KUB Roadmap
Phase 0 Legacy VBA/Excel ✅
Phase 1 Google Sheets + GAS ✅
Phase 2 TypeScript Refactoring ✅
Phase 3 Domain Architecture ✅

---

## Phase 4 Business Engines 🔄

Phase 5 Production ERP
Phase 6 Optimization

Ми щойно завершили Phase 3.

Що буде входити у Phase 4

Я б зробив її максимально послідовною.

Sprint 1 — Material Consumption Engine

1. Domain Specification
2. MaterialFlowEvent
3. Traverser
4. Flow Builder
5. Aggregator
6. Facade
7. Unit Tests

Sprint 2 — Batch Allocation Engine
MaterialFlow
│
▼
Batch Allocation
│
▼
MaterialBatchRepository

Sprint 3 — Planning Engine
House
│
▼
Product Demand
│
▼
Material Consumption

Sprint 4 — Synchronization Engine

MASTER

↓

OPERATIONAL
