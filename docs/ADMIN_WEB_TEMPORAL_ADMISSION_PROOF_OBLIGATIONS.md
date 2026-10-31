# Temporal Admission — Proof Obligations / (Каталог необхідних доказів)

## Status and scope

**[DOCUMENTED]** Статус: **PROPOSED**. Slice 2C.3B.7, дата 2026-10-27.
Супровідний документ до
[ADR-049 — Temporal Admission for ISSUE_SESSION](<adr/ADR-049 — Temporal Admission for ISSUE_SESSION.md>).
Baseline: `feature/bom-logic`, HEAD
`d6256e4f56d14650a51e124813066309ef5691f1`, clean working tree та empty staging
до документаційних additions. Власник погодив design direction, а не runtime policy.

**[DOCUMENTED]** Cross-reference Slice 2C.3C.5:
[ADR-050 — Backend Sessions and Check-Time Continuation](<adr/ADR-050 — Backend Sessions and Check-Time Continuation.md>)
описує окремий owner-approved B/D2 design зі статусом ACCEPTED. Його check-time policy
не є доказом legacy strict temporal properties. PO-01–PO-14 тут залишаються OPEN,
не PASS/N/A; runtime STRICT_COMMIT_TIME, Gate B і remote admission BLOCKED незмінні.

**[DOCUMENTED]** Amendment Slice 2C.3B.10a, дата 2026-10-29. Baseline amendment:
`feature/bom-logic`, HEAD `930c19fc558f41de0cbab3c6474427955dc87f43`, clean working
tree та empty staging. Попередній baseline є історією створення документів.
Owner-selected модель B — **First Durably Admitted Operation**: first valid durable
transition визначає single-assignment `t0 = L_j`; погоджено fail-closed recovery,
умовні inert historical records та проєктування versioned authoritative sidecar.
Це owner-approved нормативний напрямок; amendment залишається PROPOSED, backend
implementation недоведена. Gate B — **BLOCKED BY MISSING DECISION**, Gate C–E
не відкриті. Цей amendment не завершує Gate B та не закриває жоден PO-01–PO-14.

| Surface | Чинна policy / стан | Scope цього дизайну |
| --- | --- | --- |
| ACCEPT_ASSERTION | STRICT_COMMIT_TIME | Незмінний незалежний blocker PO-11 |
| ISSUE_SESSION | STRICT_COMMIT_TIME до окремого approval | STRICT_BACKEND_ADMISSION, тільки проєктування |
| Protected ERP RPC | Чинні PermissionService/current authorization checks | Без зміни; execution consistency потребує proof |
| Remote durable admission | BLOCKED | Жодного positive gate path не додається |

**[DOCUMENTED]** PRODUCTION — NO-GO. ADMIN deployment — NO-GO.
TEST_RESET execution — NO-GO. Немає дозволу на runtime implementation,
integration, dependency installation, deployment або зміну контрактів.

## Evidence levels

**[DOCUMENTED]** Кожне твердження має evidence level. Явна мітка на початку
абзацу/розділу поширюється на його список, формули й таблиці до наступної мітки.
У PO вимоги, threats, required evidence, negative tests та acceptance criteria
успадковують `DESIGN ASSUMPTION`; наявний стан класифікується окремо у полях
Current status/Authoritative source. Посилання на джерело вимоги не є доказом її
remote реалізації. Evidence levels не є approval gates і не замінюють один одного.

| Level | Точне значення |
| --- | --- |
| DOCUMENTED | Є чинний текст контракту, vendor documentation, code definition або явно зафіксоване рішення власника; implementation guarantee із цього не випливає |
| DEMONSTRATED BY LOCAL TEST | Конкретна поведінка показана в локальному fixture/reference-model test; scope обмежений цим model і schedule |
| DEMONSTRATED BY INTEGRATION TEST | Є відтворюваний test конкретного adapter/backend/version/configuration; результат не поширюється на неперевірені clocks, deployments чи failure models |
| DESIGN ASSUMPTION | Запропонована вимога, кандидат механізму або припущення; його ще потрібно погодити та довести |
| NOT IMPLEMENTED | Потрібний runtime mechanism/adapter/evidence path відсутній; interface або синтетичний factory його не замінює |
| BLOCKED | Відсутній необхідний proof/approval/dependency; integration/activation заборонені |

**[DOCUMENTED]** Кожен PO зараз OPEN для майбутньої remote integration. Немає
PO, закритого самим цим документом. Closure вимагає конкретних mechanism/version,
scope, authoritative source, відтворюваних artifacts/results, аналізу failure model,
незалежного review та рішення відповідного gate. Passing integration tests є
необхідною частиною evidence, але не доводить неперевірену абсолютну time bound.

## Model and invariants

**[DESIGN ASSUMPTION]** Терміни та TI-01–TI-10 мають значення з ADR-049.
Для attempt `i` fresh interval `[L_i, U_i]` має обмежувати authoritative decision
на linearization point `d_i` законної durable admission transition у погодженій
authority; для commit-winning attempt `k`: `d = d_k`, `c` — actual business commit,
`Eg` — grant expiry, `Es` — session expiry, `C` — effective upstream cap.

```text
grant.issuedAt <= L_i <= d_i <= U_i
U_i < Eg
U_i < C
j = first valid durable transition in the linearizable order for original O
t0 = L_j
session.issuedAt = t0
Es = min(t0 + 900000, C)
```

