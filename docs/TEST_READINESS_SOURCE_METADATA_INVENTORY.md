# TEST Readiness — Source Metadata Inventory (Slice 2A)

`KUB_TEST_sourceMetadataInventory()` — незалежна ручна інвентаризація MASTER, OPERATIONAL і REPORTING.
Це не risk scan, перевірка used range, dependency evidence або дозвіл на TEST_RESET.
Production і TEST_RESET — **NO-GO**, `resetAllowed` завжди `false`.

## Авторизація та запити

Entry point повторно використовує readiness `context()`: точний build-time TEST Script ID,
TEST installation marker і відсутність Web App URL. Далі чинний `admin.identity()` перевіряє
Google UserInfo, issuer/subject/email_verified, активний TEST ADMIN і `USER_MANAGE` у TEST environment.
Directory/identity не беруться з аргументів. Перед поверненням повторюється `admin.identity()`;
відкликання ADMIN або помилка guard приховує весь inventory report. Identity results не журналюються.

Для кожного configured source ID виконується рівно один GET до чинного Sheets endpoint:

```text
fields=spreadsheetId,sheets(properties(sheetId,title,sheetType,hidden,gridProperties(rowCount,columnCount)))
```

Немає GridData, rowData, values, CellData, ranges або includeGridData. Немає Drive inspection,
SpreadsheetApp або Advanced Service calls. GET використовує server OAuth token, TLS validation,
`followRedirects:false`, `muteHttpExceptions:true`. HTTP відмова не читає body або headers.
Авторизація додатково виконує два чинні UserInfo GET — до й після трьох metadata GET.
Жодних retry, web app, тригерів, записів, нових scopes/whitelist або Script Properties немає.

## Формат та валідація

Top-level report: `operation:SOURCE_METADATA_INVENTORY`, `status:PASS|BLOCKED`, `resetAllowed:false`,
`sources` у порядку MASTER/OPERATIONAL/REPORTING. Структура кожного source відповідає цільовій моделі;
`inspectionDetail` додатково обмежено закритим TypeScript union без довільних повідомлень.

Перевіряються bounded plain source ID і точна відповідність response spreadsheetId, непорожній список
аркушів, унікальні nonnegative safe-integer sheetId, унікальні непорожні title, відомі sheet types,
boolean hidden і positive safe-integer grid dimensions. Відсутній `hidden` означає protobuf default `false`.
Невідомі response/schema fields, зокрема несподівані CellData, відхиляються.

- `GRID`: GridProperties обов'язкові; відсутність — BLOCKED.
- `OBJECT`: GridProperties немає; rowCount/columnCount/allocatedCells — null. Суперечливі grid properties — BLOCKED.
- `DATA_SOURCE`: повертаються розміри, якщо вони присутні; без них — null. Звичайні range reads не припускаються.
- Якщо хоча б один аркуш не має відомих розмірів, `totalAllocatedCells:null` (не неповна сума).
- Якщо хоча б один аркуш не GRID, `estimatedRequests4096:null`, навіть якщо його grid dimensions відомі.

Добуток rowCount × columnCount і підсумки перевіряються через Number.isSafeInteger.
Inventory навмисно НЕ застосовує risk scan limit 250000: він показує allocated grid size, а не used cells.
Окремі локальні resource bounds: 1000 sheets, title до 100 UTF-16 одиниць, metadata body до 1048576
UTF-16 одиниць. Body limit перевіряється після getContentText(), а не до завантаження; streaming bound
Apps Script HTTPResponse не надає. Це лише metadata resource guard, не новий CellData budget.

Source PASS означає тільки успішний GET і валідні metadata, включно з відомими non-GRID sheet types.
Помилка будь-якого аркуша блокує ВСЕ відповідне джерело; його sheets порожній, суми null, spreadsheetId
не повертається. Решта джерел інвентаризується незалежно. Top-level PASS можливий лише якщо всі три PASS.
Жодних raw exceptions, OAuth tokens, headers, HTTP bodies, UserInfo email/subject або cell contents у звіті.
Валідовані spreadsheet IDs і sheet titles повертаються явно за цільовою моделлю: це внутрішня metadata,
тому повний звіт не слід публікувати без потреби. Сторонні response поля не копіюються.

Коди `inspectionDetail`:

