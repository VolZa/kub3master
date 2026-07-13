# ADR-010

## Title

Багатопроєктність ERP

## Status

Accepted

## Context

ERP КУБ спочатку була реалізована для одного проєкту.

Необхідно забезпечити підтримку декількох незалежних проєктів без порушення
існуючої архітектури Catalog, BOM та Production.

При цьому одна проектна документація може використовуватися
для будівництва багатьох будинків.

## Decision

Багатопроєктність реалізується шляхом введення двох нових доменних сутностей:

- Project
- ProjectDocument

Кожний ProjectDocument належить одному Project.

Проєктні елементи (products та assemblies) посилаються
на ProjectDocument.

Глобальний довідник Catalog не залежить від проєкту
і залишається спільним для всіх проєктів.

Будинок (House) завжди належить одному Project.

Уся виробнича інформація визначає проєкт через House.

## Consequences

Не потребують змін:

- Catalog
- MaterialRepository
- MaterialBatchRepository
- Placement

Потребують мінімального розширення:

- 00_Elements
- BOM

ERP підтримує будь-яку кількість незалежних проєктів.

Існуюча функціональність одного проєкту повністю зберігається.

// ============================================================================
// File: src/domain/materials/material-usage.service.ts
// Module: Materials
// Layer: Domain
// Responsibility:
// Calculates material usage for produced products based on BOM.
// Dependencies:
// - PlacementRepository
// - BOMRepository
// - MaterialRepository
// ============================================================================

import ...

Що означає кожен рядок

File

src/domain/materials/material-usage.service.ts

Ти одразу бачиш, де створити файл.

Module

Materials

До якого модуля ERP належить файл.

Layer

Domain

До якого шару архітектури він належить.

Наприклад:

Domain
Application
Infrastructure
Presentation
Shared

Responsibility

Одне-два речення про відповідальність класу.

Це допомагає уникати ситуації, коли клас починає робити "все підряд".

Dependencies

Одразу видно, від чого залежить цей клас.

Наприклад:

PlacementRepository
BOMRepository
MaterialRepository

або

GoogleSheetsDataSource
Я б додав ще один пункт
// ============================================================================
// File: src/domain/materials/material-usage.service.ts
// Module: Materials
// Layer: Domain
// Responsibility:
// Calculates material usage for produced products based on BOM.
//
// Used by:
// MaterialBalanceService
// MaterialReportsService
// ============================================================================

Тоді відразу видно не тільки від чого залежить клас, але й хто його використовує.

Ще одна моя пропозиція

Я почну вказувати ще й статус файлу.

Наприклад

// Status:
// New

або

// Status:
// Refactoring

або

// Status:
// Existing (modify)

Тоді ти одразу розумітимеш:

створити новий файл;
змінити існуючий;
чи це лише приклад.

Для існуючих файлів

Я теж буду починати відповідь приблизно так:

Змінюємо існуючий файл

src/domain/catalog/catalog.repository.ts

або

Створюємо новий файл

src/domain/materials/material-usage.service.ts

щоб не виникало питання:

"Це новий файл чи потрібно редагувати існуючий?"

Це стане нашим стандартом

Від сьогодні я беру за правило:

Перед будь-яким кодом вказувати:
створюється новий файл чи змінюється існуючий;
повний шлях до файлу.
Кожен новий файл починати зі стандартного заголовка-коментаря.
Перед написанням коду коротко пояснювати:
навіщо потрібен цей файл;
яке його місце в архітектурі ERP;
як він взаємодіє з іншими модулями.
