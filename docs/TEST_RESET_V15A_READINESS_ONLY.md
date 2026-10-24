# TEST_RESET v1.5a — readiness-only build та identity bootstrap

## Статус і межі

Ця збірка призначена лише для першої ручної перевірки окремого GAS-проєкту `ERP_KUB_TEST`. Вона не містить `prepare`, запису evidence, `activate`, `rollback`, копіювання або видалення файлів. Вона не є дозволом на реальний `TEST_RESET`.

Локально прив'язаний TEST Script ID:

`1WSR8kYywtuohfUGmCvg3nO4Fz6Y5uxpWBdNkZfF-kTMQLj4icLS33IrK`

Production Script ID явно заборонений:

`1HbCOjFYh21DdVn116JgvHDu-_23seWyTfPd1CDyGHGnKOqq4DSnEknLI`

Назва проєкту, власник Drive-файлу і GAS execution identity не є доказом TEST-контексту. Кожна функція перевіряє одночасно фактичний `ScriptApp.getScriptId()`, точну build-time прив'язку Script ID, відсутність Web App URL і `KUB_TEST_INSTALLATION_V1`.

## Окрема поверхня

Build: `npm run build:test-readiness`  
Output: `build/test-readiness`  
Clasp target: `targets/test-readiness/.clasp.json`  
Перевірка target і bundle:

```powershell
node scripts/check-test-readiness-target.cjs 1WSR8kYywtuohfUGmCvg3nO4Fz6Y5uxpWBdNkZfF-kTMQLj4icLS33IrK
clasp.cmd -P targets/test-readiness/.clasp.json status
```

Bundle має рівно чотири top-level editor-функції без суфікса `_`, щоб Apps Script Editor виявив їх для ручного запуску:

- `KUB_TEST_probeIdentity()` — отримує підтверджені Google `issuer`, `sub` і email для ручного enrollment; не авторизує і нічого не записує.
- `KUB_TEST_adminIdentity()` — вимагає активного запису `ADMIN` у `KUB_TEST_USERS_V1` і permission `USER_MANAGE`.
- `KUB_TEST_readOnlyPreflight()` — повторно вимагає `ADMIN / USER_MANAGE`, читає три production-джерела і повертає діагностику. У readiness-only build scripts, triggers та external connections залишаються `UNKNOWN`, тому reset не дозволяється.
- `KUB_TEST_probeSheetsApi()` — вимагає `ADMIN / USER_MANAGE` і перевіряє лише HTTP-статус GET до незалежної діагностичної таблиці; не читає її body/headers.

Apps Script трактує ім'я із завершальним `_` як private і приховує таку функцію від клієнта; у завантаженій збірці це також прибрало всі функції зі списку ручного запуску редактора. Тому readiness wrappers мають публічні імена. Кожна функція відхиляє будь-які аргументи, перевіряє фактичний TEST Script ID, installation marker і відсутність Web App URL. Identity probe не створює користувача й не призначає роль; решта трьох функцій вимагають `ADMIN / USER_MANAGE`.

Публічне ім'я теоретично робить wrapper видимим для `google.script.run`, але bundle не має HTML, `doGet`, `doPost` або Web App deployment, тому в поточному проєкті немає HtmlService-клієнта. Apps Script API також не може виконати функцію без окремого API executable deployment, спільного standard Cloud project і належного OAuth token ([Apps Script API execution requirements](https://developers.google.com/apps-script/api/how-tos/execute)). Створення будь-якого deployment залишається стоп-умовою. Правило private-функцій описане в [Apps Script HTML service communication guide](https://developers.google.com/apps-script/guides/html/communication#private_functions).

## OAuth scopes

### Діагностичне підключення Advanced Google Sheets Service v4 тільки в TEST

Вихідний readiness manifest — `targets/test-readiness/appsscript.json`.
`rollup.test-readiness.config.mjs` копіює його в `build/test-readiness/appsscript.json`.
Єдина зміна цього маніфесту — залежність:

```json
"dependencies": {
  "enabledAdvancedServices": [
    { "userSymbol": "Sheets", "serviceId": "sheets", "version": "v4" }
  ]
}
```

Основний `appsscript.json` ERP та інші target manifests не змінюються.
Усі п'ять OAuth scopes, `urlFetchWhitelist`, exceptionLogging, runtimeVersion і timeZone
залишаються чинними. Rollup і target checker дозволяють тільки цю точну залежність
у TEST readiness; додаткові сервіси/бібліотеки не дозволені. Виклики `Sheets.*` у bundle
також блокуються. REST adapter, probe і preflight продовжують використовувати UrlFetchApp;
викликів `Sheets.Spreadsheets.get()` не додано.

