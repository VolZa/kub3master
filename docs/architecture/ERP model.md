// docs\architecture\ERP model.md

META MODEL

                 04_Catalog

======================================================

                  PROJECT DOMAIN

Project
│
▼
ProjectDocument
│
▼
00_Elements
│
▼
01_BOM

======================================================

                PRODUCTION DOMAIN

Project
│
▼
House
│
▼
13_Placement
│
▼
Production
│
▼
Material Usage

Що це означає
08_Projects
ID
Code
Name
Comment
IsActive
CreatedAt

Наприклад

ID Code Name
1 Д-05/2020 Будинок КУБ
09_ProjectDocuments
ID
ProjectID
Code
Name
Comment
ID ProjectID Code Name
1 1 КР.3 Закладні вироби
2 1 КР.7 Колони
3 1 КР.9 Плити перекриття
11_Houses (або 10_Houses)
ID
ProjectID
Code
Name
Address
Customer
Comment
IsActive

Наприклад

ID ProjectID Code Name
1 1 H001 Будинок №1
2 1 H002 Будинок №2

Після цього 10_ProjectItems вже містить

HouseID

і цього достатньо.

Ланцюжок виходить таким:

ProjectItem
│
▼
House
│
▼
Project
