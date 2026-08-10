ADR-036 — Typed Google Sheets DataSource Architecture

GoogleSheetsDataSource<T> — єдиний базовий DataSource.
Усі таблиці описуються через \*Row.
Mapper працює лише між Row ↔ Domain.
Repository не працює з unknown[][].
headerMap використовується лише в застарілих модулях (до повної міграції), нові модулі його не використовують.

введення SheetCell, SheetRow, SheetMatrix;
правило, що unknown допускається лише в Infrastructure;
правило Row ↔ Domain через Mapper;
заборону використання unknown[][] у Repository та Domain.
