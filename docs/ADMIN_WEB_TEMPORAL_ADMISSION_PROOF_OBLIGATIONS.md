# Temporal Admission — Proof Obligations / (Каталог необхідних доказів)

## Status and scope

**[DOCUMENTED]** Статус: **PROPOSED**. Slice 2C.3B.7, дата 2026-10-27.
Супровідний документ до
[ADR-049 — Temporal Admission for ISSUE_SESSION](<adr/ADR-049 — Temporal Admission for ISSUE_SESSION.md>).
Baseline: `feature/bom-logic`, HEAD
`d6256e4f56d14650a51e124813066309ef5691f1`, clean working tree та empty staging
до документаційних additions. Власник погодив design direction, а не runtime policy.

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
`a_i`; для commit-winning attempt `k`: `a = a_k`, `c` — actual commit,
`Eg` — grant expiry, `Es` — session expiry, `C` — effective upstream cap.

```text
L_i <= a_i <= U_i < Eg
L_i >= grant.issuedAt
U_i < C
sessionIssuedAt = t0
Es = min(sessionIssuedAt + 900000, authenticationExpiresAt), authenticationExpiresAt = C
```

Немає expiry grace. Equality на expiry означає deny. Кожен retry має новий
admission decision; незмінний `t0` не є перенесеним admission permission.
Late `c >= Eg` може завершувати лише ту саму допущену ISSUE_SESSION operation.
Доказ CreationOK не заміняє current UseOK, а UseOK не легалізує незаконне issuance.
Admission не є HTTP/transaction start, browser readiness, issuance, dispatch,
historical receipt або commit response.

**[DESIGN ASSUMPTION]** `CreationOK_B` охоплює provenance/bindings, valid final
attempt admission, immutable anchor, atomic one-time grant consumption, session
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

## Proof obligations

**[DESIGN ASSUMPTION]** Кожна таблиця є повною карткою PO. Authoritative source
розрізняє потрібну реальну authority і наявне джерело контрактної вимоги.
Вибір кандидата механізму не закриває obligation. SC-01–SC-20 визначені нижче.

### PO-01 — Trusted Admission Clock

| Field | Obligation |
| --- | --- |
| ProofID | PO-01 |
| Security property | Provenance, freshness, conservative uncertainty, rollback/skew та restart safety часу саме на admission/use boundary |
| Threat або failure scenario | Cached time до awaited reads, повільний callback, clock rollback, skew іншого worker, restart скидає high-water |
| Required mechanism | Reviewed clock profile з authenticated source, доведеними bounds, health/failure behavior та binding observation-to-decision; джерело ще не вибрано |
| Authoritative source | Потрібна trusted server/backend time authority — NOT IMPLEMENTED. DOCUMENTED requirements: DurableAdmissionRequirements, TrustedClockInterval; scalar/interval DTO не є authority |
| Evidence required | Source/clock provenance; error/freshness model; worker/restart behavior; fail-closed implementation review; integration fault traces |
| Negative tests | SC-03, SC-04, SC-10; boundary equality, wide uncertainty, stale observation, затримка після sample, unavailable clock |
| Current status | OPEN; local interval/high-water behavior DEMONSTRATED BY LOCAL TEST; remote authority NOT IMPLEMENTED; integration BLOCKED |
| Blocking dependency | Clock source/profile approval; observation-to-boundary freshness; PO-08 restoration |
| Acceptance criterion | Незалежний review підтвердив valid bounds на всіх потрібних boundaries; непевність/rollback/unavailability не дозволяють admission/use; локальний high-water не використано як distributed proof |

### PO-02 — Transaction Attempt Freshness

