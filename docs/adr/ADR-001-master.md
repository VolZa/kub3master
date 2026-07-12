Architecture & Domain Decision Records (ADDR)

ADR-001 — MASTER є єдиним джерелом істини.
Title

MASTER — Single Source of Truth

Status

Accepted

Context

ERP має два середовища:
MASTER
OPERATIONAL

Decision

Єдиним джерелом істини є MASTER.

Consequences

Усі довідники редагуються тільки в MASTER.

OPERATIONAL працює виключно через синхронізацію.

ADR-002 — ERP повторює структуру проектної документації.
ADR-003 — Коди елементів унікальні лише в межах ProjectDocument.
ADR-004 — ERP складається з двох незалежних предметних областей: Project Domain і Production Domain.
ADR-005 — Існуюче ядро BOM розширюється без порушення його роботи та без втрати зворотної сумісності.
ADR-006 — Матеріальні потоки є наслідком виробничих подій, а не вводяться вручну.

№ Назва Статус
ADR-001 MASTER є єдиним джерелом істини (Single Source of Truth) ✅ Accepted
ADR-002 ERP повторює структуру проектної документації ✅ Accepted
ADR-003 Коди виробів і деталей унікальні лише в межах ProjectDocument ✅ Accepted
ADR-004 ERP складається з двох незалежних предметних областей: Project Domain і Production Domain ✅ Accepted
ADR-005 BOM є єдиним джерелом інформації про склад виробу ✅ Accepted
ADR-006 Матеріальні потоки виникають лише як наслідок виробничих подій ✅ Accepted
ADR-007 Repository не містять бізнес-логіки ✅ Accepted
