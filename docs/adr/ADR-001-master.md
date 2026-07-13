//docs\adr\ADR-001-master.md

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

Consequences (Наслідки)

Усі довідники редагуються тільки в MASTER.

OPERATIONAL працює виключно через синхронізацію.