| Field | Obligation |
| --- | --- |
| ProofID | PO-02 |
| Security property | Новий authoritative admission decision на кожній transaction attempt |
| Threat або failure scenario | SDK reruns callback після expiry; old policy/time/READY з попередньої attempt використано повторно |
| Required mechanism | Reviewed transaction retry protocol: усі необхідні authoritative reads, immutable write-set preparation та final clock/decision повторюються; external side effects не виконуються в retried callback |
| Authoritative source | Потрібні actual transaction attempt lifecycle і record authority. DOCUMENTED candidate behavior: [Firestore transactions](https://firebase.google.com/docs/firestore/manage-data/transactions); adapter відсутній |
| Evidence required | Retry/control-flow review, attempt-specific observations, conflict injection, trace останньої committed attempt та rejected attempts |
| Negative tests | SC-02–SC-04; expiry під час policy read; key/user/fence change перед retry; stale cached interval |
| Current status | OPEN; remote retry mechanism NOT IMPLEMENTED; integration BLOCKED |
| Blocking dependency | PO-01, PO-03; reviewed SDK/backend/version and retry behavior |
| Acceptance criterion | Жодна retry attempt без нового valid decision не може commit; attempt на/після expiry deny; старий t0 не є дозволом повторного admission |

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
| Acceptance criterion | У всіх перевірених conflict/failure schedules немає partial success або більше однієї session; receipt точно відповідає єдиному committed transition; vendor atomicity сама не закриває proof |

### PO-04 — Immutable Lifetime Anchor

| Field | Obligation |
| --- | --- |
| ProofID | PO-04 |
| Security property | Незмінний conservative t0 першого valid admission O; Es=min(t0+900000,C), no re-anchoring |
| Threat або failure scenario | Retry/reset/restart пересуває issuedAt; два workers вибирають різні first anchors; втрачений anchor замінено response/lookup time |
| Required mechanism | Reviewed first-valid-admission ordering і immutable fixation, binding до ID/digest/context/identity/grant, persistence при abort та authoritative restoration; конкретний механізм OPEN |
| Authoritative source | Потрібна trusted time authority PO-01 і owner-bound operation/anchor authority PO-08. DOCUMENTED current formula: lifecycle.ts; чинний descriptor не доводить збереження t0 |
| Evidence required | Точне правило obtaining/ordering t0; conservative uncertainty argument; durability/abort/restart protocol; binding/tamper review; integration traces |
| Negative tests | SC-02, SC-04, SC-05, SC-09, SC-15; concurrent first admissions, forged/missing/later anchor, arithmetic overflow |
| Current status | OPEN PROOF OBLIGATION; candidate t0=L0 is DESIGN ASSUMPTION; fixation/restoration NOT IMPLEMENTED; integration BLOCKED |
| Blocking dependency | PO-01, PO-08, PO-12; погоджена authority першого admission при concurrency |
| Acceptance criterion | Серед concurrent actors first anchor має доведене authoritative ordering; retries/recovery не збільшують t0/Es/C; якщо anchor втрачений або непевний, немає new mutation чи positive release |

### PO-05 — Revocation Fencing

| Field | Obligation |
| --- | --- |
| ProofID | PO-05 |
| Security property | Late commit не відновлює відкликаний доступ, включно з pending issuance та logout-all |
| Threat або failure scenario | Revoke стався між a і c; session ще відсутня, тому logout пропускає її; stale writer затирає tombstone/epoch |
| Required mechanism | Approved revision/epoch/tombstone/fencing або еквівалент із доведеним ordering; pending issuance входить у scope; grant revocation лише за окремо погодженим lifecycle |
| Authoritative source | Потрібні authoritative session/subject/key revocation records. DOCUMENTED current session revocation/signing policy; єдину cross-authority revocation model не реалізовано |
| Evidence required | Revocation effectiveness boundary; in-flight policy; data participation/CAS proof; tombstone persistence/GC argument; two-worker race traces |
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
| Required mechanism | Окремо approved consistency/authority та version ordering; execution CAS/epoch/fence або еквівалент; current PermissionService checks зберігаються |
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
| Security property | Після possible dispatch outcome з'ясовується lookup-only; жодних replacement mutation/session або TTL extension |
| Threat або failure scenario | Commit succeeded/response lost; timeout чи missing receipt сприйнято як rollback; orphan session спричиняє нове issuance |
| Required mechanism | Durable immutable descriptor до dispatch; atomic receipt; authenticated read-only authoritative lookup; conservative terminal/UNKNOWN state machine |
| Authoritative source | Потрібні paired operation outcome/receipt authority і coordinator. DOCUMENTED requirements: RecoveryCoordinatorPort, AtomicLoginStorePort, recoveryAction, LoginOrchestrator |
| Evidence required | Save-before-dispatch durability; binding/ownership proof; crash/lost-response traces; no mutation/credential-generation dependency у recovery |
| Negative tests | SC-11, SC-12, SC-15, SC-20; rejected/unavailable lookup, stale completion, timeout з пізнім COMMITTED |
| Current status | OPEN; local lookup-only/no replacement DEMONSTRATED BY LOCAL TEST; remote coordinator/lookup NOT IMPLEMENTED; integration BLOCKED |
| Blocking dependency | PO-03, PO-04, PO-08, PO-13; response/reader provenance PO-12 |
| Acceptance criterion | UNKNOWN ніколи не перетворюється на unsent/retry permission; original ID/digest/bindings/anchors незмінні; COMMITTED metadata не видає bearer; timeout не оголошує cancellation |

### PO-08 — Durable Restoration & Ownership

| Field | Obligation |
| --- | --- |
| ProofID | PO-08 |
| Security property | Restart не втрачає ownership, original operation metadata, grant/session provenance або revocation/family fencing |
| Threat або failure scenario | DTO з іншого project/path/context відновлює capability; fabricated snapshot або stale revision; restart скидає owner/clock/anchor history |
| Required mechanism | Reviewed authenticated store/project/database/path ownership; independent expected bindings; paired closed readers; durable coordinator/fence restoration; malformed/missing evidence fail closed |
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
| Acceptance criterion | Budgets не обходяться concurrency/restart; possible dispatch ніколи не стає unsent; original upstream cap не збільшується; reserve/5000 ms/local guard не оголошено commit-time або distributed proof |

### PO-10 — Credential Release & Protected RPC

| Field | Obligation |
| --- | --- |
| ProofID | PO-10 |
| Security property | Positive release/use потребують CreationOK + current UseOK; historical receipt недостатньо |
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
| Required mechanism | Gate B contract/version review; exact command framing; closed evidence issuer/reader; явні admission/anchor/commit semantics; compatibility або погоджена нова version без fallback |
| Authoritative source | DOCUMENTED: Wire v1/OperationBinding/RemoteOperationTimes, OPERATION_PROFILE, durable/session schema та paired readers. Майбутня policy evidence schema NOT IMPLEMENTED |
| Evidence required | Field/semantic diff, digest vectors, reader/version rejection tests; ownership binding нового metadata; no boolean/enum-cast trust path |
| Negative tests | SC-20; unknown version, altered body/bindings/anchors, old reader accepting B, fabricated actual commit time, extra DTO fields |
| Current status | OPEN; current Wire v1/contracts DOCUMENTED; B contract evolution NOT IMPLEMENTED; approval/integration BLOCKED |
| Blocking dependency | Gate B; PO-04, PO-08, PO-14; рішення internal metadata проти versioned wire change |
| Acceptance criterion | Чинний v1 у цьому slice незмінний; future readers відкидають непогоджені semantics/versions; unavailable c не вигадується; data-only flags не стають durable capability |

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
| Acceptance criterion | Немає resurrection/replay/false rollback після GC; час останнього request не є єдиною підставою deletion; якщо bound не доведений, небезпечний time-based GC заборонений і capacity failure fail closed |

### PO-14 — Late Completion, Inert Records & Time Facts

| Field | Obligation |
| --- | --- |
| ProofID | PO-14 |
| Security property | Late commit не подовжує доступ; session після Es/C непридатна; admission і actual commit facts не підміняються |
| Threat або failure scenario | c>=Eg названо grace; c>=Es/C повертає чинний bearer; admission timestamp видано за actual commit; arbitrary deadline нібито cancel work |
| Required mechanism | Явне owner approval late-record semantics; unchanged anchors; current release/use enforcement; separate honest time metadata; commit deadline тільки з independent enforceability proof |
| Authoritative source | Потрібні owner temporal-policy decision, actual backend metadata коли доступні, current session/time authorities. DOCUMENTED current receipt дозволяє c=UNAVAILABLE; B late-record policy лише DESIGN ASSUMPTION |
| Evidence required | Legal-origin/late-outcome model; no-extension argument; post-commit/first-use integration tests; honest handling known/unavailable c; explicit residual-risk approval |
| Negative tests | SC-02, SC-05, SC-12; c рівно Eg/Es/C, delayed response, fabricated commit timestamp, release після expiry |
| Current status | OPEN; late-record allowance is DESIGN ASSUMPTION, not runtime approval; mechanism NOT IMPLEMENTED; integration BLOCKED |
| Blocking dependency | PO-01, PO-04, PO-07, PO-10, PO-12, PO-13; Gate A/B owner risk decision |
| Acceptance criterion | Затримка не збільшує lifetime; c>=Es/C record не дає access/replacement; якщо сам late record неприйнятний, B недостатня без окремого commit-time proof; жодного вигаданого latency bound |

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
| SC-05 | Commit після Es/upstream C | B: лише inert historical record, якщо це окремо погоджено; no positive release/use/replacement. A: застосовна strict expiry не послаблюється | PO-01, PO-04, PO-10, PO-14 |
| SC-06 | Concurrent redemption двома workers | Максимум одна session і відповідний atomic receipt; інший actor отримує bound prior outcome або conflict/replay без нового issuance | PO-03, PO-08, PO-12 |
| SC-07 | Revocation під час in-flight issuance | Late writer не відновлює доступ; transaction retry/deny або доведений fence робить record непридатним; pending/logout-all входять у scope | PO-03, PO-05, PO-13 |
| SC-08 | AuthorizationVersion change | Старій session deny; version не переписується в старому record; current permissions перевіряються окремо | PO-05, PO-06, PO-10 |
| SC-09 | Backend restart | Відновлення original bindings/anchor/fences лише authoritative reader; за відсутності evidence немає re-anchor чи mutation, тільки safe recovery | PO-01, PO-04, PO-07, PO-08 |
| SC-10 | Clock rollback/skew | Недоведені bounds/freshness deny; restart не обнуляє часову довіру; uncertainty не додає grace | PO-01, PO-02, PO-08 |
| SC-11 | UNKNOWN commit outcome | Read-only lookup original O; timeout/missing receipt не rollback і не replacement permission | PO-03, PO-07, PO-08, PO-13 |
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

**[DOCUMENTED]** Gates незалежні; цей slice готує тільки Gate A.

| Gate | Approval / evidence required | Current status |
| --- | --- | --- |
| Gate A — ADR/Proof Model Review | Незалежний review ADR-049, PO-01–PO-14, SC-01–SC-20, scope та owner open decisions | PROPOSED; review pending |
| Gate B — Contract Evolution Approval | Окреме погодження normative change/versioning, t0/time facts і late-record/revocation semantics | BLOCKED; approval відсутній |
| Gate C — Backend Adapter Evidence | Reviewed clock, atomic store, durable coordinator, ownership/restoration, revocation та recovery; evidence за PO | BLOCKED; remote mechanisms/evidence відсутні |
| Gate D — Integration Acceptance | Негативні scenarios, runtime evidence provenance, production/readiness та ADMIN bundle guards, deployment readiness | BLOCKED; integration acceptance відсутній |
| Gate E — Production Authorization | Окремий дозвіл власника після необхідних proofs/approvals | BLOCKED; authorization відсутній |

**[BLOCKED]** Проходження Gate A не відкриває B–E. Проходження ISSUE_SESSION gates
не вирішує PO-11 для ACCEPT_ASSERTION. Owner authorization не є технічним доказом
невиконаної security property. Доки потрібні blockers не закриті, remote gate BLOCKED.

## Open decisions and compatibility audit

**[BLOCKED]** Потрібні рішення та evidence: clock profile (PO-01), retry protocol
(PO-02), atomic store ownership (PO-03/PO-08), obtaining/fixation/restoration t0
(PO-04), revocation та directory/execution authority (PO-05/PO-06), durable recovery
(PO-07), family ownership і production minimum reserve (PO-09), release/use proof
(PO-10), незалежний strict ACCEPT_ASSERTION proof (PO-11), contract/versioning
(PO-12), safe retention (PO-13), допустимість late inert records (PO-14).

**[DOCUMENTED]** Documentation-only scope: новий ADR і цей proof document.
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
open t0/revocation/retention decisions та посилання на актуальні contracts.
Результат такого review не дозволяє staging/commit, code changes, integration,
deployment або activation без окремого завдання/approval.
