ADR-021 — Domain Boundaries.md

Рішення

Предметна область ERP поділяється на незалежні домени.

Проєктна область:

Projects
├── Project
└── ProjectDocument

Виробнича область:

Houses
└── House

House містить посилання на Project, але не є його частиною.

Обґрунтування

Проєкт описує конструкцію будинку.
Будинок є реалізацією проєкту.
Один проєкт може використовуватися багатьма будинками.
Надалі всі виробничі процеси (Placement, Production, MaterialUsage, Shipment, Installation) будуть пов'язані саме з House.
Після цього вся ERP набуває дуже логічної структури
src/
└── domain/
├── catalog/
├── elements/
├── bom/
├── materials/
├── projects/
│ ├── project._
│ └── project-document._
│
├── houses/
│ └── house.\*
│
├── placement/
├── production/
└── warehouse/
