# ADR-049 — Temporal Admission for ISSUE_SESSION / (Часові умови допуску до створення session)

## Статус

**PROPOSED / (Запропоновано).** Дата: 2026-10-27. Slice: 2C.3B.7.

**[DOCUMENTED]** Власник ERP КУБ погодив напрям проєктування
`STRICT_BACKEND_ADMISSION` виключно для `ISSUE_SESSION`. Це ADR не схвалює
runtime enforcement, реалізацію адаптера, runtime integration або production activation.
До окремих approvals та Acceptance Review чинні контракти й guards не змінюються.

**[DOCUMENTED]** Baseline: `feature/bom-logic`,
`d6256e4f56d14650a51e124813066309ef5691f1`, clean working tree, empty staging
до створення цих двох документів. ADR-000–ADR-048 утворюють наявну послідовність;
ADR-049 є наступним вільним номером. Використано чинний каталог `docs/adr`,
нумерацію `ADR-NNN`, title/status/context/decision/consequences та Markdown-розділи
за зразком останніх ADR. Застарілі індекси README не перенумеровуються цим slice.

**[DOCUMENTED]** PRODUCTION — NO-GO. ADMIN deployment — NO-GO.
TEST_RESET execution — NO-GO. Remote durable admission — BLOCKED.

## Evidence levels / (Класифікація доказів)

