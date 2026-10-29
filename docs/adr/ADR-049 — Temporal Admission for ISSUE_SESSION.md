# ADR-049 — Temporal Admission for ISSUE_SESSION / (Часові умови допуску до створення session)

## Статус

**PROPOSED / (Запропоновано).** Дата: 2026-10-27. Slice: 2C.3B.7.

**[DOCUMENTED]** Власник ERP КУБ погодив напрям проєктування
`STRICT_BACKEND_ADMISSION` виключно для `ISSUE_SESSION`. Це ADR не схвалює
runtime enforcement, реалізацію адаптера, runtime integration або production activation.
До окремих approvals та Acceptance Review чинні контракти й guards не змінюються.

**[DOCUMENTED]** Amendment Slice 2C.3B.10a (2026-10-29): owner-selected модель B —
**First Durably Admitted Operation**. Погоджено нормативний напрямок durable-first,
`t0 = L_j` першої valid durable transition, fail-closed recovery та умовну
допустимість inert historical records. Нижче сформульовано запропонований amendment;
ADR залишається PROPOSED. Backend implementation не доведена, Gate B —
**BLOCKED BY MISSING DECISION**, Gate C–E не відкриті. Це рішення не завершує Gate B.

**[DOCUMENTED]** Baseline: `feature/bom-logic`,
`d6256e4f56d14650a51e124813066309ef5691f1`, clean working tree, empty staging
до створення цих двох документів. ADR-000–ADR-048 утворюють наявну послідовність;
ADR-049 є наступним вільним номером. Використано чинний каталог `docs/adr`,
нумерацію `ADR-NNN`, title/status/context/decision/consequences та Markdown-розділи
за зразком останніх ADR. Застарілі індекси README не перенумеровуються цим slice.

**[DOCUMENTED]** Baseline цього amendment: `feature/bom-logic`, HEAD
`930c19fc558f41de0cbab3c6474427955dc87f43`, clean working tree, empty staging.
Попередній baseline вище є історією створення документів.

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
її використання. У цьому amendment модель B уточнює first admission як першу
законну authoritative durable admission transition. Вона може дозволяти лише
завершення незмінної, законно допущеної
`ISSUE_SESSION` operation після grant expiry. Вона не дозволяє новий admission
expired grant, не вводить grace та не поширюється на `ACCEPT_ASSERTION` або ERP
business mutations. Наявність чинного `Es` не легалізує issuance, яке порушило
застосовну Policy A або B.

## Authoritative admission boundary

**[DESIGN ASSUMPTION]** Для однієї незмінної business operation `O`:

| Символ | Визначення |
| --- | --- |
| `d_i` | Доведений linearization point законної authoritative durable admission transition attempt `i` |
| `d` | `d_k` attempt `k`, яка потім успішно завершила business commit |
| `j` | Attempt першої valid durable transition у linearizable order для original `O` |
| `c` | Actual database commit time; може бути недоступним для точного спостереження |
| `Eg` | Незмінний expiry саме grant, який споживає `O` |
| `Es` | Незмінний expiry створеної session |
| `C` | Effective upstream authentication cap із перевіреного lineage; не збільшується renewal |
| `[L_i, U_i]` | Trusted interval, що доведено охоплює саме `d_i` |
| `t0` | `L_j`, single-assignment conservative lifetime anchor першої valid durable transition `O` |

`O` зв'язує operation kind/ID/digest, context/environment/audience/script ID/backend
origin, grant/transaction/assertion lineage, issuer/subject, expected revision,
credential digest та expected authorization version. Додаткові trusted metadata
мають бути незалежно authenticated і незмінно зв'язані з `O`, а не прийняті з DTO.

Authoritative admission конкретної attempt — успішна законна durable admission
transition у погодженій authority з доведеним linearization point. Вона встановлює
незмінний зв'язок operation, attempt, policy, lifetime anchor, dependency state та
prepared write-set. Необхідні authoritative dependency reads і підготовка write-set
передують transition; їхня validity на `d_i` потребує окремого fencing/ordering proof.
Після decision не можна змінювати policy чи bindings без нового admission.
Подальший business database commit є окремою подією `c` і може чекати.

