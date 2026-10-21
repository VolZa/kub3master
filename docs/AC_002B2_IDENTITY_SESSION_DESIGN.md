# AC-002B.2 — Production Identity & Session Design

Дата: 2026-10-21. Лише локальний прототип і design review. v32 незмінна.

## Рішення та межі доказів

Рекомендується B: GIS + окремий verifier із підтримуваною Google auth бібліотекою.
Це умовний вибір: реальний Google-вхід у HtmlService НЕ підтверджено. До перевірки iframe/origin,
двох акаунтів, серверних stores та каналу GAS→verifier production залишається NO-GO.
Офлайн RSA-фікстури доводять лише перевірки локальних підписів/claims.

| Критерій | A: перевірка у GAS | B: окремий verifier |
|---|---|---|
| Google signature | Потрібні перевірена JS RSA/JWT бібліотека, Google keys, rotation/cache; наявний CJS не переноситься | Google auth library, pin audience, Google keys/rotation; менше власної криптографії |
| Наявний код | Utilities має RSA signing; signing не є signature verification | Існуючий GoogleTokenVerifier port / IdentityPrototype повторно використовуються |
| GIS iframe/FedCM | Однаковий непідтверджений browser gate | Verifier сам не усуває iframe gate |
| OAuth | Web client, consent/branding/audience, точні origins | Те саме + серверна конфігурація verifier |
| Підтримка | Власний криптографічний код і GAS-квоти | Cloud runtime, patching, secrets, rate limits, key discovery |
| Вартість | GAS quotas; немає окремого compute bill | Billing, compute/egress, registry/logs/secrets; free tier не гарантує нуль |
| Чинний /exec | URL можна зберегти при майбутньому update існуючого deployment | Аналогічно, verifier URL окремий; ERP URL не змінюється |

