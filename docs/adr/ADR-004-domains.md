// docs\adr\ADR-004.md

ERP складається з двох незалежних предметних областей:

Project Domain і Production Domain ✅ Accepted

Проектна область
Project

↓

ProjectDocument

↓

Elements

↓

BOM

Ніяких будинків.

Виробнича область
House
│
└── ProjectID
│
▼
Project

House

↓

Placement

↓

Production

↓

MaterialUsage
