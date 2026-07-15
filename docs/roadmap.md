// docs\roadmap.md

# Roadmap

## Етап 1

- Catalog
- BOM
- Placement
- Synchronization

## Етап 2

- Material Usage
- Material Balance
- Reports

## Етап 3

- Warehouse (склад)

## Етап 4

- Production Planning

## Етап 5

- Shift Planning

Етап 1. Багатопроєктність ⭐ (поточний)

Мета:

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

Результат:

один екземпляр ERP підтримує багато проєктів;
існуюча логіка одного проєкту продовжує працювати.
Тепер уже можна працювати маленькими безпечними кроками:

✅ Модель даних (завершено).
DTO (ElementRow).
Mapper.
DataSource.
Repository.
Factory.
І лише після цього — логіка пошуку за ProjectDocumentID, коли вона дійсно знадобиться.

При цьому після кожного кроку проєкт має компілюватися і працювати, як і раніше.

Етап 2. Material Usage
Placement
│
▼
Material Usage
Етап 3. Material Balance
MaterialBatches

-

Material Usage

=

Balance
Етап 4. Planning
Balance

↓

Production Planning

Перевірити імпорт проектної документації через нову модель (House → Project → ProjectDocument).
Переконатися, що 00_Elements і 01_BOM формуються без змін у поведінці.
Перевірити створення 13_Placement.
Лише після цього переходити до MaterialConsumptionService.

Таким чином ми завершимо багатопроєктну основу і повернемося до головної мети цього чату — цифрового двійника матеріальних потоків, який спирається на вже перевірену модель виробів. Це буде природне продовження виконаної роботи без стрибків між різними частинами системи.