Це діагностичний крок для перевірки доступності Sheets API, а не доведене виправлення HTTP 403.
Google дозволяє додати Advanced Service через manifest; для Default GCP project відповідний
API вмикається автоматично. Для Standard GCP project увімкнення API є окремою ручною дією
([Advanced services](https://developers.google.com/apps-script/guides/services/advanced#enable_advanced_services),
[manifest dependencies](https://developers.google.com/apps-script/manifest/dependencies)).
У межах цього patch жоден remote project або API не змінювався.

Порядок **окремо погодженого** оновлення `ERP_KUB_TEST`:

1. Повторити локальні `npx.cmd tsc --noEmit`, `npm.cmd run build:test-readiness`,
   `npm.cmd run check:test-readiness`, `npm.cmd test`.
2. Перевірити TEST Script ID у target і в GAS Editor, Default GCP project та відсутність
   deployments/triggers. Переглянути build manifest: додана лише залежність вище,
   scopes і whitelist не змінені. У кандидатах readiness upload — тільки Code.gs і appsscript.json.
3. Лише після окремого погодження власник оновлює readiness-only код/manifest саме
   `ERP_KUB_TEST` через його target. Production target і production manifest не використовувати.
   Ця інструкція не є поточним дозволом на push.
4. Оновити Editor і перевірити Google Sheets API v4 у Services. Якщо потрібні додаткові
   scopes, права, зміна GCP project або ручні Cloud settings — зупинитися й повідомити;
   не розширювати права і не вмикати інші сервіси автоматично.
5. Не змінювати Script Properties. Вручну запустити наявний `KUB_TEST_probeSheetsApi()`
   з уже налаштованим незалежним diagnostic ID. Якщо повернуто PASS / 200, окремо
   запустити `KUB_TEST_readOnlyPreflight()` та порівняти безпечні статуси джерел.

Ризики й межі: після майбутнього TEST оновлення зміниться доступність API в Default GCP;
можливі відмова політики організації/consent або збереження 403 з іншої причини.
Поточну гіпотезу можна оцінити лише живим контрольним probe в ERP_KUB_TEST.
Fail-closed, UNKNOWN dependencies і resetAllowed:false залишаються чинними незалежно
від HTTP-результату. TEST_RESET, deployment та записи в Sheets не дозволені.

### Незалежний контрольний запит KUB_TEST_probeSheetsApi

Наявний `urlFetchWhitelist` уже покриває `https://sheets.googleapis.com/v4/spreadsheets/`.
Whitelist і всі п'ять OAuth scopes залишено без змін. Окрема editor-функція виконує
лише `GET /v4/spreadsheets/{diagnosticId}?fields=spreadsheetId` для незалежної таблиці.
Існуючий `KUB_TEST_readOnlyPreflight()` та production source configuration не змінено.

Порядок ручного запуску після окремо дозволеного оновлення readiness-only TEST-коду:

1. У `ERP_KUB_TEST` → Project Settings → Script Properties додати
   `KUB_TEST_DIAGNOSTIC_SHEET_ID` зі звичайним ID таблиці `ERP_KUB_API_DIAGNOSTIC_DATA`,
   без URL і пробілів. Формат — 20–200 символів `[A-Za-z0-9_-]`. ID не повинен
   збігатися з MASTER, OPERATIONAL або REPORTING. Назва таблиці через API не читається:
   власник сам звіряє, що property вказує саме на незалежну діагностичну таблицю.
2. Зберегти чинний TEST installation marker і enrollment активного ADMIN.
   Оновити редактор; список Run function тепер містить чотири функції.
3. Вручну запустити `KUB_TEST_probeSheetsApi()` без аргументів.
4. Очікуваний результат має рівно чотири поля, наприклад:
   `{"operation":"SHEETS_API_PROBE","status":"PASS","httpStatus":200,"resetAllowed":false}`.

Перед Sheets-запитом застосовуються точний TEST Script ID, installation marker,
відсутність Web App URL і чинна перевірка ADMIN / USER_MANAGE. Для авторизації
використовується існуючий Google UserInfo flow; його результат не журналюється.
Токен для контрольного GET береться на сервері через `ScriptApp.getOAuthToken()`.
Sheets response body і headers не читаються навіть за HTTP 403; diagnostic probe
не запускає risk scan, Drive-доступ, preflight або операції reset.

`httpStatus` дозволяє лише числа `200`, `401`, `403`, `404` або рядки `OTHER`,
`REQUEST_FAILED`. Тільки 200 дає PASS; всі інші результати — BLOCKED.
`REQUEST_FAILED` також охоплює відмову TEST/ADMIN перевірок, відсутню property,
некоректний чи production ID, помилку токена та виняток запиту: додаткові причини
не розкриваються. `resetAllowed` завжди false, ID/URL/identity/token/headers/body
в результат не потрапляють. PASS означає лише HTTP 200 для незалежної таблиці
в контексті ERP_KUB_TEST; доступ до production-джерел цим не підтверджується.

### Діагностика SOURCE_INSPECTION_FAILED

Лише ручний `KUB_TEST_readOnlyPreflight()` додає `sources[].inspectionFailure`,
якщо джерело має blocker `SOURCE_INSPECTION_FAILED`. Деталізація визначається етапом
виконання, без читання повідомлення або stack винятку Google API:

| inspectionFailure | Етап відмови |
| --- | --- |
| `DRIVE_ACCESS_FAILED` | `DriveApp.getFileById()` або читання метаданих Drive-файлу |
| `SOURCE_FILE_INVALID` | ID, MIME type або trashed не пройшли чинну перевірку |
| `SPREADSHEET_ACCESS_FAILED` | Readiness: HTTP/JSON-доступ Sheets API; у GAS inspector — `SpreadsheetApp.openById()` |
| `RISK_SCAN_LIMIT` | Чинна перевірка лічильника клітинок; поріг залишається 250000 |
| `SHEET_READ_FAILED` | Отримання/читання аркушів, діапазонів або складання snapshot під час сканування |
| `SNAPSHOT_INVALID` | Snapshot не пройшов чинну перевірку ID, назв аркушів або масиву hazards |
| `SPREADSHEET_INSPECTION_FAILED` | Резервний код для винятку inspector без відомої типізованої стадії |

Ручний preflight також додає `sources[].inspectionDetail` для `SOURCE_INSPECTION_FAILED`.
Це закритий string union із runtime allowlist; поле містить тільки фіксований код:

| inspectionDetail | Категорія |
| --- | --- |
| `CONTENT_TYPE_INVALID` | Некоректний/недоступний Content-Type успішної REST-відповіді |
| `BODY_TOO_LARGE` | HTTP 200 body перевищив чинний ліміт 8000000 символів |
| `JSON_INVALID` | JSON parse error HTTP 200 body |
| `ROOT_INVALID` | Некоректний кореневий об'єкт, ID або масив sheets |
| `SHEET_PROPERTIES_INVALID` | Некоректні/непідтримувані властивості аркуша |
| `GRID_DATA_MISSING` | Відсутній GridData block або data є порожнім масивом |
| `GRID_DATA_INVALID` | Некоректна структура/координати/розміри GridData |
| `DATE_TIME_UNSUPPORTED` | Числове значення з форматом DATE, TIME або DATE_TIME |
| `EFFECTIVE_ERROR_UNSUPPORTED` | effectiveValue містить непідтримуваний errorValue |
| `CELL_FEATURE_UNSUPPORTED` | Непідтримувані chips, pivot або data-source cells |
| `CELL_SCHEMA_INVALID` | Інша некоректна/непідтримувана структура CellData, value, link або note |
| `UNKNOWN` | Інші помилки; також fallback для невідомих значень detail |

REST adapter → `SpreadsheetInspectionError.detail` → чинний risk scanner
(зберігає типізовану помилку) → `TestAdminDiagnostics.preflightForReadiness()`
(перевіряє allowlist) → `sources[].inspectionDetail` → наявний JSON report.
Жодних координат, назв аркушів, ID, URL, body чи текстів винятків у нове поле не копіюється.
Звичайний адміністративний preflight його не повертає.

Попередні `inspectionFailure`, `inspectionAccessFailure`, HTTP 403 diagnostics і всі
умови блокування збережено. HTTP-помилки та RISK_SCAN_LIMIT не перевизначаються:
їх detail за відсутності вужчої категорії — UNKNOWN. Запитів і читань body не додано;
scopes, whitelist, source IDs, Script Properties, 250000 та body limits залишаються чинними.
Дати, errorValue та інші раніше непідтримувані клітинки й надалі блокуються.
У будь-якому результаті readiness `resetAllowed:false`; TEST_RESET залишається NO-GO.

Після окремо дозволеного оновлення TEST readiness-коду повторити
`KUB_TEST_readOnlyPreflight()` без аргументів. Для діагностики достатньо ролі,
`inspectionFailure`, `inspectionAccessFailure` за наявності та `inspectionDetail`.

Для REST-відмов ручний preflight зберігає `inspectionFailure: SPREADSHEET_ACCESS_FAILED`
і додає окреме `sources[].inspectionAccessFailure`:

| inspectionAccessFailure | Значення |
| --- | --- |
| `HTTP_401` | Sheets API повернув HTTP 401 |
| `HTTP_403` | Sheets API повернув HTTP 403 |
| `HTTP_404` | Sheets API повернув HTTP 404 |
| `HTTP_OTHER` | Інший HTTP-статус, відмінний від 200, включно з redirects |
| `REQUEST_FAILED` | Виняток fetch або неможливо отримати коректний HTTP-статус |

`muteHttpExceptions:true` залишається чинним: non-200 завжди блокує джерело.
Для 403 допускається обмежене читання структурованої помилки, описане нижче;
інші HTTP-відмови не читають headers/body. Повертається лише фіксований код; URL з ID,
token, upstream message, headers і body не потрапляють у діагностику.
HTTP 200 з некоректним MIME/JSON або помилкою валідації не отримує цього поля —
це окремі етапи, які зберігають попередній `inspectionFailure`.
Звичайний адміністративний preflight не повертає `inspectionAccessFailure`.
Ці коди не визначають точну причину HTTP-відмови й не є дозволом розширити scopes.
Після окремо дозволеного оновлення readiness-коду повторити
`KUB_TEST_readOnlyPreflight()` без аргументів; для аналізу достатньо ролі,
`inspectionFailure` та `inspectionAccessFailure`.

Лише для `HTTP_403` ручний readiness preflight додає `inspectionApiReason`:

Також тільки для HTTP 403 кожне джерело отримує рівно три булеві ознаки:
`hasContentLength` (заголовок Content-Length присутній), `isJsonContentType`
(Content-Type є рядком application/json із дозволеними параметрами) та
`hasContentEncoding` (заголовок Content-Encoding присутній). Назви заголовків
зіставляються без урахування регістру; значення заголовків не повертаються.
Присутність не означає валідність: порожній або некоректний Content-Length також
дає hasContentLength:true. За помилки отримання заголовків ознаки false означають
«не спостережено», а inspectionApiReason залишається UNKNOWN.
Використовується той самий єдиний getHeaders(); нових читань body немає.
Обмеження 16 KiB і попередні умови читання body залишаються чинними.
Інші HTTP-статуси й звичайний admin preflight не отримують цих полів.

| inspectionApiReason | Підстава |
| --- | --- |
| `SERVICE_DISABLED` | Відомий `google.rpc.ErrorInfo.reason` для Google API |
| `ACCESS_TOKEN_SCOPE_INSUFFICIENT` | Відомий `google.rpc.ErrorInfo.reason` для Google API |
| `PERMISSION_DENIED` | Відомий reason або загальний `error.status` без конкретного ErrorInfo reason |
| `UNKNOWN` | Невідомі, конфліктні, завеликі, некоректні або недоступні деталі |

Класифікатор перевіряє `error.code:403`, `error.status`, `details[].@type`,
`domain:googleapis.com` і точний reason. За наявності `metadata.service` він має бути
`sheets.googleapis.com`. Message та довільні metadata/Help URL не аналізуються і не
повертаються. Невідомий ErrorInfo не підмінюється загальним PERMISSION_DENIED.
Структуровані причини визначено у [Google ErrorReason](https://github.com/googleapis/googleapis/blob/master/google/api/error_reason.proto).
Default GCP project сам собою не є доказом SERVICE_DISABLED, а PERMISSION_DENIED
не доводить, що проблема саме в sharing таблиці.

Для діагностики читаються лише JSON-відповіді без стиснення з валідним
`Content-Length` від 1 до **16384 bytes**; невідома довжина або більша довжина дає
UNKNOWN без `getContentText()`. Після читання перевіряються довжина рядка, UTF-8 size
та відповідність Content-Length; максимум 16 entries у details. MIME/header/body errors
також дають UNKNOWN, зберігаючи HTTP_403 і BLOCKED. GAS не має streaming body reader:
це обмеження діагностичного читання й парсингу за заявленими HTTP headers,
а не обмеження завантаження, яке `UrlFetchApp.fetch()` уже виконав.

**Висновок для HTTP_403 / UNKNOWN без Content-Length, із JSON Content-Type
і присутнім Content-Encoding:** причина Google API залишається невстановленою.
З цих булевих ознак не можна визначити значення encoding чи розмір JSON.
Чинний GAS HTTPResponse не має bounded/streaming reader: `getContentText()`,
`getContent()` і `getBlob()` повертають усе тіло, а перевірка `.length` або `.slice()`
після виклику вже не обмежує читання. Перелік методів:
[HTTPResponse](https://developers.google.com/apps-script/reference/url-fetch/http-response).
У [UrlFetchApp.fetch](https://developers.google.com/apps-script/reference/url-fetch/url-fetch-app#fetch(String,Object))
немає документованого параметра, який задає максимальний розмір відповіді 16 KiB.
[Utilities.ungzip](https://developers.google.com/apps-script/reference/utilities/utilities#ungzip(BlobSource))
не має ліміту вихідного розміру: навіть compressed Content-Length до 16 KiB не
гарантує decoded JSON до 16 KiB. Тому адаптер не читає й не розпаковує таке тіло,
не повторює запит і не послаблює умови діагностики. Ліміт лишається 16384 bytes.
Для цієї відповіді безпечне очікування — `inspectionApiReason:UNKNOWN`, збережені
`SPREADSHEET_ACCESS_FAILED`, `HTTP_403`, `BLOCKED`, `resetAllowed:false`.
Точну структуровану причину без додаткової гарантії розміру визначити неможливо;
повторний запуск із тією самою формою відповіді не змінить цей висновок.

Приклад безпечного фрагмента результату:
`{"inspectionFailure":"SPREADSHEET_ACCESS_FAILED","inspectionAccessFailure":"HTTP_403","inspectionApiReason":"SERVICE_DISABLED"}`.
Звичайний адміністративний preflight не додає цього поля. Діагностика не змінює
OAuth scopes, whitelist, Cloud project, конфігурацію джерел чи дозвіл на reset.
Після окремо дозволеного оновлення TEST readiness-коду запустити
`KUB_TEST_readOnlyPreflight()` без аргументів і перевірити три коди для кожної ролі.

Код визначає місце збою, а не доводить конкретну причину дозволів Google.
Офіційна довідка `SpreadsheetApp.openById()` вказує scope `spreadsheets`,
а readiness використовує `spreadsheets.readonly`. Тому readiness тепер читає таблиці через
Sheets REST API, без зміни scopes ([SpreadsheetApp](https://developers.google.com/apps-script/reference/spreadsheet/spreadsheet-app#openById(String))).
`DriveApp.getFileById()` допускає `drive.readonly`; також може відмовити через відсутність файлу
або доступу ([DriveApp](https://developers.google.com/apps-script/reference/drive/drive-app#getFileById(String))).

Повторний запуск: після окремо дозволеного readiness-only оновлення TEST-коду
оновити GAS Editor і вручну виконати `KUB_TEST_readOnlyPreflight()` без аргументів.
Наявні TEST installation marker, ADMIN enrollment і scopes залишити чинними.
Для кожної ролі `MASTER`, `OPERATIONAL`, `REPORTING` перевірити `blockers` і `inspectionFailure`.
Для аналізу достатньо ролі й коду; сирі винятки та вміст клітинок не копіювати.
Навіть після усунення помилки джерел результат залишається `BLOCKED`,
поки зовнішні залежності не перевірено: вони зберігають `UNKNOWN`, а `resetAllowed` завжди `false`.
Звичайний адміністративний preflight не додає `inspectionFailure`.

### Повторний identity probe після діагностичного patch

Локальні перевірки: `npx.cmd tsc --noEmit`, `npm.cmd test`,
`npm.cmd run build:test-readiness`, `npm.cmd run check:test-readiness`.
Patch сам не оновлює GAS. Після окремо дозволеного readiness-only upload
оновити редактор саме TEST-проєкту та вручну запустити `KUB_TEST_probeIdentity()` без аргументів.
Наявний installation marker зберегти; нові scopes не додавати.

Відмова зберігає `code: ACCESS_DENIED` і `resetAllowed: false`, але лише ручний probe
додає безпечне поле `reason`:

| reason | Значення |
| --- | --- |
| `OAUTH_TOKEN_UNAVAILABLE` | Отримання OAuth-токена завершилося винятком |
| `OAUTH_TOKEN_MISSING` | OAuth-токен відсутній |
| `OAUTH_TOKEN_INVALID` | Некоректний формат OAuth-токена |
| `USERINFO_REQUEST_FAILED` | Виклик UserInfo завершився винятком |
| `USERINFO_RESPONSE_INVALID` | Неможливо отримати коректний HTTP-статус |
| `USERINFO_HTTP_DENIED` | HTTP-статус не 200; додається лише числовий `httpStatus` |
| `USERINFO_CONTENT_TYPE_INVALID` | Відсутній або некоректний Content-Type |
| `USERINFO_BODY_INVALID` | Тіло неможливо прочитати або перевищено ліміт |
| `USERINFO_JSON_INVALID` | JSON parse error |
| `IDENTITY_FIELDS_INVALID` | Некоректні identity-поля, issuer або email_verified |

Для `USERINFO_REQUEST_FAILED` ручний probe також повертає `requestFailure`:

| requestFailure | Значення / наступна ручна перевірка |
| --- | --- |
| `AUTHORIZATION_REQUIRED` | Розпізнано повідомлення про недостатню авторизацію. Перевірити consent поточного користувача для вже наявних scopes у TEST Editor; наявність scope в manifest не дорівнює наданій згоді. |
| `NETWORK_FAILURE` | Розпізнано DNS, timeout, connection, socket або SSL/network error. Повторити ручний probe пізніше; перевірка TLS залишається увімкненою. |
| `OTHER_REQUEST_ERROR` | Невідома, локалізована або інша помилка запиту; також сюди потрапляють нерозпізнані quota/allowlist/аргументні помилки. Точну причину не встановлено. |

Класифікація евристична: UrlFetchApp не документує стабільних кодів цих винятків.
Класифікатор перевіряє лише відомі префікси повідомлень і повертає фіксовану категорію;
сирий виняток, stack, message та headers не зберігаються в результаті й не журналюються.
Наприклад: `{"status":"BLOCKED","operation":"IDENTITY_PROBE","code":"ACCESS_DENIED","resetAllowed":false,"reason":"USERINFO_REQUEST_FAILED","requestFailure":"AUTHORIZATION_REQUIRED"}`.
Жодна категорія не дозволяє доступу й не є підставою додавати scopes.

Поточний fetch має фіксований HTTPS URL, GET, `validateHttpsCertificates:true`,
`followRedirects:false` і `muteHttpExceptions:true`. Останній параметр повертає HTTP-відмови
як response, але не усуває винятків авторизації або транспорту
([UrlFetchApp](https://developers.google.com/apps-script/reference/url-fetch/url-fetch-app)).
Scope у маніфесті та авторизація користувачем — окремі перевірки
([Apps Script authorization](https://developers.google.com/apps-script/guides/services/authorization)).
З самого старого `USERINFO_REQUEST_FAILED` неможливо визначити, яка з причин спрацювала.
Після окремо дозволеного оновлення readiness-only коду повторити ручний
`KUB_TEST_probeIdentity()` без аргументів та перевірити лише `reason` і `requestFailure`.

Наприклад: `{"status":"BLOCKED","operation":"IDENTITY_PROBE","code":"ACCESS_DENIED","resetAllowed":false,"reason":"USERINFO_HTTP_DENIED","httpStatus":403}`.
Ці коди визначають етап відмови, але не доводять необхідності нових scopes.
Для аналізу відмови достатньо цього об'єкта: не копіювати токен, HTTP body або Authorization.
`ADMIN_IDENTITY` та `READ_ONLY_PREFLIGHT` залишаються без деталізації identity-відмов.
Успішний probe, як і раніше, повертає identity для ручного звіряння, не призначає ролей і не дозволяє reset.

Manifest містить точний список:

```text
openid
https://www.googleapis.com/auth/userinfo.email
https://www.googleapis.com/auth/script.external_request
https://www.googleapis.com/auth/drive.readonly
https://www.googleapis.com/auth/spreadsheets.readonly
```

`openid` і `userinfo.email` потрібні для Google UserInfo; `script.external_request` — для `UrlFetchApp`; Drive і Sheets обмежено read-only. UserInfo викликається лише за `https://openidconnect.googleapis.com/v1/userinfo`, token отримується на сервері через `ScriptApp.getOAuthToken()` і не журналюється. Google описує `sub` як стабільний ідентифікатор облікового запису; email зберігається лише як інформаційне поле ([OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect), [UserInfo endpoint](https://developers.google.com/identity/openid-connect/reference)).

### Read-only Sheets REST adapter

`sheets-api-risk-adapter.ts` реалізує синхронний GAS read-only порт через
`UrlFetchApp.fetch()` і серверний `ScriptApp.getOAuthToken()`. Єдиний метод — GET
`https://sheets.googleapis.com/v4/spreadsheets/{configuredSourceId}`. Дозволено тільки
три ID із `TEST_RESET_SOURCES`; URL від клієнта не приймається. Сам REST adapter не
використовує Advanced Sheets Service; залежність v4 у TEST підключено окремо для
діагностики активації API. [spreadsheets.get](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/get)
підтримує чинний `spreadsheets.readonly`; OAuth scopes залишено без змін.

Manifest URL allowlist тепер має рівно два записи:

```text
https://openidconnect.googleapis.com/v1/userinfo
https://sheets.googleapis.com/v4/spreadsheets/
```

Це додатковий дозволений endpoint, а не новий OAuth scope. TLS перевіряється,
redirects вимкнено, body/headers/token/винятки не журналюються. HTTP-відмова, зокрема
якщо Sheets API недоступний або не ввімкнений у відповідному Cloud project, дає
`SPREADSHEET_ACCESS_FAILED`; адаптер не вмикає сервіси й не змінює Cloud settings.

GET запитує `spreadsheetId,sheets(properties,data(startRow,startColumn,rowData(values)))`
без ranges, включаючи приховані аркуші та повний CellData. Це зберігає формули
`userEnteredValue.formulaValue`, значення `effectiveValue`, `hyperlink`, cell-level
`textFormat.link` та всі `textFormatRuns[].format.link`, зокрема кілька посилань у клітинці.
Fields mask включає GridData, тому `includeGridData=true` окремо не потрібен.
Відображення CellData описано в [Sheets API Cells](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/cells).
Адаптер передає ці дані чинному `gasSpreadsheetInspector`; regex, source-ID checks,
20 hazard locations, batching і fail-closed перевірки сканера залишено чинними.
Прямокутник використаних клітинок обчислюється за вмістом, а не allocated grid size;
сума прямокутників обмежена 250000. Посилання у форматуванні поза звичайним вмістом
також розширюють перевірювану область, щоб їх не пропустити.

**Межі перевіреного покриття першого адаптера:**

- Non-GRID аркуші, smart chips, data-source formulas/tables і pivot cells блокуються.
- REST dates/times є числовими serial values, GAS повертає Date; цей адаптер не
  підмінює типи. Числові клітинки DATE/TIME/DATE_TIME блокуються.
- `effectiveValue.errorValue`, відсутній effective value для непорожньої формули,
  невідомі CellData/value/link форми та некоректні координати блокуються.
- Потрібен один GridData block із початком (0,0) для кожного аркуша; відсутній block
  не вважається доказом порожнього аркуша. Порожній `{}` block допускається.
- Відповідь понад 8000000 символів блокується до JSON parse як
  `SPREADSHEET_ACCESS_FAILED`; неповне/непідтримуване GridData — `SHEET_READ_FAILED`.
  Перевищення ліміту використаних клітинок зберігає `RISK_SCAN_LIMIT`.

Ці прогалини залишають усе відповідне джерело `BLOCKED / SOURCE_INSPECTION_FAILED`,
без SAFE або evidence. REST адаптер не використовується для fingerprint/prepare/reset.
`externalConnections`, `boundScripts`, `triggers` завжди залишаються `UNKNOWN` у readiness;
успішне читання клітинок не є перевіркою зовнішніх залежностей.

Локальна перевірка: `npx.cmd tsc --noEmit`, `npm.cmd run build:test-readiness`,
`npm.cmd run check:test-readiness`, `npm.cmd test`. Після окремо дозволеного
readiness-only оновлення коду **і manifest** у TEST Editor запустити
`KUB_TEST_readOnlyPreflight()` без аргументів. Не змінювати marker, enrollment чи scopes.
Результат усе одно має `resetAllowed:false`; перевіряти `inspectionFailure` і `blockers`
кожної ролі. Remote доступ у межах цього patch не перевірявся.

`drive.readonly` достатній для читання файлів через `DriveApp.getFileById()` за документацією [DriveApp](https://developers.google.com/apps-script/reference/drive/drive-app). Перелік scopes свідомо не включає `script.scriptapp`: remote trigger inventory перевіряється власником у UI до upload, оскільки `getProjectTriggers()` потребує ширшого scope й показує лише triggers поточного користувача.

## ScriptProperties перед першим запуском

Перед upload у TEST-проєкті не повинно бути `KUB_TEST_ENV_V1`, `KUB_TEST_ADMIN_REQUEST_V1` або `KUB_TEST_REVIEW_EVIDENCE_V1`. Для bootstrap потрібний лише marker:

Key: `KUB_TEST_INSTALLATION_V1`

```json
{"version":1,"environment":"TEST","scriptId":"1WSR8kYywtuohfUGmCvg3nO4Fz6Y5uxpWBdNkZfF-kTMQLj4icLS33IrK"}
```

Після успішного identity probe власник вручну створює `KUB_TEST_USERS_V1`. Приклад структури, де значення `subject` і `email` треба дослівно взяти з probe:

```json
{"version":1,"users":[{"issuer":"https://accounts.google.com","subject":"GOOGLE_SUB_FROM_PROBE","email":"EMAIL_FROM_PROBE","active":true,"roles":["ADMIN"],"authorizationVersion":1}]}
```

Ніколи не призначати `ADMIN` за email, власністю GAS/Drive, порядком входу або фактом першого запуску. Перед enrollment власник незалежно звіряє Google-акаунт, issuer і subject. Роль `MANAGER` не має `USER_MANAGE` і не може пройти admin diagnostics.

## Покроковий перший upload і запуск

1. У GAS UI відкрити саме окремий TEST Script ID. Перевірити, що немає deployments, Web App, installable triggers і прив'язаних до production ресурсів. За будь-якої невідповідності зупинитися.
2. Локально виконати TypeScript, Vitest і `npm run build:test-readiness`. Далі виконати `check-test-readiness-target.cjs` і `clasp ... status`. У push-кандидатах мають бути лише `Code.gs` і `appsscript.json` із `build/test-readiness`.
3. Перевірити точний Script ID у `targets/test-readiness/.clasp.json`. Лише після окремого дозволу виконати один `clasp.cmd -P targets/test-readiness/.clasp.json push`. Не використовувати production `.clasp.json`.
4. У Project Settings створити тільки `KUB_TEST_INSTALLATION_V1` з JSON вище. Інші TEST_RESET properties не створювати.
5. Після повторного upload оновити редактор і переконатися, що список Run function містить рівно `KUB_TEST_probeIdentity`, `KUB_TEST_adminIdentity`, `KUB_TEST_readOnlyPreflight`, `KUB_TEST_probeSheetsApi`.
6. В editor вручну запустити `KUB_TEST_probeIdentity()`. На consent screen перевірити назву й TEST-проєкт, погодити лише перелічені read-only scopes. Якщо Google просить додатковий scope, скасувати consent.
7. У execution log очікувати `status: PASS`, `operation: IDENTITY_PROBE`, Google issuer, subject, email, `rolesAssigned:false`, `authorizationGranted:false`, `resetAllowed:false`. За `BLOCKED`, помилки UserInfo або невідповідності акаунта зупинитися.
8. Незалежно звірити акаунт і вручну створити `KUB_TEST_USERS_V1` за наведеною схемою. Це є окремою адміністративною дією; bundle не може зробити enrollment.
9. В editor один раз запустити `KUB_TEST_adminIdentity()`. Очікувати `PASS`, точний TEST Script ID, `permission: USER_MANAGE`, `resetAllowed:false`. `ACCESS_DENIED` не обходити зміною browser-параметрів або ролі в аргументах.
10. В editor один раз запустити `KUB_TEST_readOnlyPreflight()`. Функція має тільки читати MASTER, OPERATIONAL і REPORTING. Очікуваний readiness-результат — `BLOCKED`, бо dependency evidence лишається `UNKNOWN`; це коректна fail-closed поведінка.
11. Зберегти execution logs без OAuth token і вмісту таблиць. Не запускати full TEST-admin build, `prepare`, `review`, `activate` або `rollback`.

## Стоп-умови

- target, build-time Script ID, фактичний Script ID або marker не збігаються;
- Script ID дорівнює production ID;
- `ScriptApp.getService().getUrl()` повертає Web App URL;
- є deployment, trigger або невідомий remote-файл;
- consent просить scope поза точним allowlist;
- UserInfo не повертає валідні verified email і `sub`, повертає інший issuer або non-200;
- користувач не enrolled як активний `ADMIN` або не має `USER_MANAGE`;
- читання будь-якого джерела завершується помилкою;
- знайдено зовнішнє посилання або будь-яка залежність має `UNSAFE` чи `UNKNOWN`;
- з'являється будь-яка операція запису або зміни remote state.

## Gate

Локальний код дає **GO для readiness-only upload** після ручного підтвердження відсутності remote deployments і triggers та окремого дозволу власника на push. Реальний identity/preflight лишається live probe, а реальний `TEST_RESET`, копіювання та активація мають статус **NO-GO**.
