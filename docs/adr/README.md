docs\adr\README.md

docs/
└── adr/
├── README.md ← журнал ADR
├── ADR-000-Філософія.md
├── ADR-001-master.md
├── ADR-002-project-structure.md
├── ADR-003-code-scope.md
├── ADR-004-domains.md
├── ADR-005-bom.md
├── ADR-006-material-events.md
├── ADR-007-repositories.md
├── ADR-008-backward-compatibility.md
├── ADR-009-global-catalog.md
├── ADR-010-multi-project.md
├── ADR-011-placement.md
└── ADR-012-automation-boundary.md

В розвиток...
docs/
│
├── README.md
│
├── adr/
│ ├── ADR-001 ...
│ ├── ADR-002 ...
│ ├── ...
│ └── ADR-027 ...
│
├── architecture/
│ ├── ArchitectureOverview.md
│ ├── NamingStandards.md
│ ├── Layers.md
│ ├── DataModel.md
│ ├── GoogleSheets.md
│ ├── RepositoryPattern.md
│ └── ImportPipeline.md
│
└── diagrams/
├── DomainModel.drawio
├── ImportFlow.drawio
└── ProductionFlow.drawio

різниця між ADR і стандартами (Architecture)

ADR відповідає на питання:

Чому було прийнято саме таке рішення?

Наприклад:

чому перейшли на ProjectDocumentID;
чому відмовилися від глобальної унікальності Code;
чому використовується Repository Pattern.

А Architecture/Naming Standards відповідає на інше питання:

Як потрібно робити в цьому проєкті?

Наприклад:

як називати поля;
як оформлювати новий модуль;
як будувати Repository;
як називати Factory;
як організовувати Google Sheets;
як оформлювати заголовки файлів TypeScript.