```text
SPREADSHEET_ID_INVALID REQUEST_FAILED HTTP_401 HTTP_403 HTTP_404 HTTP_OTHER
CONTENT_TYPE_INVALID BODY_INVALID BODY_TOO_LARGE JSON_INVALID ROOT_INVALID
SHEET_COUNT_LIMIT SHEET_PROPERTIES_INVALID GRID_PROPERTIES_INVALID ARITHMETIC_OVERFLOW
```

Вони належать лише цій діагностиці. Чинні preflight inspectionFailure/inspectionDetail/scanner незмінні.

## Оцінка запитів

Для GRID обрано явний оцінний план прямокутників до 4096 allocated cells:

```text
якщо columns <= 4096: ceil(rows / floor(4096 / columns))
інакше: rows * ceil(columns / 4096)
```

Оцінки підсумовуються окремо по аркушах. Це row-band plan з однорядковими column tiles для широких
сіток, не оптимальний packing, не ceil загальної площі / 4096 і не затверджений request budget.
Metadata/UserInfo GET, retries, consistency checks, HTTP size, JSON overhead і форматування в цю оцінку
не входять. Жодного CellData запиту для оцінки не виконується.

## Синтетичний приклад

```json
{
  "operation": "SOURCE_METADATA_INVENTORY",
  "status": "PASS",
  "resetAllowed": false,
  "sources": [
    {
      "role": "MASTER", "status": "PASS", "spreadsheetId": "synthetic-master-source-123456",
      "sheets": [{ "sheetId": 0, "title": "Synthetic MASTER", "sheetType": "GRID", "hidden": false,
        "rowCount": 1000, "columnCount": 26, "allocatedCells": 26000 }],
      "totalAllocatedCells": 26000, "estimatedRequests4096": 7
    },
    {
      "role": "OPERATIONAL", "status": "PASS", "spreadsheetId": "synthetic-operational-source-123456",
      "sheets": [{ "sheetId": 0, "title": "Synthetic OPERATIONAL", "sheetType": "GRID", "hidden": true,
        "rowCount": 500, "columnCount": 10, "allocatedCells": 5000 }],
      "totalAllocatedCells": 5000, "estimatedRequests4096": 2
    },
    {
      "role": "REPORTING", "status": "PASS", "spreadsheetId": "synthetic-reporting-source-123456",
      "sheets": [{ "sheetId": 0, "title": "Synthetic REPORTING", "sheetType": "GRID", "hidden": false,
        "rowCount": 100, "columnCount": 10, "allocatedCells": 1000 }],
      "totalAllocatedCells": 1000, "estimatedRequests4096": 1
    }
  ]
}
```

## Ручний запуск і використання

1. Локально виконати TypeScript, `npm run build:test-readiness`, `npm run check:test-readiness` і Vitest.
2. Лише після окремо погодженого TEST push оновити GAS Editor. Цей slice сам upload не виконує.
3. У ERP_KUB_TEST мають бути рівно п'ять wrappers: KUB_TEST_probeIdentity, KUB_TEST_adminIdentity,
   KUB_TEST_probeSheetsApi, KUB_TEST_readOnlyPreflight, KUB_TEST_sourceMetadataInventory.
4. Чинні marker та TEST ADMIN enrollment залишити без змін. Нових Script Properties не потрібно.
5. Вручну виконати `KUB_TEST_sourceMetadataInventory()` без аргументів. Вона повертає й один раз
   журналює JSON report. На відмові guard не обходити authorization зміною ролей чи аргументів.
6. Для майбутнього slice використати rows/columns, hidden/non-GRID types і оцінки для планування
   MAX_REQUESTS_PER_SOURCE/MAX_TOTAL_REQUESTS, tile size, total response size і time budgets.
   У metadata немає used range або byte-size CellData; це не доказ, що майбутній range scan вкладеться
   у бюджет чи охопить стабільний snapshot. Порожня порція не є умовою завершення сканування.

Чинний KUB_TEST_readOnlyPreflight не викликає inventory, не змінює результати після його запуску,
зберігає UNKNOWN dependency blockers та resetAllowed:false. Інвентаризація не підтримує дати/час
у CellData й не усуває BODY_TOO_LARGE/DATE_TIME_UNSUPPORTED у preflight: це окремий наступний slice.
