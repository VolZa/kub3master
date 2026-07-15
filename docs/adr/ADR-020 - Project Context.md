docs\adr\ADR-020 - Project Context.md

Рішення

ERP не передає окремо:

HouseID;
ProjectID;
ProjectDocumentID.

Усі бізнес-сервіси працюють через єдиний об'єкт:

ProjectContext