Google рекомендує серверні бібліотеки для перевірки ID token; tokeninfo не використовується в production.
[Google ID token verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token),
[OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect).
Utilities документує signing, не готовий JWT verifier:
[Utilities](https://developers.google.com/apps-script/reference/utilities).
Вартість оцінюється після вибору регіону/лімітів: [Cloud Run pricing](https://cloud.google.com/run/pricing).

HtmlService працює в sandbox iframe. FedCM для cross-origin frames потребує
identity-credentials-get у всіх батьківських frames; GAS може не дозволяти застосунку змінити їх.
Це ризик сумісності, а не доведена неможливість. Не вимикати захист, не wildcard-ити origins.
Якщо gate не пройдений — STOP; окремо погодити stable-origin login bridge із точним postMessage
origin/source, одноразовим кодом обміну та challenge binding. Це не частина поточної реалізації.
[HtmlService restrictions](https://developers.google.com/apps-script/guides/html/restrictions),
[FedCM migration](https://developers.google.com/identity/gsi/web/guides/fedcm-migration).

## Аудит і повторне використання

- permission-service.ts: UserIdentity із WeakSet provenance, User/Role/Permission, актуальний UserRepository
  на кожній перевірці. ERP_OWNER — application role; Google owner/deployer не є її джерелом.
- identity-prototype.ts: фактична назва controller — IdentityPrototype, окремого IdentityController немає.
  Перевіряє issuer/audience/expiry/nonce/binding, атомарний consume challenge через port.
- prototype/identity/google-token-verifier.cjs: Node-only RS256 POC, trusted fixture keys; не production
  Google key discovery, не GAS import. Існуючі тести invalid signature/issuer/audience/expiry/replay збережені.
- production-authorization.ts і register.ts: точна allowlist 20 wrappers, double boundary registry/raw handlers.
  Null policy для Manufacturing write/onEdit. Незмінний production provider current→undefined.
- doGet зараз також default-deny. Прототип не додає public auth wrappers і не змінює allowlist.

## Локальні компоненти

session-prototype.ts повторно використовує IdentityPrototype.complete і PermissionService.
Сесія: issuer + subject + authorizationVersion + expiresAt, без ролей. Обмеження 15 хвилин,
не довше початкового ID token. Немає sliding refresh: після завершення потрібен новий login/challenge.
Issue приймає лише branded identity, перевіряє активного відомого користувача з REPORT_VIEW.
TECHNOLOGIST не може отримати робочу звітну сесію. Unknown user не реєструється автоматично.

SessionStore зберігає SHA-256 секрету; raw opaque session — мінімум 256 CSPRNG bits.
SessionCrypto — port, НЕ реалізований GAS RNG. Не використовувати Math.random, UUID як доказ entropy
чи ScriptApp token. Варіант для майбутнього адаптера — CSPRNG verifier через автентифікований канал.
Наявний begin binding створює browser Web Crypto; nonce/id має створювати server CSPRNG, TTL 2 хв.
ChallengeStore має атомарно consume під ScriptLock/transaction. Поточні тести store in-memory,
вони не доводять міжпроцесну атомарність GAS.

На кожний RPC: перевірити session, актуального User, active, version, поточні permissions.
Зміна ролей/статусу збільшує authorizationVersion, робить усі попередні сесії непридатними;
навіть без збільшення видалений permission не проходить повторну перевірку PermissionService.
Logout видаляє session digest; усі його request tickets також стають непридатними.
Недоступний store/verifier — відмова, без cached-owner fallback.

Для повторного використання RPC передбачено server-issued request ticket: 60 секунд, одноразовий,
прив'язаний до session digest + фіксованого permission + SHA-256 валідованого payload і handler name.
Значення hash сервер обчислює сам у prepare та execute; не довіряє browser hash.
Канонічне представлення envelope має бути погоджене й реалізоване перед інтеграцією.
RequestTicketStore.consume атомарно звіряє всі поля й видаляє ticket ДО callback.
Паралельні запити використовують різні tickets; timeout/помилка callback не дозволяє повторити ticket.
Це не транзакційна exactly-once гарантія business write: новий ticket не є бізнес-ідемпотентністю.
Немає автоматичного retry; невизначений результат операції потребує readback/recovery процедури.

Bearer session, викрадена через XSS, дозволяє атакуючому отримати нові tickets до logout/expiry.
Прототип не заявляє захисту від крадіжки bearer. Не зберігати session/ID token у URL, DOM, logs,
localStorage або ScriptProperties у plaintext. Browser session лише в JS memory, clear на logout/reload;
не припускати доступності HttpOnly cookies для HtmlService. HTTPS, мінімальні скрипти, без innerHTML
для недовірених даних, перевірка XSS/login-CSRF, rate limits і body bounds — обов'язкові live gates.
Після login ID token відкидається. Roles/email із браузера ніколи не є джерелом прав.

Зв'язок із AC-002B.1: майбутній fixed RPC adapter викликає session.invoke, встановлює trusted identity
лише на час синхронного callback, через try/finally очищає request scope; HandlerAuthorization читає
цей scope для registry і raw checks. Не зберігати identity у глобальному стані між executions.
Generic browser dispatcher або browser-selected permission заборонені. Такий adapter ще не підключений.

## UserRepository та перший ERP_OWNER

Мінімум для двох користувачів: ScriptProperties, ключ KUB_SECURITY_USERS_V1:

```json
{"version":1,"users":[]}
```

Кожний запис: issuer="https://accounts.google.com", subject (Google sub), email (довідковий),
active:boolean, roles:Role[], authorizationVersion:nonnegative integer. Email не ключ і не fallback.
property-user-repository.ts — read-only strict parser/adapter із PropertyReader; production його не імпортує.
Порожній/missing directory не надає прав; malformed/duplicate/unknown roles — ACCESS_DENIED.
Ліміт прототипу 20 записів; майбутній writer має перевіряти UTF-8 byte size значення і квоти.
ScriptProperties спільні для проєкту, а не Google-відвідувача. Script editors — довірені security admins;
редактор коду може обійти application checks. UserProperties не використовувати як browser identity store.
[Properties service](https://developers.google.com/apps-script/guides/properties).

Окремі session/challenge/ticket records з TTL, bounded count, admission rate limit, fail-closed при quota.
Секрети тільки hashed; ScriptLock для create-if-absent/consume/version updates, не read-then-delete.
CacheService не authoritative store: eviction не має надавати доступ. При втраті record — deny/login.
Реальний GAS store не реалізовано. Квоти перевірити до live probe:
[Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas).

Bootstrap (лише після окремого дозволу):
1. В ізольованому probe перевірити Google token власника, записати контрольований доказ issuer/sub,
   client audience, час, challenge receipt; без token/session у доказі. Unknown candidate отримує лише
   факт перевіреної особи для enrollment, НЕ session/доступ до ERP.
2. Власник незалежно підтверджує очікуваний акаунт і саме цей subject. Зафіксувати явне призначення
   ERP_OWNER; це не право першого відвідувача, Drive owner чи USER_DEPLOYING.
3. Окремий ручний admin крок у project settings додає погоджений запис до directory, version=1,
   без публічного bootstrap endpoint. Зберегти audit receipt без секретів; закрити enrollment probe.
4. Аналогічно підтвердити subject начальника цеху й призначити тільки WORKSHOP_MANAGER.
   Не створювати користувачів у цьому Slice. Recovery — повторна явна offline admin процедура,
   без auto-owner reset; backup directory потребує окремого захищеного процесу.

## Межі Manufacturing, Sheets і triggers

| Джерело | Доказ/політика | Поточний стан |
|---|---|---|
| Web RPC | Перевірена сесія + fixed permission + одноразовий ticket | Прототип; production deny |
| Ручна зміна Sheets | Drive ACL, не ERP session; користувач може обійти UI | ACL не змінюємо; прямі права окремо переглянути |
| Simple onEdit/onOpen | Event object не visitor authentication, browser може підробити аргументи | onEdit deny; onOpen потребує authenticated context |
| Installable trigger | Виконується від creator, не автоматично ERP_OWNER | Лише майбутня окрема service capability з allowlisted trigger/документом/операцією |
| Admin/editor execution | Доступ до editor не означає роль ERP | Окремий reviewed manual admin workflow; no public admin dispatch |

Installable triggers виконуються під creator:
[Installable triggers](https://developers.google.com/apps-script/guides/triggers/installable).
Перевірка лише triggerUid або event поля недостатня для RPC trust. Майбутню trigger entrypoint
ізолювати від web RPC і обмежити конкретною операцією; ніяких спадкованих owner permissions.
Поточний onEdit маршрутизує productionJournal редагування та інші journal handlers — не auth transport.
createManufacturingFromWeb створює факти; matrix create/cancel/placement/admin ще не погоджена.
REPORT_VIEW для існуючих lookup handlers не дає права Manufacturing write. Planning placeholder
не отримує вигаданих дозволів. Ці блокери не знімаються успішним Google login.

## Точний план зовнішньої конфігурації — НЕ ВИКОНАНО

Спочатку отримати окреме погодження проєкту, billing/region/budget, двох тестових акаунтів,
verifier auth, origins і scope змін. Не використовувати production v32 як експериментальний login.

1. У погодженому Google Cloud project налаштувати Google Auth Platform Branding/Audience/Data Access.
   Для Gmail/cross-domain — External, Testing з двома явно погодженими test users; Internal тільки
   коли обидва належать допустимій Workspace організації. Scopes лише openid/email/profile,
   без Sheets/Drive scopes для GIS login; перевірити фактичну consent UX і publishing requirements.
2. Створити OAuth Client типу Web application, окремий probe client. У Authorized JavaScript origins
   додати ТОЧНИЙ фактичний origin сторінки GIS, виміряний в ізольованому HtmlService probe.
   Origin без path; не підставляти /exec і не вважати script.google.com origin iframe.
   Не реєструвати wildcard googleusercontent. Якщо origin неприйнятний/нестабільний — STOP.
   Callback JS flow не потребує вигаданого redirect URI; redirect mode потребує точного погодженого HTTPS URI.
   Client ID публічний, client secret не надсилати у browser.
   [GIS setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid).
3. Після погодження verifier: увімкнути Cloud Run, Artifact Registry, Cloud Build, Secret Manager APIs
   у погодженому проєкті (Cloud Build лише якщо обраний build path). Мінімальний runtime service account,
   без Sheets/Drive прав. Node LTS + pinned google-auth-library, verifyIdToken з exact client audience;
   додатково RS256, issuer, exp/iat, subject, nonce та azp коли застосовно; ніколи token-provided key URL.
   Підтримувати Google key rotation/cache; outage/unknown kid fail closed. Не брати audience із request.
4. Канал GAS→verifier має бути автентифікованим. Мінімальний варіант для окремого погодження:
   HTTPS endpoint із application HMAC-SHA256 (не удавати, що GAS OAuth access token є Cloud Run ID token).
   256-bit secret: GAS ScriptProperties / verifier Secret Manager, keyId rotation, POST-only, body <=32 KiB,
   fixed URL/path, redirects заборонені. MAC над method/path/timestamp/requestId/SHA256(exact body),
   ±30s window, constant-time compare, атомарний replay store requestId (наприклад Firestore transaction,
   потребує окремого API/resource дозволу); перевірка ДО token parsing. Тільки один verify route.
   Cloud Run route при цій схемі мережево публічний, але application-auth protected; це окремий ризик
   billing/DoS, max instances/rate limits не замінюють auth. Не вмикати public ingress без погодження.
   Альтернатива private IAM Run потребує окремого service-identity/token-minting дизайну без ключів;
   ScriptApp.getOAuthToken не є автоматичним рішенням. Обрати ОДИН transport до реалізації.
   [Cloud Run service authentication](https://docs.cloud.google.com/run/docs/authenticating/service-to-service).
5. Verifier response прив'язати до requestId/token hash, TTL<=30s та authenticated TLS channel;
   строгий response schema/status/body bound, без roles, без логування credential/Authorization/body.
   Помилка/timeout — deny, без fallback/tokeninfo. Secrets і decoded claims не виводити в логи.
   Витрати: compute, registry, logs, secrets, replay store, egress; budget alert не hard spending cap.
6. Лише після offline transport/store tests: ізольований standalone probe, не bound до MASTER,
   окреме погодження push/deployment/probe. Мінімальні GAS external_request/storage capabilities
   переглянути окремо; чинний manifest у цьому Slice не змінюється. CSP/iframe policy перевірити
   фактично в браузерах; не вимикати захист/не обходити computer-use обмеження.

## Контрольний вхід двох користувачів — майбутня ручна процедура

1. Власник погоджує isolated probe і конфігурацію; v32 залишається незмінна. Поки немає конфігурації — BLOCKED.
2. В окремому browser profile увійти в Google як погоджений ERP_OWNER. Запустити явну GIS button дію,
   begin challenge→Google ID token з nonce→server verifier→atomic consume→enrolled User→session.
   Перевірити exact iframe origin, client audience, sanitized issuer/subject evidence. Не копіювати токен.
3. В іншому profile повторити як WORKSHOP_MANAGER. Підтвердити різні subjects, правильні ролі з directory,
   не email/browser claims; не auto-select попередній акаунт. ERP_OWNER і workshop сесії не змішуються.
4. Використати лише безпечні read-only probe callbacks: обидві ролі REPORT_VIEW/LIST, workshop BOM_EDIT denied,
   owner перевірити grant без реального BOM write. Manufacturing write/onEdit denied для обох.
5. Перевірити expired/replayed challenge, wrong aud/nonce/signature, expired session, чужий ticket,
   logout, повторний RPC, disable User/version bump. Жодного фактичного report write/delete/rename.
6. Після кожного logout старі tickets/session denied; не логувати raw secrets. Зафіксувати browser/version,
   testId, status, timestamp, sanitized distinct subject references; live proof не підміняти offline PASS.
7. Якщо будь-який gate FAIL/BLOCKED — STOP, без production deployment, без автоматичних retries.
   Після PASS обох потрібні окремі review інтеграції auth bootstrap/RPC scopes й дозвіл публікації.

## Exit gate

GO для review локального design/prototype і погодження обмеженої зовнішньої конфігурації.
NO-GO для фактичного налаштування ресурсів без дозволу, production identity enablement, Manufacturing
write і deployment. Немає GAS stores/RNG/verifier transport, реального User directory, login/session
RPC адаптерів, auth bootstrap та live двоакаунтного доказу. Усі 20 production wrappers лишилися deny.
Не виконано push/deployment, записів у MASTER/OPERATIONAL/REPORTING, ACL або real user змін, Git commit/push.

## Локальна перевірка та перелік змін

- Новий src/security/session-prototype.ts: reuse controller + PermissionService, session/ticket ports, logout.
- Новий src/security/property-user-repository.ts: read-only directory adapter, без реальних записів.
- Новий src/security/session-prototype.test.ts: 16 тестів session/directory/controller composition.
- src/ui/gas-entrypoint-boundary.test.ts: перевірка, що нові прототипи/fixtures не потрапили в production.
- Цей документ: порівняння A/B, store/bootstrap/session design, зовнішня конфігурація та manual runbook.

Команди 2026-10-21:

| Команда | Результат |
|---|---|
| npx vitest run | 827/827 PASS, 43 test files; включає B1–B4.2 та наявні RSA/security regressions |
| node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false | PASS |
| npm run build | PASS, Rollup + local assets |

Окремо перевірено expiry/logout/revoked User/version/role, forged identity, payload/permission/session
substitution, ticket replay/expiry, consume-before-callback-error, independent concurrent tickets,
invalid token і challenge reuse через наявний controller, immutable/duplicate/malformed directory.
Google token crypto лишається покритим попередніми RS256 тестами; новий composition test має явний
ізольований fake verifier, а не удає реальну Google verification. Production VM перевіряє всі wrappers
і registry callbacks default-deny без Google side effects.

Реальну concurrency/lock durability, CSPRNG GAS adapter, network/verifier auth, browser CSRF/XSS,
канонічний RPC payload, quota admission/cleanup та доступність двох live Google акаунтів НЕ перевірено.
Відкликання діє для наступної перевірки; уже розпочату business операцію воно не скасовує заднім числом.
