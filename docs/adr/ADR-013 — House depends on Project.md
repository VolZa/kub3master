docs\adr\ADR-013 — House depends on Project.md

## Title

Будинок є реалізацією проекту

## Status

✅ Accepted

## Context

Проект не знає скільки будинків і де буде збудовано.
Будинок обов'язково має проект за яким його зводять.

## Decision (Рішення)

Зв'язок: Будинок -> Проект

          Project
              ▲
              │
              │

House ────────┘

## Consequences (Наслідки)

У коді це означає, що:

ProjectRepository

не повинен мати методів типу:

getHouses()

А ось

HouseRepository

може мати:

getProject()

або

getByProject(projectId)