Першість визначає linearizable order законних durable transitions для original `O`.
Найраніша volatile application-level перевірка без durable transition не визначає
`t0`. HTTP/transaction start, локальний timestamp, browser readiness, dispatch,
backend response, historical receipt або CAS без доказу validity не є admission.
Durability чи database timestamp самі не доводять законність transition.

Interval має доведено охоплювати саме `d_i`; time check до durable transition не
доводить expiry predicate на її linearization point. Clock authority та механізм
цього доказу OPEN (PO-01/PO-02). Firestore, CAS або інша database не оголошуються
такими, що вже забезпечують ці гарантії. Business abort після valid admission
не дає session authority та не переносить decision на наступну attempt, але
не скасовує вже зафіксований original anchor.

## Temporal invariants для запропонованої Policy B

**[DESIGN ASSUMPTION]** Наступні TI є вимогами до майбутнього дизайну, а не runtime
дозволами. Вони застосовуються сукупно.

1. **TI-01:** кожна attempt має власне `d_i` та fresh trusted interval:
   `grant.issuedAt <= L_i <= d_i <= U_i`, `U_i < Eg`, `U_i < C`.
   Transition на або після grant expiry недопустима. Невідомі/недостовірні bounds
   або uncertainty, що досягає expiry, означають deny, навіть за успішного precheck.
2. **TI-02:** equality на expiry означає deny. Немає `Eg + grace`, permissive skew
   або TTL extension. Grant lifecycle/revision, provenance, current user/version
   і погоджений revocation fence перевіряються на цій attempt.
3. **TI-03:** `c >= Eg` може завершувати лише ту саму `O` після законного `d` та
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
bindings, чинну durable admission transition саме committed attempt з незмінним
decision/attempt/write-set binding, незмінний trusted anchor,
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

**[DESIGN ASSUMPTION]** Для першої valid durable transition attempt `j` original
`O` decision та original anchor мають атомарний незмінний зв'язок. Anchor
призначається рівно один раз за linearizable order, включно з випадком, коли
business transaction цієї attempt потім abort:

```text
t0 = L_j
session.issuedAt = t0
Es = min(t0 + 900000, C)
```

`L_j` є conservative нижньою межею trusted interval, що доведено охоплює `d_j`.
Browser time, token `iat`, dispatch/response time, `commandCreatedAt` orchestration
clock чи historical lookup time не підміняють його. Це owner-approved семантика,
а не вибраний чи доведений clock/backend mechanism. Durable-first anchor може
бути пізнішим за anchor найранішої volatile перевірки: це явна погоджена зміна
семантики початку lifetime; session TTL та upstream cap залишаються незмінними.

```typescript
sessionIssuedAt = t0;
sessionExpiresAt = Math.min(
  sessionIssuedAt + 900000,
  authenticationExpiresAt
);
```

Тут `authenticationExpiresAt = C` із verified effective lineage. Arithmetic має
залишатися валідним; cap не збільшується під час renewal. Усі retries отримують той
самий anchor, але проходять fresh admission та current dependency checks. Retry
не збільшує `t0`, `Es` або pinned `C`. Business abort не скасовує durable anchor;
crash, restart, failover та UNKNOWN не дозволяють його перепризначити. Commit delay
скорочує доступний lifetime. Recovery не створює нової session та не переобчислює
expiresAt. Admission record сам по собі не є session, business receipt чи credential.

**[NOT IMPLEMENTED]** У чинному RecoveryDescriptor немає reviewed реалізації
durable ownership/restoration цього anchor. Доказ джерела `L_j`, immutable fixation
при concurrent first admissions, зв'язування з `O`, збереження при abort та restoration
після restart — **OPEN PROOF OBLIGATION PO-04**, разом із PO-01/PO-08/PO-12.
Цей ADR не додає поля до Wire v1. Якщо anchor не можна безпечно відновити, дозволений
лише погоджений fail-closed recovery; новий anchor або mutation не дозволені.

