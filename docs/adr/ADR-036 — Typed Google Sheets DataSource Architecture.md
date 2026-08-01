ADR-036 — Typed Google Sheets DataSource Architecture

GoogleSheetsDataSource<T> — єдиний базовий DataSource.
Усі таблиці описуються через \*Row.
Mapper працює лише між Row ↔ Domain.
Repository не працює з unknown[][].
headerMap використовується лише в застарілих модулях (до повної міграції), нові модулі його не використовують.