**[DOCUMENTED]** Мітка на початку абзацу або розділу поширюється на всі його
твердження, списки, формули та таблиці до наступної явної мітки. Вони класифікують
наявні докази, а не надають approval. Повні визначення шести рівнів наведені у
[Proof Obligations — Evidence levels](../ADMIN_WEB_TEMPORAL_ADMISSION_PROOF_OBLIGATIONS.md#evidence-levels).
`DESIGN ASSUMPTION` також маркує запропоновані вимоги: вони ще не доведені та не
змінюють чинну runtime policy. `DOCUMENTED` не означає реалізацію remote guarantee.

## Контекст

**[DOCUMENTED]** Чинна вимога — `STRICT_COMMIT_TIME`. Для відповідної atomic
operation успішний commit повинен бути раніше за застосовні expiry. Atomicity
і одноразовість самі по собі не доводять цю нерівність. За результатом попереднього
Firestore/PostgreSQL feasibility review для досліджених API predicate
`actualCommitTime < expiresAt` не доведений; це unresolved blocker, а не твердження
про неможливість будь-якого майбутнього механізму. Поточні
[DurableAdmissionRequirements і gate](../../src/admin/web/identity-contracts/durable-store-contracts.ts)
вимагають strict expiry, reviewed ownership, clock across workers/restart та
approved directory consistency. Позитивного evidence issuer немає; remote
[composition](../../src/admin/web/authentication/composition.ts) залишається blocked.

**[DOCUMENTED]** Firestore документує атомарні transactions та повторення callback
при конфліктах. Це не є доведеним прикладним expiry predicate на actual commit.
[Firestore transactions](https://firebase.google.com/docs/firestore/manage-data/transactions).
PostgreSQL розрізняє transaction-start `CURRENT_TIMESTAMP`/`now()` і час виклику
`clock_timestamp()`; сам time read також не є commit-time predicate.
[PostgreSQL time functions](https://www.postgresql.org/docs/current/functions-datetime.html#FUNCTIONS-DATETIME-CURRENT).
Server timestamp transform чи timestamp, отриманий після commit, не доводять
превентивне expiry enforcement. Загальний аудит цих backend тут не повторюється.

**[DOCUMENTED]** Grant і session мають різні lifetime. Чинні
[IDENTITY_TTL](../../src/admin/web/identity-contracts/contracts.ts): transaction 120 s,
assertion 20 s, grant максимум 30 s, session максимум 15 min, authentication cap
максимум 1 h від підтвердженого authentication event. Grant обмежений також своїми
transaction/upstream caps; session expiry не прирівнюється до grant expiry.
Уже прийнятий assertion не перевіряється як новий assertion на кожному use session.

**[DEMONSTRATED BY LOCAL TEST]** Прийнятий checkpoint `d6256e4` містить локальну
Safe Grant Renewal reference model: максимум 3 grants, 2 renewals, 2 silent attempts,
private owner/generation capabilities, reentrancy guard і final clock sampling.
Evidence: accepted local review та
[renewal tests](../../src/admin/web/authentication/renewal-reference-model.test.ts).
За попередньою перевіркою full Vitest мав 2088 PASS; у документаційному slice цей
набір не перезапускався. Це не distributed fencing, реальна crypto/clock authority
або доказ remote transaction behavior.

**[DOCUMENTED]** [Minimum Remaining Grant Lifetime](../ADMIN_WEB_SAFE_GRANT_RENEWAL.md)
відсікає короткі pre-dispatch attempts. Reserve не обмежує transport, queue,
contention, retries чи commit latency. Тестові 5000 ms не є production default,
expiry grace або доказом `STRICT_COMMIT_TIME`; authoritative-read timeout також
не є commit deadline чи доказом cancellation.

## Рішення та scope

**[DOCUMENTED]** Погоджено тільки проєктування, за такою матрицею:

| Operation / surface | Чинний стан | Напрям проєктування цього ADR |
| --- | --- | --- |
| `ACCEPT_ASSERTION` | `STRICT_COMMIT_TIME` | Без зміни; незалежний blocker PO-11 |
| `ISSUE_SESSION` | `STRICT_COMMIT_TIME` до окремого approval | `STRICT_BACKEND_ADMISSION`, PROPOSED |
| Protected ERP RPC | Чинна authorization policy | Без зміни; окрема execution boundary |
| Remote durable admission | `BLOCKED` | Залишається BLOCKED |

**[DESIGN ASSUMPTION]** Policy B розділяє законність створення session і законність
її використання. Вона може дозволяти лише завершення незмінної, законно допущеної
`ISSUE_SESSION` operation після grant expiry. Вона не дозволяє новий admission
expired grant, не вводить grace та не поширюється на `ACCEPT_ASSERTION` або ERP
business mutations. Наявність чинного `Es` не легалізує issuance, яке порушило
застосовну Policy A або B.

## Authoritative admission boundary

**[DESIGN ASSUMPTION]** Для однієї незмінної business operation `O`:

| Символ | Визначення |
| --- | --- |
| `a_i` | Фінальна authoritative backend admission boundary конкретної transaction attempt `i` |
| `a` | `a_k` останньої attempt `k`, яка потім успішно завершилася commit |
| `c` | Actual database commit time; може бути недоступним для точного спостереження |
| `Eg` | Незмінний expiry саме grant, який споживає `O` |
| `Es` | Незмінний expiry створеної session |
| `C` | Effective upstream authentication cap із перевіреного lineage; не збільшується renewal |
| `[L_i, U_i]` | Trusted time interval, який обмежує час boundary `a_i`, а не старого request |
| `t0` | Незмінний conservative lifetime anchor першого валідного admission `O` |

`O` зв'язує operation kind/ID/digest, context/environment/audience/script ID/backend
origin, grant/transaction/assertion lineage, issuer/subject, expected revision,
credential digest та expected authorization version. Додаткові trusted metadata
мають бути незалежно authenticated і незмінно зв'язані з `O`, а не прийняті з DTO.

`a_i` відбувається після всіх необхідних authoritative dependency reads та підготовки
незмінного write-set. Final time sample і decision мають належати саме цій boundary;
збережений чи переданий із попередньої attempt interval непридатний. Механізм має
довести freshness до decision. Після decision не можна читати нову policy або
змінювати bindings без нового admission. Сам подальший database commit є окремою
подією `c` і може чекати.

Admission не дорівнює початку HTTP request, початку transaction, browser readiness
check, grant issuance, dispatch, historical receipt або commit response.
Aborted attempt не дає права на session; збереження її раннього anchor не переносить
її admission decision на наступну attempt.

## Temporal invariants для запропонованої Policy B

**[DESIGN ASSUMPTION]** Наступні TI є вимогами до майбутнього дизайну, а не runtime
дозволами. Вони застосовуються сукупно.

1. **TI-01:** кожна attempt має власне `a_i`; `L_i <= a_i <= U_i` та `U_i < Eg`,
   отже `a_i < Eg`. Також `L_i >= grant.issuedAt`, `U_i < C`; невідомий/невалідний
   clock або boundary uncertainty, що досягає expiry, означає deny.
2. **TI-02:** equality на expiry означає deny. Немає `Eg + grace`, permissive skew
   або TTL extension. Grant lifecycle/revision, provenance, current user/version
   і погоджений revocation fence перевіряються на цій attempt.
3. **TI-03:** `c >= Eg` може завершувати лише ту саму `O` після законного `a` та
   атомарного одноразового consumption. Це не загальний дозвіл створювати session
   з expired grant і не право повторити mutation після UNKNOWN.
4. **TI-04:** кожна retry attempt виконує fresh authoritative reads і новий decision;
   успішний старий check не резервує часовий дозвіл. Retry після expiry відхиляється.
5. **TI-05:** commit, response, retries, restart і recovery не пересувають `t0`,
   `sessionIssuedAt`, `Es`, authenticatedAt або `C` уперед.
6. **TI-06:** `Es = min(t0 + 900000, C)` і `Es <= C`. При first use чи будь-якому
   подальшому protected request trusted upper time bound повинен бути `< Es` і `< C`.
7. **TI-07:** session, яка expired до first use, не дає доступу. Історичний
   COMMITTED outcome не є ані credential, ані позитивним `UseOK`.
8. **TI-08:** revocation/disable/version change не може бути перезаписана late
   issuance так, щоб відновився заборонений доступ. Потрібні PO-05/PO-06.
9. **TI-09:** timestamp facts не підміняються: `backendDecisionAt`, `t0` і `c`
   мають окрему семантику. `UNAVAILABLE` actual commit time не вигадується.
10. **TI-10:** до доведеного safe terminal outcome або safe fencing зберігаються
    recovery/retention obligations. Timeout чи missing receipt не дають права GC
    доказів або replacement mutation.

## CreationOK та UseOK

**[DESIGN ASSUMPTION]** `CreationOK_B(O, S)` вимагає: verified grant provenance і
bindings, чинний admission останньої успішної attempt, незмінний trusted anchor,
atomic grant consumption + одна session + bound durable receipt, а також погоджені
revocation/directory guarantees. Поля session і TypeScript brand самі цього не доводять.
Для Policy A додатково залишається застосовний strict actual-commit expiry predicate;
пізній commit не можна легалізувати перевіркою власного TTL session.

`UseOK(S, request, boundary)` вимагає `CreationOK` за застосовною погодженою policy,
автентичного bearer-to-digest binding й authoritative current record, ACTIVE та
не відкликаного стану/fence, валідних session/upstream time bounds, current active
issuer/subject, matching authorizationVersion, допустимої key provenance і permission
для конкретної server-selected ERP operation на погодженій execution boundary.
Current PermissionService checks зберігаються. Чинність grant у минулому не заміняє
ці перевірки, а поточна session validity не доводить законність її створення.

## Lifetime anchor t0

**[DESIGN ASSUMPTION]** `t0` фіксується під час першого валідного admission саме `O`,
включно з випадком, коли ця attempt потім abort. Він має бути trusted conservative
anchor, не пізніший за відповідний actual admission. Кандидат `t0 = L_0` допустимий
лише після доведення clock bounds, freshness і lineage consistency; це не вибраний
готовий clock mechanism. Browser time, token `iat`, dispatch/response time,
`commandCreatedAt` orchestration clock чи historical lookup time не підміняють його.

```typescript
sessionIssuedAt = t0;
sessionExpiresAt = Math.min(
  sessionIssuedAt + 900000,
  authenticationExpiresAt
);
```

Тут `authenticationExpiresAt = C` із verified effective lineage. Arithmetic має
залишатися валідним; cap не збільшується під час renewal. Усі retries отримують той
самий anchor, але новий admission decision. Commit delay скорочує доступний lifetime.
Recovery не створює нової session та не переобчислює expiresAt.

**[NOT IMPLEMENTED]** У чинному RecoveryDescriptor немає reviewed реалізації
durable ownership/restoration цього anchor. Вибір джерела `t0`, immutable fixation
при concurrent first admissions, зв'язування з `O`, збереження при abort та restoration
після restart — **OPEN PROOF OBLIGATION PO-04**, разом із PO-01/PO-08/PO-12.
Цей ADR не додає поля до Wire v1. Якщо anchor не можна безпечно відновити, дозволений
лише погоджений fail-closed recovery; новий anchor або mutation не дозволені.

## Late commits та часові обмеження

**[DESIGN ASSUMPTION]** Late commit може залишити вже expired session record.
Такий record може бути лише історичним: немає positive credential release,
`UseOK` або автоматичного replacement. Допустимість самого такого запису після
`Es`/`C` є відкритим owner decision у PO-14; design-direction approval не означає,
що цей residual risk уже прийнято.

**[BLOCKED]** Не доведено числову верхню межу `c - a`, commit cancellation або
safe finite retention для всіх in-flight cases. Немає нового вигаданого commit
deadline чи retention period. Якщо власник вимагає фізично не створювати навіть
історичний record після expiry, необхідний окремий commit-time proof; use checks
не задовольняють таку вимогу.

## Revocation та current authorization

**[DOCUMENTED]** Firestore transaction може забезпечувати спільну атомарність і
serializable conflict handling для відповідних records у своєму transactional
scope. Участь усіх потрібних records та конкретні preconditions має довести adapter.
[Firestore isolation](https://firebase.google.com/docs/firestore/transaction-data-contention).
Script Properties та Firestore не мають спільного atomic commit у чинному дизайні;
PermissionService/UserRepository не мігруються цим ADR.

**[DESIGN ASSUMPTION]** Потрібні окремі гарантії, не просто ще один reread:

| Подія | Потрібна поведінка / відкритий механізм |
| --- | --- |
| Session revocation | Current session/fence забороняє use; late writer не затирає revocation |
| Signing-key compromise/revocation | Заборона відповідного issuance/use за current policy; planned retirement не прирівнюється до compromise |
| Grant revocation | Лише якщо окремо погоджено lifecycle; чинний grant має AVAILABLE/CONSUMED, новий REVOKED тут не вводиться |
| Logout-all | Durable subject/family epoch або еквівалент охоплює також pending issuance |
| Pending issuance | Tombstone/fence діє до появи session record; відсутність record не є дозволом пізніше відновити доступ |
| User disable | Current authority забороняє use; ordering із late issuance потребує proof |
| authorizationVersion change | Стара version не підвищується в старій session; ordering/повторне використання version потребують погодження |
| Current permissions | PermissionService перевіряє конкретну дію; roles не копіюються з grant/browser |
| Revocation між a і c | Late commit не відновлює доступ; або transaction conflict/retry/deny, або доведений fence робить record непридатним |
| Revocation між c і protected RPC | Current authoritative checks та execution fence забороняють новий допуск |
| Зміна permission між check та ERP mutation | Потрібна окрема погоджена execution boundary; наслідки вже admitted in-flight operation визначаються явно |

Якщо grant/session/receipt і revocation epoch перебувають у тій самій reviewed
authority та беруть участь у transaction, можна проєктувати спільні CAS/revision
умови. Це не доводить consistency із зовнішнім directory/key authority. Для них
потрібні reviewed revision/epoch/fencing або інший доказовий protocol, PO-05/PO-06.
Немає заяви про zero revocation lag, автоматичне скасування in-flight effects або
shared atomicity між незалежними authorities.

## UNKNOWN, recovery та retention

**[DOCUMENTED]** Чинні
[RecoveryDescriptor/RecoveryCoordinatorPort](../../src/admin/web/operation-contracts.ts),
[atomic store](../../src/admin/web/identity-contracts/atomic-store-contracts.ts) і
[receipt validation](../../src/admin/web/channel-contracts/recovery.ts) розділяють
immutable operation metadata, commit outcome та session access. Runtime durable
coordinator/authoritative ownership implementation залишається відсутнім.

**[DESIGN ASSUMPTION]** Descriptor зберігається до possible dispatch; operation ID,
command digest, identity/context/bindings та lifetime anchors незмінні. Business
transition і receipt атомарні. Після UNKNOWN допускається лише read-only authoritative
lookup оригінальної operation. Timeout, missing receipt, втрачений descriptor або
orphan session не доводять rollback і не дозволяють replacement mutation/session.
Historical receipt не містить bearer і не створює `UseOK`.

Recovery descriptors, uniqueness/replay markers, unresolved intents, revocation
tombstones та anchor evidence зберігаються до доведеного safe GC condition.
Cleanup має врахувати всі ще можливі in-flight completions, retries і restart,
а не лише час останнього lookup. Якщо finite bound або fence не доведений,
time-based deletion не схвалюється; потрібні fail-closed capacity limits і
окреме availability рішення. Числового retention period цей ADR не встановлює.

## Compatibility та незмінність чинного контракту

**[DOCUMENTED]** У цьому slice незмінними залишаються:

- `STRICT_COMMIT_TIME` для `ACCEPT_ASSERTION` і чинна вимога для `ISSUE_SESSION`;
- remote gate BLOCKED, TTL, Wire v1 та exact command-digest framing;
- [LoginOrchestrator](../../src/admin/web/authentication/login-orchestrator.ts),
  [PermissionService](../../src/security/permission-service.ts), production authorization;
- ADMIN entrypoints/RPC allowlist, manifests/build configuration;
- [Safe Grant Renewal contracts](../../src/admin/web/authentication/renewal-contracts.ts).

**[DESIGN ASSUMPTION]** Майбутня зміна потребує Gate B: versioned policy evidence,
точної семантики `consumedAt`/admittedAt/commit facts, trusted anchor binding та
сумісності readers/receipts. Старий boolean, enum cast, JSON DTO або readiness
result не може ввімкнути B чи відкрити gate. Не можна мовчки записати admission time
як нібито відомий actual commit time. Wire v1 можна зберегти лише після доказу
сумісності; непогоджені fields/fallback у v1 не додаються.

## Альтернативи та наслідки

**[DESIGN ASSUMPTION]** Залишити тільки A — сильніша temporal вимога, проте її
remote proof залишається незалежною роботою. Розробляти B для ISSUE_SESSION —
можливість розділити completion і право доступу, ціною додаткових clock/anchor/
revocation/retention proof obligations. Expiry grace, TTL increase, прирівнювання
readiness до admission або B для ACCEPT_ASSERTION не є обраними альтернативами.

Позитивний очікуваний наслідок B — обмеження нових admissions живим grant без
re-anchoring session через commit latency. Обмеження — можливі історичні expired
records, orphan credentials, довгий UNKNOWN і capacity/availability failures.
Це не production guarantees та не дозвіл на runtime implementation.

## Decision gates

**[DOCUMENTED]** Gates є окремими approvals; проходження попереднього не відкриває
наступні. Документи лише готують Gate A.

| Gate | Потрібний результат | Поточний стан |
| --- | --- | --- |
| A — ADR/Proof Model Review | Незалежно узгоджені scope, модель, PO та acceptance scenarios | PROPOSED; review ще потрібний |
| B — Contract Evolution Approval | Явне погодження нормативної зміни, versioning і residual risks | BLOCKED; approval відсутній |
| C — Backend Adapter Evidence | Reviewed clock/store/coordinator/revocation/recovery evidence | BLOCKED; implementation/evidence відсутні |
| D — Integration Acceptance | Негативні integration tests, runtime provenance, bundle guards, deployment readiness | BLOCKED; acceptance відсутній |
| E — Production Authorization | Окреме рішення власника системи | BLOCKED; authorization відсутній |

**[BLOCKED]** PO-11 щодо ACCEPT_ASSERTION не обходиться проходженням A–D для
ISSUE_SESSION. Gate E не замінює невиконані security proofs. Повний каталог,
статуси та 20 acceptance scenarios:
[Temporal Admission Proof Obligations](../ADMIN_WEB_TEMPORAL_ADMISSION_PROOF_OBLIGATIONS.md).

## Відкриті питання перед наступними gates

**[BLOCKED]** Не вибрані й не доведені: authoritative clock profile; атомарне
закріплення/restoration `t0`; distributed grant/family ownership; revocation та
directory/execution ordering; safe retention/GC; допустимість історичних late
records; policy/schema compatibility; незалежний strict ACCEPT_ASSERTION mechanism.
Кожен із них має відповідний PO; жоден не закритий сукупним числом локальних tests.

**[DOCUMENTED]** Супровідні чинні документи:
[durable contracts](../ADMIN_WEB_DURABLE_STORE_CONTRACTS.md),
[local authentication](../ADMIN_WEB_LOCAL_AUTHENTICATION.md),
[identity contracts](../ADMIN_WEB_IDENTITY_CONTRACTS.md),
[channel Wire v1](../ADMIN_WEB_CHANNEL_WIRE_CONTRACTS.md),
[safe renewal](../ADMIN_WEB_SAFE_GRANT_RENEWAL.md).