Немає expiry grace. Equality на expiry означає deny. Кожен retry має новий
durable admission decision та current dependency checks; незмінний `t0` не є
перенесеним admission permission. Interval має доведено охоплювати саме transition,
а не попередній time check; недостовірні bounds означають deny. Transition на або
після Eg недопустима. Clock authority/proof OPEN; database timestamp чи CAS самі
не доводять validity. Decision незмінно зв'язує operation, attempt, policy, anchor,
dependency state та prepared write-set. Фізичний порядок volatile prechecks не
визначає first admission. Durable-first anchor може почати lifetime пізніше за
найраніший volatile check; це погоджена зміна семантики без зміни TTL чи pinned C.
Late `c >= Eg` може завершувати лише ту саму допущену ISSUE_SESSION operation.
Доказ CreationOK не заміняє current UseOK, а UseOK не легалізує незаконне issuance.
Admission не є HTTP/transaction start, browser readiness, issuance, dispatch,
historical receipt або commit response.
Локальний timestamp, backend response та CAS без validity proof також не є admission.
Admission record сам по собі не є session, business receipt або credential.

**[DESIGN ASSUMPTION]** `CreationOK_B` охоплює provenance/bindings, valid final
attempt durable admission із decision/attempt/write-set binding, immutable anchor,
atomic one-time grant consumption, session
та receipt і погоджене revocation/directory ordering. `UseOK` додатково вимагає
чинного bearer/digest binding, authoritative current session, session/upstream
time validity, no revocation, current active user/version/key provenance і
конкретного permission на погодженій execution boundary. Немає proof із JSON shape,
ready flag або historical receipt. Raw credential не зберігається в receipt/descriptor.

**[DESIGN ASSUMPTION]** Threat model включає replay, concurrent workers, delays,
transaction retries, crash/restart, stale reads, rollback/skew, втрату responses,
descriptor loss та cleanup races. Mechanism має назвати trusted authorities та
відмовляти при порушенні припущень. Local private fields не автентифікують malicious
server DI або зовнішнє сховище; вони не є distributed fencing.

## Current evidence inventory

**[DOCUMENTED]** Джерела чинних вимог та implementation boundaries:

| Джерело | Що саме документує |
| --- | --- |
| [Durable requirements/gate](../src/admin/web/identity-contracts/durable-store-contracts.ts) | expiryAtCommit STRICT; clock/restoration/directory requirements; unconditional BLOCKED gate |
| [Atomic store contracts](../src/admin/web/identity-contracts/atomic-store-contracts.ts) | GrantRecord, ConsumeGrantCommand, atomic transitions і receipt reader ports |
| [Lifecycle](../src/admin/web/identity-contracts/lifecycle.ts) / [validation](../src/admin/web/identity-contracts/validation.ts) | Session lifetime formula, context/lifetime/current-user checks |
| [Session store](../src/admin/web/identity-contracts/session-store-contracts.ts) | StoredSession, revocation/revision, authoritative session capability requirement |
| [Operation contracts](../src/admin/web/operation-contracts.ts) | Exact ID/digest/context bindings, RecoveryDescriptor, save-before-dispatch coordinator requirement |
| [Temporal attempt contracts](../src/admin/web/identity-contracts/temporal-attempt-contracts.ts) / [anchored planner](../src/admin/web/identity-contracts/anchored-session-planner.ts) | LOCAL DATA ONLY: claimed clock/anchor/attempt/dependency/write-set data та arithmetic candidate; жодної trusted durable admission authority |
| [Wire contracts](../src/admin/web/channel-contracts/contracts.ts) / [recovery](../src/admin/web/channel-contracts/recovery.ts) | Wire v1, time facts, lookup-only, receipt binding; unavailable commit time не вигадується |
| [Session resolver](../src/admin/web/authentication/session-resolver.ts) / [authorization adapter](../src/admin/web/authentication/authorization-adapter.ts) | Current session/user/key checks, повторний PermissionService decision; не lock для ERP mutation |
| [PermissionService](../src/security/permission-service.ts) / [UserRepository implementation](../src/security/property-user-repository.ts) | Поточна permission authority; Script Properties не мають спільної transaction з Firestore |
| [Signing-key policy](../src/admin/web/identity-contracts/signing-key-policy.ts) | New-verification rules проти session provenance; planned retirement відрізняється від compromise |
| [Renewal contracts](../src/admin/web/authentication/renewal-contracts.ts) / [reference model](../src/admin/web/authentication/renewal-reference-model.ts) | Локальні family budgets, private capabilities, guard і recovery state machine |
| [Remote composition](../src/admin/web/authentication/composition.ts) | Remote login/recovery BLOCKED, authorization DENIED незалежно від injected claims |

**[DEMONSTRATED BY LOCAL TEST]** На accepted checkpoint попередній review виконав
2088 PASS, включно з
[atomic tests](../src/admin/web/identity-contracts/atomic-store-contracts.test.ts),
[durable tests](../src/admin/web/identity-contracts/durable-store-contracts.test.ts),
[authentication tests](../src/admin/web/authentication/authentication.test.ts),
[channel tests](../src/admin/web/channel-contracts/channel-contracts.test.ts) і
[renewal tests](../src/admin/web/authentication/renewal-reference-model.test.ts).
Це історичний результат локальної перевірки, не новий запуск у Slice 2C.3B.7.
Він не доводить real crypto, authoritative clock, distributed ownership/fencing,
Firestore durability, cross-authority consistency або STRICT_COMMIT_TIME.

**[NOT IMPLEMENTED]** Reviewed remote clock/restoration/coordinator/fencing та
позитивний durable-admission evidence issuer відсутні. Для майбутньої Policy B
немає evidence рівня `DEMONSTRATED BY INTEGRATION TEST`; acceptance scenarios нижче
не оголошуються виконаними.

**[DOCUMENTED]** Contract gaps залишаються OPEN: `LifetimeAnchorData` допускає
`t0Ms <= originClock.earliestMs`, а amendment вимагає `t0 = L_j` першої valid
durable transition (PO-04/PO-12). Planner приймає тільки `PREPARED` data та відхиляє
`clock.latestMs >= Es`; це не proof authoritative admission чи late historical
commit (PO-02/PO-10/PO-14). `VALID_DATA`, `ADMITTED`, `COMMITTED`, `PLAN_CANDIDATE`,
claimed owner/generation і digest не автентифікують джерело або linearization order.
Runtime `expiryAtCommit: STRICT` зберігається; цільовий durable-first protocol не
впроваджений і не отримує approval через data validators.
Чинний `lifecycle.planGrantRedemption` задає `issuedAt`/`consumedAt` через `now`;
це не `L_j` або admission proof. Mapping до нового anchor без reinterpretation
чинних fields також OPEN у PO-04/PO-12.