## Late commits та часові обмеження

**[DOCUMENTED]** Власник умовно погодив historical session record, створений або
завершений після `Es` або `C`, лише як inert, неактивний і невикористовуваний запис
за наявності доказу відсутності credential release/use authority та обходу revocation.
Це не дозвіл створювати usable expired sessions, late credential release/use або
автоматичний replacement. Фактичний допустимий commit protocol та його proof
залишаються OPEN у PO-10/PO-14; runtime approval не надано.

**[BLOCKED]** Не доведено числову верхню межу `c - d`, commit cancellation або
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

**[DESIGN ASSUMPTION]** Durable admission не резервує authorization та не дозволяє відновити відкликані
права. Точні revocation effectiveness boundary, порядок dependency revision checks,
pending-issuance fencing, race revocation/business commit, release/use checks та
гарантії inert late records OPEN (PO-05/PO-06/PO-10/PO-14). Revocation proof не завершено.
Потрібні окремі гарантії, не просто ще один reread:

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
| Revocation між d і c | Late commit не відновлює доступ; або transaction conflict/retry/deny, або доведений fence робить record непридатним |
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

Дві concurrent attempts original `O` мають одну original anchor assignment за
першої valid durable transition; без такої transition assignment немає.
Програвша attempt не обирає новий `t0`. UNKNOWN response durable admission transition
вимагає authoritative lookup admission/anchor state, навіть коли business receipt
відсутній. Невідома generation не вгадується, не скидається та не замінюється новою.
Definitive business abort дозволяє лише окремо законну fresh attempt із тим самим
anchor та current checks; він не скасовує durable admission history. UNKNOWN не
доводить abort і залишає лише lookup-only recovery. Повторна mutation не є
універсальним fallback; recreate/replacement/re-anchor і timeout-based rollback заборонені.

Recovery descriptors, uniqueness/replay markers, unresolved intents, revocation
tombstones та anchor evidence зберігаються до доведеного safe GC condition.
Cleanup має врахувати всі ще можливі in-flight completions, retries і restart,
а не лише час останнього lookup. Якщо finite bound або fence не доведений,
time-based deletion не схвалюється; потрібні fail-closed capacity limits і
доказ capacity/availability handling. Якщо safe cleanup unresolved evidence не
доведений, система залишається fail-closed навіть ціною capacity/availability.
Cleanup/tombstone не може знищити необхідні proof або fencing unresolved operation.
Числового retention period цей ADR не встановлює.

## Compatibility та незмінність чинного контракту

**[DOCUMENTED]** У цьому slice незмінними залишаються:

- `STRICT_COMMIT_TIME` для `ACCEPT_ASSERTION` і чинна вимога для `ISSUE_SESSION`;
- remote gate BLOCKED, TTL, Wire v1 та exact command-digest framing;
- [LoginOrchestrator](../../src/admin/web/authentication/login-orchestrator.ts),
  [PermissionService](../../src/security/permission-service.ts), production authorization;
- ADMIN entrypoints/RPC allowlist, manifests/build configuration;
- [Safe Grant Renewal contracts](../../src/admin/web/authentication/renewal-contracts.ts).

**[DOCUMENTED]** Окремий versioned authoritative sidecar є owner-approved напрямком
проєктування зі збереженням Wire v1 за умови майбутнього compatibility/security review.
Це не схвалення чинного data-only sidecar як authoritative evidence.

