docs\adr\ADR-022 — Row та Domain Model.md

Принцип

Кожна сутність ERP має дві моделі:

Row — структура рядка Google Sheets.
Domain Model — модель предметної області.

Google Sheets
│
▼
ProjectRow
│
Mapper
│
▼
Project
Правило №1

\*Row повністю відповідає структурі Google Sheets.

Наприклад:

export interface ProjectRow {
ID: string;
Code: string;
Name: string;
}

Ніяких перейменувань.

Ніяких перетворень.

Ніякої бізнес-логіки.

Правило №2

Domain Model використовує стиль TypeScript.

export interface Project {
id: string;
code: string;
name: string;
}
Правило №3

Усі перетворення виконує Mapper.

Наприклад:

ID → id
CreatedAt → createdAt
ProjectID → projectID

А також:

string → Date

string → number

string → boolean