## Proof obligations

**[DESIGN ASSUMPTION]** Кожна таблиця є повною карткою PO. Authoritative source
розрізняє потрібну реальну authority і наявне джерело контрактної вимоги.
Вибір кандидата механізму не закриває obligation. SC-01–SC-20 визначені нижче.

### PO-01 — Trusted Admission Clock

| Field | Obligation |
| --- | --- |
| ProofID | PO-01 |
| Security property | Provenance, freshness, conservative uncertainty, rollback/skew та restart safety; interval доведено охоплює durable admission linearization point d_i, окремо use boundary |
| Threat або failure scenario | Cached time до awaited reads; precheck до Eg, durable transition на/після Eg; повільний callback, rollback/skew, restart скидає high-water |
| Required mechanism | Reviewed clock profile з authenticated source, bounds та health/failure behavior; доказ grant.issuedAt <= L_i <= d_i <= U_i, U_i < Eg і U_i < C саме для durable transition; authority/proof ще не вибрані |
| Authoritative source | Потрібна trusted server/backend time authority — NOT IMPLEMENTED. DOCUMENTED requirements: DurableAdmissionRequirements, TrustedClockInterval; scalar/interval DTO не є authority |
| Evidence required | Source/clock provenance; error/freshness model і coverage linearization point; worker/restart behavior; fail-closed review; integration fault traces; timestamp/CAS самі не evidence validity |
| Negative tests | SC-03, SC-04, SC-10; boundary equality, wide uncertainty, stale observation, затримка після sample, unavailable clock |
| Current status | OPEN; local interval/high-water behavior DEMONSTRATED BY LOCAL TEST; remote authority NOT IMPLEMENTED; integration BLOCKED |
| Blocking dependency | Clock source/profile approval; observation-to-boundary freshness; PO-08 restoration |
| Acceptance criterion | Незалежний review підтвердив coverage d_i, а не лише application check; equality expiry, недостовірні bounds, rollback/unavailability deny; локальний high-water не використано як distributed proof |

### PO-02 — Transaction Attempt Freshness

