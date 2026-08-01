ADR-033 — Google Sheets Infrastructure.

<!--
Фінальна схема
                Google Sheets
                      │
          ┌───────────┴───────────┐
          │                       │
          ▼                       ▲
 GoogleSheetsReader      GoogleSheetsWriter
          │                       ▲
          │                       │
     headers + data         headers + data
          │                       ▲
          └──── GenericSheetObjectMapper ────┘
                     ▲
                     │
                  Row objects
                     ▲
                     │
                HeaderSchema
                     ▲
                     │
             *_HEADERS constants
Ролі компонентів -->

GoogleSheetsReader

Єдина відповідальність:

Google Sheets
↓
unknown[][]

API

read(sheetKey)

readHeader(sheetKey)

readData(sheetKey)
HeaderSchema

Єдина відповідальність

headers

↓

валідація структури

Перевіряє

порожні заголовки
дублікати
обов'язкові поля
GenericSheetObjectMapper

Єдина відповідальність

headers + unknown[][]

⇅

Row[]

Він уже нічого не знає про Google Sheets.

GoogleSheetsWriter

Єдина відповідальність

unknown[][]

↓

Google Sheets

API

replace()

append()
GoogleSheetsDataSource

Він більше не займається ні читанням, ні записом.

Він лише координує.

Приблизно так:

const matrix = reader.read(sheetKey);

const headers = matrix[0].map(String);
const data = matrix.slice(1);

HeaderSchema.validate(
headers,
HOUSE_HEADERS,
);

return mapper.matrixToRows(
headers,
data,
);