**[DESIGN ASSUMPTION]** Для sidecar-напрямку майбутня зміна потребує Gate B: явних version/profile,
authenticated ownership, незмінних operation/attempt/policy/anchor/dependency/write-set
bindings, trusted readers та окремого доказу Wire v1 compatibility. Чинний command
digest не охоплює автоматично нові sidecar fields. Старі receipts не стають admission
evidence. Значення `backendDecisionAt`, `consumedAt` та `databaseCommittedAt` не
змінюються; admission не підставляється в ці fields. Новий evidence protocol surface,
якщо потрібний, вимагає окремого owner decision. Старий boolean, enum cast, JSON DTO
або readiness result не може ввімкнути B чи відкрити gate. Не можна мовчки записати admission time
як нібито відомий actual commit time. Wire v1 можна зберегти лише після доказу
сумісності; непогоджені fields/fallback у v1 не додаються.

**[NOT IMPLEMENTED]** Чинні [temporal attempt contracts](../../src/admin/web/identity-contracts/temporal-attempt-contracts.ts)
та [anchored planner](../../src/admin/web/identity-contracts/anchored-session-planner.ts)
описують лише локальні data invariants. `VALID_DATA`, `ADMITTED`, `COMMITTED`,
`PLAN_CANDIDATE`, owner/generation IDs та claimed write-set digest не доводять
clock provenance, durable transition/order, authenticated ownership або approval.
`LifetimeAnchorData` допускає `t0Ms <= originClock.earliestMs`, тоді як цільова
семантика вимагає `t0 = L_j`: mapping/equality та proof першої durable transition
залишаються OPEN у PO-04/PO-12. Planner працює з `PREPARED` data і відхиляє
`clock.latestMs >= Es`; він не є протоколом late historical commit. Узгодження
цього розділення OPEN у PO-02/PO-10/PO-14. Чинні contracts тут не змінюються.
Чинний [lifecycle planner](../../src/admin/web/identity-contracts/lifecycle.ts)
використовує `now` для `issuedAt`/`consumedAt`; цей scalar не оголошується `L_j`
чи admission evidence. Майбутнє mapping до durable-first semantics OPEN у PO-04/PO-12
без reinterpretation чинних fields.

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
| B — Contract Evolution Approval | Окремі рішення щодо evidence protocol/versioning, compatibility/security та revocation/commit semantics; owner direction їх не замінює | BLOCKED BY MISSING DECISION |
| C — Backend Adapter Evidence | Reviewed clock/store/coordinator/revocation/recovery evidence | NOT OPENED; BLOCKED, implementation/evidence відсутні |
| D — Integration Acceptance | Негативні integration tests, runtime provenance, bundle guards, deployment readiness | NOT OPENED; BLOCKED, acceptance відсутній |
| E — Production Authorization | Окреме рішення власника системи | NOT OPENED; BLOCKED, authorization відсутній |

**[BLOCKED]** PO-11 щодо ACCEPT_ASSERTION не обходиться проходженням A–D для
ISSUE_SESSION. Gate E не замінює невиконані security proofs. Повний каталог,
статуси та 20 acceptance scenarios:
[Temporal Admission Proof Obligations](../ADMIN_WEB_TEMPORAL_ADMISSION_PROOF_OBLIGATIONS.md).

## Відкриті питання перед наступними gates

**[BLOCKED]** Не вибрані й не доведені: authoritative clock profile; атомарне
закріплення/restoration `t0`; distributed grant/family ownership; revocation та
directory/execution ordering; safe retention/GC; proof інертності умовно погоджених
late records та допустимий commit protocol; policy/schema/sidecar compatibility;
mapping локальних data-only contracts; незалежний strict ACCEPT_ASSERTION mechanism.
Кожен із них має відповідний PO; жоден не закритий сукупним числом локальних tests.

**[DOCUMENTED]** Супровідні чинні документи:
[durable contracts](../ADMIN_WEB_DURABLE_STORE_CONTRACTS.md),
[local authentication](../ADMIN_WEB_LOCAL_AUTHENTICATION.md),
[identity contracts](../ADMIN_WEB_IDENTITY_CONTRACTS.md),
[channel Wire v1](../ADMIN_WEB_CHANNEL_WIRE_CONTRACTS.md),
[safe renewal](../ADMIN_WEB_SAFE_GRANT_RENEWAL.md).