| Field | Obligation |
| --- | --- |
| ProofID | PO-02 |
| Security property | Власна fresh authoritative durable admission кожної attempt; committed attempt незмінно зв'язана з відповідним durable decision та prepared write-set |
| Threat або failure scenario | SDK reruns callback після expiry; old policy/time/READY з попередньої attempt використано повторно |
| Required mechanism | Reviewed retry protocol: authoritative reads, current dependency checks та immutable write-set preparation повторюються для кожної нової attempt; кожна attempt має власну valid durable admission transition з attempt-specific clock proof; callback replay не переносить старий decision. No external side effects may execute inside a transaction callback that can be retried. Callback replay must not duplicate external effects. |
| Authoritative source | Потрібні actual transaction attempt lifecycle і record authority. DOCUMENTED candidate behavior: [Firestore transactions](https://firebase.google.com/docs/firestore/manage-data/transactions); adapter відсутній |
| Evidence required | Retry/control-flow review, attempt-specific observations і immutable operation/policy/anchor/dependency/write-set bindings; conflict injection; trace durable decision саме committed attempt та rejected attempts |
| Negative tests | SC-02–SC-04; expiry під час policy read; key/user/fence change перед retry; stale cached interval |
| Current status | OPEN; remote retry mechanism NOT IMPLEMENTED; integration BLOCKED |
| Blocking dependency | PO-01, PO-03; reviewed SDK/backend/version and retry behavior |
| Acceptance criterion | Жодна retry attempt без власної valid durable transition не може commit; transition на/після expiry deny; committed write-set відповідає decision; старий t0 та precheck не є admission permission |

**[DESIGN ASSUMPTION]** Business transaction callback, який може повторно запускатися,
та окрема authoritative durable admission/anchor transition мають різні boundaries.
Admission/anchor transition має власну linearization boundary, independent authoritative
ordering, explicit operation/attempt binding, single-assignment original anchor,
durable recovery, UNKNOWN lookup-only та ownership/generation fencing; credential
release відсутній. Ці вимоги залишаються OPEN у PO-02, PO-04, PO-07. Admission/anchor
writes не мають винятку із заборони external side effects і не дозволені всередині
retried business callback. Якщо майбутній backend не забезпечує доведено безпечного
відокремлення цих операцій, питання залишається OPEN, виконання — fail-closed.

### PO-03 — Atomic One-Time Grant Consumption

| Field | Obligation |
| --- | --- |
| ProofID | PO-03 |
| Security property | Один grant створює максимум одну session; consume + session + durable receipt атомарні |
| Threat або failure scenario | Два workers redeem одночасно; partial write, duplicate receipt, різні credentials для одного grant |
| Required mechanism | Reviewed durable CAS/revision/uniqueness protocol в одній atomic authority; незмінна operation binding; conflict/replay handling |
| Authoritative source | Потрібна authoritative grant/session/receipt store з ownership proof. DOCUMENTED requirements: AtomicLoginStorePort, GrantRecord; reference-model maps не є такою store |
| Evidence required | Transaction/read-write-set review; invariant argument; two-worker integration tests; injected failures на кожному write/commit boundary |
| Negative tests | SC-06, SC-11, SC-20; rollback між writes; one grant із двома operation IDs; invalid revision/context |
| Current status | OPEN; fixture atomicity/one-time behavior DEMONSTRATED BY LOCAL TEST; remote implementation NOT IMPLEMENTED; integration BLOCKED |
| Blocking dependency | Reviewed store/ownership PO-08, retry PO-02, revocation participation PO-05, compatibility PO-12 |
| Acceptance criterion | У всіх перевірених conflict/failure schedules немає partial success або більше однієї session; receipt точно відповідає єдиному committed business transition; durable admission не замінює atomic consumption і не створює session/receipt/credential; vendor atomicity сама не закриває proof |

### PO-04 — Immutable Lifetime Anchor

| Field | Obligation |
| --- | --- |
| ProofID | PO-04 |
| Security property | Single-assignment t0=L_j першої valid durable transition original O; session.issuedAt=t0, Es=min(t0+900000,C), no re-anchoring |
| Threat або failure scenario | Retry/reset/restart пересуває issuedAt; два workers вибирають різні first anchors; втрачений anchor замінено response/lookup time |
| Required mechanism | Linearizable ordering законних durable transitions; атомарний незмінний decision-anchor linkage і рівно одна original assignment; binding operation/attempt/policy/dependencies/write-set; persistence після business abort та authoritative restoration original t0; конкретний механізм OPEN |
| Authoritative source | Потрібна trusted time authority PO-01 і owner-bound operation/anchor authority PO-08. DOCUMENTED current formula: lifecycle.ts; чинний descriptor не доводить збереження t0 |
| Evidence required | Proof першої valid durable transition j і coverage d_j; t0=L_j, single assignment при concurrency; durability/abort/crash/failover/restart/UNKNOWN protocol; mapping data-only t0Ms<=originClock.earliestMs до цільової equality; binding/tamper review та integration traces |
| Negative tests | SC-02, SC-04, SC-05, SC-06, SC-09, SC-15; first precheck без transition; concurrent durable transitions; business abort після assignment; UNKNOWN response; forged/missing/later anchor; arithmetic overflow |
| Current status | OPEN; t0=L_j є DOCUMENTED owner-selected direction; durable fixation/restoration NOT IMPLEMENTED; integration BLOCKED |
| Blocking dependency | PO-01, PO-08, PO-12; reviewed authority/order та atomic decision-anchor linkage |
| Acceptance criterion | Дві concurrent attempts мають одну original assignment за linearizable order; precheck без durable transition не визначає t0; abort не скасовує anchor; retries/recovery не збільшують t0/Es/pinned C; missing/uncertain anchor fail closed без new mutation чи positive release |

### PO-05 — Revocation Fencing

| Field | Obligation |
| --- | --- |
| ProofID | PO-05 |
| Security property | Late commit не відновлює відкликаний доступ, включно з pending issuance та logout-all |
| Threat або failure scenario | Revoke стався між d і c; session ще відсутня, тому logout пропускає її; stale writer затирає tombstone/epoch; admission помилково резервує authorization |
| Required mechanism | Approved revision/epoch/tombstone/fencing або еквівалент із доведеним ordering; pending issuance входить у scope; grant revocation лише за окремо погодженим lifecycle |
| Authoritative source | Потрібні authoritative session/subject/key revocation records. DOCUMENTED current session revocation/signing policy; єдину cross-authority revocation model не реалізовано |
| Evidence required | OPEN: точна revocation effectiveness boundary, dependency revision check ordering, pending-issuance fencing, revocation/business commit race, current release/use checks та inert-record guarantees; tombstone persistence/GC argument і two-worker race traces |
| Negative tests | SC-07, SC-18, SC-19; logout-all перед видимістю session; epoch/version ABA/reset; revoke під час retry; planned retirement окремо від compromise |
| Current status | OPEN; local revoked/compromised rejection DEMONSTRATED BY LOCAL TEST; durable fencing NOT IMPLEMENTED; integration BLOCKED |
| Blocking dependency | Вибір authorities/ordering; PO-03, PO-06, PO-08, PO-13 |
| Acceptance criterion | Late writer не може відновити заборонений use; нова operation після effective revoke не проходить boundary; доля раніше admitted in-flight effects явно погоджена; reread не видано за fence |

### PO-06 — Directory/Authorization Consistency

| Field | Obligation |
| --- | --- |
| ProofID | PO-06 |
| Security property | Current active user, matching authorizationVersion і current permission діють на погодженій protected-operation execution boundary |
| Threat або failure scenario | User disable/version/permission change між reads, issuance і фактичним ERP mutation; stale roles або reused version |
| Required mechanism | Окремо approved consistency/authority та dependency/directory version ordering на durable admission і execution boundaries; CAS/epoch/fence або еквівалент; current PermissionService checks зберігаються; admission не резервує authorization |
| Authoritative source | DOCUMENTED current authority: UserRepository/PropertyUserRepository/PermissionService. Спільної atomic transaction Script Properties + Firestore немає; майбутній bridge NOT IMPLEMENTED |
| Evidence required | Визначення admission/execution/effective-change boundaries; cross-authority protocol; policy для in-flight operations; review permission selection і current version binding |
| Negative tests | SC-08, SC-17; disable між awaits; role change після останнього reread; async decision не await; version rollback/ABA |
| Current status | OPEN; local current-user/permission checks DEMONSTRATED BY LOCAL TEST; distributed consistency NOT IMPLEMENTED; integration BLOCKED |
| Blocking dependency | Owner decision щодо authorities та in-flight effects; PO-05, PO-10 |
| Acceptance criterion | Зміна до погодженої execution boundary deny; AUTHORIZED не кешується як lease; зовнішній directory не оголошено частиною Firestore transaction; strict physical effects ordering не заявлено без proof |

### PO-07 — UNKNOWN Outcome Recovery

| Field | Obligation |
| --- | --- |
| ProofID | PO-07 |
| Security property | UNKNOWN durable admission або business outcome з'ясовується authoritative lookup-only; жодних recreate/replacement mutation/session, re-anchor або TTL extension |
| Threat або failure scenario | Commit succeeded/response lost; timeout чи missing receipt сприйнято як rollback; orphan session спричиняє нове issuance |
| Required mechanism | Durable immutable descriptor до dispatch; atomic business receipt; authenticated read-only lookup original admission/anchor та business outcome; distinct definitive-abort/UNKNOWN recovery; невідома generation fail closed |
| Authoritative source | Потрібні paired operation outcome/receipt authority і coordinator. DOCUMENTED requirements: RecoveryCoordinatorPort, AtomicLoginStorePort, recoveryAction, LoginOrchestrator |
| Evidence required | Save-before-dispatch durability; binding/ownership proof; crash/lost-response traces; no mutation/credential-generation dependency у recovery |
| Negative tests | SC-11, SC-12, SC-15, SC-20; rejected/unavailable lookup, stale completion, timeout з пізнім COMMITTED |
| Current status | OPEN; local lookup-only/no replacement DEMONSTRATED BY LOCAL TEST; remote coordinator/lookup NOT IMPLEMENTED; integration BLOCKED |
| Blocking dependency | PO-03, PO-04, PO-08, PO-13; response/reader provenance PO-12 |
| Acceptance criterion | UNKNOWN ніколи не стає unsent/retry permission; missing receipt не rollback; definitive business abort зберігає anchor, лише окремо законна fresh attempt можлива; generation не вгадується/скидається; original bindings незмінні; COMMITTED metadata не видає bearer; timeout не cancellation; повторна mutation не універсальний fallback |

### PO-08 — Durable Restoration & Ownership

| Field | Obligation |
| --- | --- |
| ProofID | PO-08 |
| Security property | Restart не втрачає ownership, original operation metadata, grant/session provenance або revocation/family fencing |
| Threat або failure scenario | DTO з іншого project/path/context відновлює capability; fabricated snapshot або stale revision; restart скидає owner/clock/anchor history |
| Required mechanism | Reviewed authenticated store/project/database/path ownership; independent expected bindings; paired closed readers; durable coordinator/anchor/fence та original generation restoration; malformed/missing/unknown generation fail closed без reset/recreate |
| Authoritative source | Потрібна незалежно встановлена deployment/store authority, не browser expectation. DOCUMENTED interfaces: GrantRestorationPort, RestoredGrantReaderPort, TrustedSessionReaderPort, RecoveryCoordinatorPort |
| Evidence required | Deployment/source ownership review; restore protocol/version; freshness/current record rechecks; independent binding provenance; multi-worker/restart integration traces |
| Negative tests | SC-09, SC-15; JSON/casts/foreign owner, wrong database/path/origin, stale revision, descriptor/anchor tamper |
| Current status | OPEN; local structural/owner rejection DEMONSTRATED BY LOCAL TEST; reviewed remote restoration NOT IMPLEMENTED; integration BLOCKED |
| Blocking dependency | Store/deployment authority selection, PO-01, PO-04, PO-05, PO-12 |
| Acceptance criterion | Лише paired reviewed authority створює runtime evidence після fresh current-state checks; copied DTO/snapshot/flags не відновлюють trust; missing restoration не дає fallback mutation |

### PO-09 — Safe Grant Renewal Integration

| Field | Obligation |
| --- | --- |
| ProofID | PO-09 |
| Security property | 3 grants / 2 renewals / 2 silent attempts; durable family ownership; abandonment тільки до possible dispatch |
| Threat або failure scenario | Інший worker/restart обнуляє budget; abandon і dispatch виграють одночасно; expired generation або UNKNOWN замінено новою |
| Required mechanism | Reviewed durable family/generation/rate ownership та atomic abandon/intent ordering; immutable identity/cap; accepted local model використовується лише як reference |
| Authoritative source | Потрібна authoritative family/rate/dispatch ledger. DOCUMENTED local contracts: RENEWAL_LIMITS, RenewalReferenceModel, GrantReadinessPolicy |
| Evidence required | Mapping local invariants до durable protocol; concurrency/restart proof; reviewed reserve policy без зміни TTL; no automatic fallback loop |
| Negative tests | SC-13, SC-14; четвертий grant, третя silent attempt, foreign/stale capability, concurrent abandon/dispatch, nested callback |
| Current status | OPEN; local budgets/reentrancy/final sampling DEMONSTRATED BY LOCAL TEST; distributed family fencing NOT IMPLEMENTED; integration BLOCKED |
| Blocking dependency | PO-03, PO-05, PO-07, PO-08; production minimum reserve approval |
| Acceptance criterion | Budgets не обходяться concurrency/restart; possible dispatch ніколи не стає unsent; unresolved operation/невідома generation не звільняє budget і не дозволяє renewal/replacement; original upstream cap не збільшується; reserve/5000 ms/local guard не оголошено commit-time або distributed proof |

### PO-10 — Credential Release & Protected RPC

| Field | Obligation |
| --- | --- |
| ProofID | PO-10 |
| Security property | Credential creation, release та use — окремі boundaries; positive release/use потребують CreationOK + current UseOK; admission record/historical receipt недостатні |
| Threat або failure scenario | Expired session до first use; live DTO із незаконним issuance; old receipt відновлює bearer; дозвіл перевірено до зміни permission |
| Required mechanism | Reviewed creation provenance і current authoritative session reader; bearer/digest binding; time/user/version/key/revocation checks; PermissionService на погодженій execution boundary |
| Authoritative source | Потрібні current session, directory, key і execution authorities. DOCUMENTED local SessionResolver, SessionAuthorizationAdapter, validateSessionUse, SessionRestorationRequirements |
| Evidence required | Credential-generation/release flow review; current-record provenance; no credential in logs/receipts; end-to-end denial при late completion; execution ordering proof |
| Negative tests | SC-05, SC-08, SC-12, SC-17, SC-18; record shape без CreationOK, forged bearer/digest, expired exact boundary, stale AUTHORIZED |
| Current status | OPEN; local release/use rejection DEMONSTRATED BY LOCAL TEST; runtime integration NOT IMPLEMENTED; BLOCKED |
| Blocking dependency | PO-01, PO-04, PO-05, PO-06, PO-08, PO-12, PO-14 |
| Acceptance criterion | Positive release або RPC неможливі без усіх актуальних checks; expired/revoked/disabled session deny; receipt не є credential; current checks не оголошено компенсацією будь-якого illegal commit |

### PO-11 — ACCEPT_ASSERTION Strict Boundary

| Field | Obligation |
| --- | --- |
| ProofID | PO-11 |
| Security property | STRICT_COMMIT_TIME для ACCEPT_ASSERTION не послаблюється; remote admission BLOCKED до вирішення незалежного blocker |
| Threat або failure scenario | B для ISSUE_SESSION непомітно застосовується до assertion/transaction acceptance; atomicity або server timestamp видається за strict expiry proof |
| Required mechanism | Збереження чинної policy/gate; у майбутньому окремо reviewed enforcement actual commit до застосовних assertion/transaction та інших чинних expiry |
| Authoritative source | DOCUMENTED: DurableAdmissionRequirements, requireDurableAdmissionGuarantees, durableAdmissionGate, remote composition, чинні identity/atomic contracts. Real strict temporal mechanism відсутній |
| Evidence required | Scope/guard audit; перед remote integration — окремий enforceability argument і backend-specific evidence strict boundary, не тільки local callback test |
| Negative tests | SC-16; forged supported/verified flags, B policy для ACCEPT_ASSERTION, equality expiry, pre-commit check з delayed physical commit |
| Current status | OPEN; unchanged strict requirement/gate DOCUMENTED і local fail-closed tests DEMONSTRATED BY LOCAL TEST; actual remote enforcement BLOCKED |
| Blocking dependency | Незалежний strict temporal design/evidence і review; PO-01/PO-08; B approval його не замінює |
| Acceptance criterion | У цьому slice A та gate незмінні; для integration late ACCEPT_ASSERTION не може бути легалізований B або session UseOK; невирішений strict proof зберігає remote BLOCKED |

### PO-12 — Wire/Contract Version Compatibility

| Field | Obligation |
| --- | --- |
| ProofID | PO-12 |
| Security property | Нова policy/evidence semantics явна, authenticated та version-compatible; старі DTO/booleans не активують B |
| Threat або failure scenario | Admission названо commit; consumedAt мовчки змінює значення; JSON/cast відкриває gate; нові fields змінюють digest або обходять old readers |
| Required mechanism | Gate B compatibility/security review; для дозволеного authoritative sidecar-напрямку — явні version/profile, authenticated ownership і immutable operation/attempt/policy/anchor/dependency/write-set bindings; exact command framing та closed issuer/reader; Wire v1 лише з окремим compatibility proof; новий evidence protocol surface потребує окремого owner decision |
| Authoritative source | DOCUMENTED: Wire v1/OperationBinding/RemoteOperationTimes, OPERATION_PROFILE, durable/session schema та paired readers. Майбутня policy evidence schema NOT IMPLEMENTED |
| Evidence required | Field/semantic diff, digest vectors, reader/version rejection tests; authenticated sidecar ownership/binding proof, бо чинний command digest автоматично не охоплює нові fields; старі receipts не стають admission evidence; no boolean/enum-cast trust path |
| Negative tests | SC-20; unknown version, altered body/bindings/anchors, old reader accepting B, fabricated actual commit time, extra DTO fields |
| Current status | OPEN; current Wire v1/contracts DOCUMENTED; B contract evolution NOT IMPLEMENTED; approval/integration BLOCKED |
| Blocking dependency | Gate B — BLOCKED BY MISSING DECISION; PO-04, PO-08, PO-14; sidecar authority/schema, compatibility/security та можливий evidence protocol decision |
| Acceptance criterion | Wire v1 і значення backendDecisionAt/consumedAt/databaseCommittedAt незмінні; old receipts не reinterpret як admission; future readers відкидають непогоджені semantics/versions; unavailable c не вигадується; data-only sidecar/flags не стають durable capability |

### PO-13 — Retention, Tombstones & Safe Cleanup

| Field | Obligation |
| --- | --- |
| ProofID | PO-13 |
| Security property | GC не видаляє докази/fences, поки старий in-flight operation ще може відновити state або вплинути на recovery |
| Threat або failure scenario | Receipt/descriptor/epoch/tombstone видалено за timeout, а старий worker пізніше commit; uniqueness namespace використано повторно |
| Required mechanism | Reviewed terminality/fencing-based safe GC condition для descriptors, anchors, intents, replay markers, receipts та tombstones; capacity limits і explicit availability policy |
| Authoritative source | Потрібні durable operation/fence lifecycle та backend cancellation/terminality evidence. DOCUMENTED interfaces мають retention/cleanup, але не доводять bound усіх in-flight completions |
| Evidence required | Retention inequalities/argument із доведених bounds або fence; GC concurrency proof; restart/partition behavior; quota exhaustion handling |
| Negative tests | SC-19, SC-11, SC-15; cleanup під час delayed commit/lookup; ABA/reused ID; expired receipt при unresolved operation |
| Current status | OPEN; safe distributed retention NOT IMPLEMENTED; numeric production period не вибрано; integration BLOCKED |
| Blocking dependency | PO-03, PO-05, PO-07, PO-08; terminality/cancellation evidence або equivalent safe fence |
| Acceptance criterion | Cleanup/tombstone не знищує proof/fencing unresolved operation; немає resurrection/replay/false rollback після GC; час останнього request не є єдиною підставою deletion; без safe cleanup proof система залишається fail-closed навіть ціною capacity/availability |

### PO-14 — Late Completion, Inert Records & Time Facts

| Field | Obligation |
| --- | --- |
| ProofID | PO-14 |
| Security property | Late commit не подовжує доступ; session після Es/C непридатна; admission і actual commit facts не підміняються |
| Threat або failure scenario | c>=Eg названо grace; c>=Es/C повертає чинний bearer; admission timestamp видано за actual commit; arbitrary deadline нібито cancel work |
| Required mechanism | Proof умовно погодженої inert late-record semantics: record, створений/завершений після Es або C, неактивний і невикористовуваний, без credential release/use authority чи обходу revocation; unchanged anchors; допустимий commit protocol OPEN; honest time metadata; deadline лише з independent proof |
| Authoritative source | DOCUMENTED owner conditional approval у Slice 2C.3B.10a та current receipt із c=UNAVAILABLE. Потрібні actual backend metadata коли доступні й current session/time/revocation authorities; runtime mechanism NOT IMPLEMENTED |
| Evidence required | Legal-origin/late-outcome model; no-extension та no-authority argument для inert records; revocation ordering proof; post-commit/release/first-use integration tests; honest known/unavailable c; compatibility/security review |
| Negative tests | SC-02, SC-05, SC-12; c рівно Eg/Es/C, delayed response, fabricated commit timestamp, release після expiry |
| Current status | OPEN; conditional inert-record direction DOCUMENTED, runtime approval відсутній; допустимий commit protocol/proof OPEN; mechanism NOT IMPLEMENTED; integration BLOCKED |
| Blocking dependency | PO-01, PO-04, PO-05, PO-07, PO-10, PO-12, PO-13; Gate A/B protocol та review decisions |
| Acceptance criterion | Затримка не збільшує lifetime; c>=Es або c>=C record допустимий лише з доведеною інертністю без release/use authority і обходу revocation; usable expired sessions, late credential release/use та replacement заборонені; timestamp facts не підмінені; жодного вигаданого latency bound |

**[DESIGN ASSUMPTION]** PO-13 виділено додатково, бо retention/GC можуть зруйнувати
одноразовість і revocation після завершення звичайних request timeouts. PO-14
виділено, бо legal late completion, inert records і правдивість time facts не
зводяться до поточних session checks або UNKNOWN lookup.

## Acceptance scenarios

**[DESIGN ASSUMPTION]** Це майбутні acceptance criteria, не виконані tests.
Колонка B означає запропонований outcome тільки після відповідних approvals/proofs;
поточний remote outcome усюди BLOCKED. Для ISSUE_SESSION зараз лишається A.
Передумова для кожного позитивного B outcome — усі CreationOK_B properties;
для доступу додатково UseOK. Не доведена передумова означає deny/BLOCKED,
а невідомий результат уже dispatched mutation — UNKNOWN з lookup-only.

| ScenarioID | Сценарій | Очікуваний результат Policy B або чинної A | Потрібний proof |
| --- | --- | --- | --- |
| SC-01 | Admission до Eg, commit до Eg | B: atomic creation можлива, use тільки за UseOK. A: тільки за доведеним actual commit predicate і рештою checks | PO-01, PO-02, PO-03, PO-04, PO-10, PO-12 |
| SC-02 | Admission до Eg, commit після Eg | B: continuation тієї самої O можливий без re-anchor; A: late success не дозволений | PO-01, PO-02, PO-03, PO-04, PO-14 |
| SC-03 | Admission після Eg або точно Eg | A/B: deny; старий READY/request timestamp не допомагає | PO-01, PO-02 |
| SC-04 | Retry після Eg | Нова attempt deny; попередній valid decision не переноситься; старий t0 не змінюється | PO-01, PO-02, PO-04 |
| SC-05 | Commit після Es/upstream C | B: owner умовно погодив лише доведено inert historical record, без credential authority чи обходу revocation; no positive release/use/replacement, commit protocol OPEN. A: strict expiry не послаблюється | PO-01, PO-04, PO-05, PO-10, PO-14 |
| SC-06 | Concurrent redemption двома workers | Одна original anchor assignment за першою valid durable transition; first precheck без transition не визначає t0; максимум одна session та atomic receipt; інший actor отримує bound prior outcome або conflict/replay | PO-01, PO-03, PO-04, PO-08, PO-12 |
| SC-07 | Revocation під час in-flight issuance | Late writer не відновлює доступ; transaction retry/deny або доведений fence робить record непридатним; pending/logout-all входять у scope | PO-03, PO-05, PO-13 |
| SC-08 | AuthorizationVersion change | Старій session deny; version не переписується в старому record; current permissions перевіряються окремо | PO-05, PO-06, PO-10 |
| SC-09 | Backend restart | Authoritative restoration original bindings/anchor/fences/generation; невідома generation не вгадується чи скидається; за відсутності evidence немає recreate/re-anchor чи mutation | PO-01, PO-04, PO-07, PO-08 |
| SC-10 | Clock rollback/skew | Недоведені bounds/freshness deny; restart не обнуляє часову довіру; uncertainty не додає grace | PO-01, PO-02, PO-08 |
| SC-11 | UNKNOWN durable admission або business commit outcome | Authoritative read-only lookup original admission/anchor та business outcome; missing business receipt не спростовує durable admission; timeout не rollback/replacement; definitive business abort не скасовує anchor | PO-03, PO-04, PO-07, PO-08, PO-13 |
| SC-12 | Orphan session | Historical outcome не видає bearer; без current UseOK доступу немає; автоматичне replacement issuance заборонене | PO-07, PO-10, PO-14 |
| SC-13 | Safe Grant Renewal до dispatch | Лише current unsent generation, authoritative abandonment та бюджети 3/2/2; нові bindings/IDs, той самий verified issuer/subject/cap | PO-03, PO-08, PO-09 |
| SC-14 | Renewal після possible dispatch | Заборонено; RECOVERY_REQUIRED не перетворюється на BEFORE_DISPATCH; stale permits/capabilities reject | PO-07, PO-09 |
| SC-15 | Втрата recovery descriptor | До dispatch — dispatch forbidden; після possible dispatch — unresolved/UNKNOWN, no replacement, no invented anchor або outcome | PO-04, PO-07, PO-08, PO-13 |
| SC-16 | ACCEPT_ASSERTION late commit | Чинна A: success має бути preventively excluded strict enforcement; якщо late commit фактично стався — policy violation, не легалізація B, remote залишається BLOCKED; автоматичний rollback не заявляється | PO-01, PO-11, PO-12 |
| SC-17 | Protected ERP mutation після зміни permission | Зміна до погодженої execution boundary deny; раніше admitted effects — лише за окремою явно погодженою policy; stale AUTHORIZED не є lease | PO-05, PO-06, PO-10 |
| SC-18 | Signing-key compromise | Відповідні issuance/use deny за current authoritative policy; planned retirement тестується окремо, не як compromise | PO-02, PO-05, PO-10 |
| SC-19 | Cleanup/retention race | Не видаляти потрібні markers/tombstones/anchors без safe terminality/fence; delayed writer не resurrect state; timeout не GC proof | PO-03, PO-05, PO-07, PO-13 |
| SC-20 | Повторний operation ID з іншим digest | Conflict/reject; original receipt/bindings не переписуються, друга session не створюється | PO-03, PO-07, PO-08, PO-12 |

**[DESIGN ASSUMPTION]** Для integration evidence кожен scenario повинен мати
fixture/setup, actual backend/SDK/version/configuration, ownership/time assumptions,
schedule/fault injection, observed result та invariant assertions. Позитивний
test не заміняє negative boundaries. Навмисне mutation/fault test проти реального
backend потребує окремо дозволеного isolated environment; цей slice його не запускає.

## Decision gates

**[DOCUMENTED]** Gates незалежні; amendment готує Documentation Acceptance Review
для Gate A. Owner-selected direction не завершує Gate B; C–E не відкриті.

| Gate | Approval / evidence required | Current status |
| --- | --- | --- |
| Gate A — ADR/Proof Model Review | Незалежний review ADR-049, PO-01–PO-14, SC-01–SC-20, scope та owner open decisions | PROPOSED; review pending |
| Gate B — Contract Evolution Approval | Окремі evidence protocol/versioning, sidecar compatibility/security та revocation/commit decisions понад погоджений direction | BLOCKED BY MISSING DECISION |
| Gate C — Backend Adapter Evidence | Reviewed clock, atomic store, durable coordinator, ownership/restoration, revocation та recovery; evidence за PO | NOT OPENED; BLOCKED, remote mechanisms/evidence відсутні |
| Gate D — Integration Acceptance | Негативні scenarios, runtime evidence provenance, production/readiness та ADMIN bundle guards, deployment readiness | NOT OPENED; BLOCKED, integration acceptance відсутній |
| Gate E — Production Authorization | Окремий дозвіл власника після необхідних proofs/approvals | NOT OPENED; BLOCKED, authorization відсутній |

**[BLOCKED]** Проходження Gate A не відкриває B–E. Проходження ISSUE_SESSION gates
не вирішує PO-11 для ACCEPT_ASSERTION. Owner authorization не є технічним доказом
невиконаної security property. Доки потрібні blockers не закриті, remote gate BLOCKED.

## Open decisions and compatibility audit

**[BLOCKED]** Потрібні рішення та evidence: clock profile (PO-01), retry protocol
(PO-02), atomic store ownership (PO-03/PO-08), obtaining/fixation/restoration t0
(PO-04), revocation та directory/execution authority (PO-05/PO-06), durable recovery
(PO-07), family ownership і production minimum reserve (PO-09), release/use proof
(PO-10), незалежний strict ACCEPT_ASSERTION proof (PO-11), contract/versioning
(PO-12), safe retention (PO-13), proof інертності умовно погоджених late records та
допустимий commit protocol (PO-14). Вибір моделі B, t0=L_j та умовний inert-record
direction уже погоджені; конкретні mechanisms, contract mapping та proofs OPEN.

**[DOCUMENTED]** Documentation-only scope amendment: лише ADR-049 і цей proof document.
Незмінні: runtime STRICT_COMMIT_TIME для обох operations до окремого approval,
remote BLOCKED gate, TTL, Wire v1, LoginOrchestrator, PermissionService, ADMIN
entrypoints/RPC allowlist, production authorization, Safe Grant Renewal contracts,
TypeScript/tests, build configuration, manifests та dependencies. Жодне твердження
цього каталогу не є positive VerifiedDurableGuarantees або runtime capability.

**[DOCUMENTED]** Наявні boundary explanations:
[Durable Store Contracts](ADMIN_WEB_DURABLE_STORE_CONTRACTS.md),
[Local Authentication](ADMIN_WEB_LOCAL_AUTHENTICATION.md),
[Safe Grant Renewal](ADMIN_WEB_SAFE_GRANT_RENEWAL.md),
[Identity Contracts](ADMIN_WEB_IDENTITY_CONTRACTS.md),
[Wire Contracts](ADMIN_WEB_CHANNEL_WIRE_CONTRACTS.md).

## Independent acceptance review checklist

**[DESIGN ASSUMPTION]** Gate A reviewer має перевірити scope/status inheritance,
відсутність runtime approval, completeness і несуперечливість PO fields, traceability
SC-to-PO, окремий ACCEPT_ASSERTION blocker, чесне маркування evidence levels,
owner-selected durable-first semantics, open clock/anchor mechanism,
revocation/retention/sidecar/late-record proofs та посилання на актуальні contracts.
Результат такого review не дозволяє staging/commit, code changes, integration,
deployment або activation без окремого завдання/approval.
