ADR-035 — Naming Convention for Module Directories

Рішення:

Каталоги модулів та каталоги конкретних DataSource називаються в однині, відповідно до назви доменної сутності.

Приклади:

modules/house
modules/project
modules/material

infrastructure/sheets/house
infrastructure/sheets/project
infrastructure/sheets/material

Переваги:

збігається з назвами класів (House, Project, Material);
немає плутанини між сутністю та колекцією;
симетрична структура між modules та infrastructure.
