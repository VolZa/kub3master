docs\adr\ADR-016 — Стандарт моделей Element та порядку полів.md

Приймемо єдиний порядок полів для всіх моделей.
Це зробить код значно читабельнішим і спростить подальшу розробку та рефакторинг.
Це гарна практика для довготривалих проєктів, особливо коли одна й та сама сутність представлена в кількох DTO, моделях і маперах.

1. Ідентифікація
   id
   code
   name

2. Типізація
   type
   category
   baseUnit
   profileType

3. Зв'язки
   parentMaterialId
   parentType

4. Геометрія
   diameter
   className
   width
   height
   length
   thickness

5. Фізичні властивості
   weightPerUnit
   density

6. Службові
   comment
   isActive
   createdAt
