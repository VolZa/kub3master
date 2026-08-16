<!--
BOM (текст специфікації)
            │
            ▼
parseStructuredLine()
            │
            ▼
parseSpec()
            │
            ├── parseRebar()
            ├── parseAngle()
            ├── parsePipe()
            ├── parseBeam()
            ├── parseChannel()
            ├── parsePlate()
            └── ...
            │
            ▼
BuiltElement
            │
            ▼
CatalogTemplateResolver
            │
            ▼
CatalogItem (Template)
            │
            ▼
resolveElementType()
            │
            ▼
MaterialResolver
            │
            ▼
getOrCreateElementFromBuilt()
            │
            ▼
00_Elements
-->

Parser — читає текст і виділяє геометрію та характеристики.
MaterialCodeBuilder — формує канонічний код матеріалу.
PartCodeBuilder — формує код деталі на основі коду матеріалу та довжини.
MaterialResolver — знаходить матеріал у 05_Materials.
ElementCreator — створює запис у 00_Elements.

material-code.builder.ts
