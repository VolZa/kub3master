# ADR-050 — Backend Sessions and Check-Time Continuation

## Status and approval boundary

**ACCEPTED / (Прийнято).** Дата: 2026-10-31. Slice: 2C.3C.5.

**[DOCUMENTED]** Власник ERP КУБ погодив архітектурний напрямок B/D2 та design
decisions, перелічені нижче. Це контрольована фіксація дизайну, а не approval
runtime implementation, security-contract evolution, production wiring або deployment.
**[DOCUMENTED]** Прийнято власником 2026-10-31 у Slice 2C.3C.7. Підстава:
review 2C.3C.6 — READY FOR OWNER ACCEPTANCE; 0 blocking / 0 non-blocking findings.
Прийняття затверджує архітектуру та нормативні правила B/D2 для підготовки наступних
implementation slices; OPEN acceptance criteria залишаються обов'язковими.
Попередні матеріали: review 2C.3C.4A та revised draft 2C.3C.4B.

Baseline: branch feature/bom-logic, HEAD e9ae5ecc712b11383c5b18e331c6091fbcd0a25a,
clean working tree, empty staging, untracked none до цього documentation-only slice.
Перевірено фактичний каталог ADR-000–ADR-049 і README: ADR-050 був вільний.

Незмінний поточний стан:

| Surface | Current state |
| --- | --- |
| ADR-049 | PROPOSED; його нормативні вимоги не переписуються |
| ISSUE_SESSION / ACCEPT_ASSERTION | STRICT_COMMIT_TIME для обох operations |
| Gate B | BLOCKED BY MISSING DECISION |
| Gates C–E | NOT OPENED |
| PO-01–PO-14 | OPEN |
| Remote admission | BLOCKED |
| PRODUCTION / ADMIN deployment / TEST_RESET execution | NO-GO |

У цьому ADR **owner-approved design** означає погоджену вимогу майбутнього profile.
**OPEN evidence** означає відсутній technical proof/adapter acceptance; design approval
його не замінює. Наявність schemas або локальних tests не є production guarantee.

## Context and decision

**[DOCUMENTED: OWNER-APPROVED DESIGN]** ERP призначена для 5–20 довірених працівників
із Google accounts, включно з особистими Gmail та різними доменами. Обрано:

**B/D2 — Google Identity Services + мінімальний backend + наявні GAS business services.**

- Google identity перевіряється на підтримуваному backend.
- ERP має власні opaque sessions та одну authoritative backend boundary для
  Users, Sessions і SessionPolicy. Firestore є кандидатом, не реалізованим adapter.
- Manual enrollment: Google login сам по собі не створює ERP-доступу.
- MASTER приватний; працівники працюють лише через ERP UI без прямого MASTER ACL.
- GAS виконує фіксовані business operations під системною execution identity через
  захищений execution boundary. Execution identity не є visitor identity.
- Максимально повторно використовуються чинні TypeScript security modules,
  permission guards, validation, business services, repositories та test knowledge.
- Чинні production guards і holds зберігаються. Business mutations залишаються BLOCKED.

B/D2 тут **не є** legacy Policy B / Model B (First Durably Admitted Operation)
з [ADR-049](<ADR-049 — Temporal Admission for ISSUE_SESSION.md>).

## Trust boundaries

~~~text
Untrusted browser / GIS
  -> backend: Google verifier + Users/Sessions/SessionPolicy authority
  -> authenticated fixed-operation GAS executor
  -> private MASTER
  -> backend result-release authorization
  -> browser
~~~

Backend, GAS deployer, infrastructure administrators та channel-key holders входять
до trusted computing base. ERP ADMIN не отримує infrastructure privileges автоматично.
Browser не визначає environment, audience, Script ID, verifier/backend destination,
permission або spreadsheet ID. Business entity IDs перевіряються сервером.

Channel MAC підтверджує повідомлення від власника ключа, але сам по собі не доводить
visitor identity, поточні permissions або конкретну code/deployment provenance.
Потрібні current authorization і binding до operation/context/payload.

## New profile: KUB_ERP_SESSION_BD2_V1

Наступні P-01–P-14 є вимогами майбутнього дизайну. Позитивної runtime composition,
crypto/store/channel adapters або evidence issuer цей документ не додає.

### P-01 — Google identity verification

Backend використовує підтримувану Google verification library із pinned client/audience,
signature, issuer, expiry, subject та browser-bound nonce/login-state checks.
Decoded JWT, browser email/roles або claimed verified flag не є identity evidence.
Login attempt одноразовий і короткоживучий; його точний contract/freshness profile
потребує окремого review. Зовнішні OAuth calls не виконуються у retried store callback.

### P-02 — Canonical principal and upstream semantics

Після verification допустимі Google issuer representations нормалізуються до
https://accounts.google.com; principal складається з issuer + verified Google sub.
Email є інформаційним полем, не authorization key або automatic account-linking rule.

Окремо зберігається семантика token iat, token exp, auth_time (якщо доступний),
backend verified login event та ERP creation time. Token issuance не доводить recent
password entry або MFA. Фіктивні auth_time/amr заборонені.

Legacy ceiling C = min(token.exp, token.iat + 1 hour) не переноситься у новий profile.
Початковий Google token перевіряється при login; надалі ERP session має власні
server-side expiry, revocation та permission checks і може залишатися валідною після
expiry цього token. Це не продовження Google token і не Google account-session guarantee.

### P-03 — Manual enrollment

Доступ потребує current active Users record для canonical principal. Користувача
допускає адміністратор; перший login не створює active user, role або permission.
Bootstrap першого адміністратора та directory rollout потребують окремої процедури.

### P-04 — One authority

Users/Sessions/SessionPolicy та security-management entitlements мають одну backend
authority. Browser не пише ці records напряму. Незалежна друга Users/Sessions copy
або browser role/session snapshot не є authority. Configuration history та AuditLog
належать тій самій контрольованій trust boundary.

### P-05 — Create-once opaque session

Immutable createOperationId зв'язує verified browser-bound login attempt, principal,
context, S та SID-to-digest binding. Один login attempt створює максимум одну session.
Backend генерує opaque SID із щонайменше 256 CSPRNG bits; durable storage отримує
лише sessionDigest. Raw SID не входить до receipts, recovery descriptors, URL або logs.

S фіксується один раз із reviewed backend clock для original creation operation;
це server-owned logical creation time, а не заявлений actual DB commit time.
Retry/restart не замінює його поточним now. SID generation не повторюється всередині
retried callback. Невідновлювані original bindings блокують повторне creation dispatch.

Authoritative creation повинна атомарно забезпечувати one-time login-attempt binding,
session insertion та bound outcome. Current Users/version і current SessionPolicy
беруть участь у creation transaction. Вибір policy визначає її serialization order,
не browser time або порівняння S із configuration updatedAt.
Після першого durable binding policy snapshot незмінний; UNKNOWN не дозволяє його заміну.

Cookie видається лише після підтвердженого durable outcome та fresh session/user check.
Невизначений outcome не дозволяє видати непідтверджений credential.

### P-06 — Captured configurable lifetime

**[DOCUMENTED: OWNER-APPROVED DESIGN]**

~~~text
IdleTimeoutMinutes = 180 initially
AllowedIdleTimeoutRange = integer 30..360, inclusive
AbsoluteTimeoutMinutes = 720

S = immutable server-owned creation time
A = last accepted eligible activity time; initially A = S
T = idle timeout captured for this session

H = S + 720 minutes
effectiveExpiry = min(H, A + T)
~~~

Access вимагає ACTIVE session, current active user, matching authorizationVersion,
current permission та now < H і now < A + T. На equality — deny.
T, H та captured policyVersion не змінюються global policy edit, retries або recovery.
Arithmetic/timestamps мають бути валідними safe-integer Unix milliseconds.

S/A/check time походять із reviewed backend time adapter. Browser timestamps,
response completion time та retry time не є activity authority. Clock source,
freshness, cross-worker behavior, rollback handling і restart evidence — OPEN.
Backend clock sample не оголошується strict durable linearization proof.

Missing/corrupt required configuration або session policy snapshot означає deny;
fallback на initial 180, legacy constants чи browser value заборонений.
Початковий fail-closed дизайн вимагає валідної current policy для protected checks,
але її нові T/version не підміняють captured snapshot старої session.

### P-07 — CHECK_TIME_CONTINUATION

**[DOCUMENTED: OWNER-APPROVED DESIGN]** Activity boundary — CHECK_TIME_CONTINUATION.
Eligible activity — server-defined дозволена інтерактивна ERP operation із валідними
inputs, authenticated session та current permission. Browser active flag не є доказом.

Кожна logical action має stable activityId та session/context/payload binding.
Її server observation time фіксується один раз; automatic retry не переносить його
вперед. Потрібні durable deduplication та recovery original binding у тій самій authority.
Якщо original activity timestamp/binding не відновлений, новий touch за старим ID заборонений.

Перед conditional update перевіряються current session/user/version/permission і
попередній deadline E_old = min(H, A_old + T). Fresh check time >= E_old означає deny.
Нова величина A + T не використовується для легалізації вже expired-at-check record.
Accepted A не зменшується, H не змінюється. Update A та activity outcome потребують
узгодженої atomic boundary з session revision; adapter mechanism/evidence — OPEN.

| Event | Eligible activity |
| --- | --- |
| Валідна дозволена interactive operation, включно з ручним protected read | Так, один раз при прийнятті |
| Background polling / heartbeat / automatic refresh | Ні |
| Automatic retry тієї самої action | Ні повторно; original ID/time зберігаються |
| Reconciliation / system job / P або R check | Ні |
| Unauthorized/malformed request або локальна UI activity без authenticated operation | Ні |
| Нова незалежна interactive action з іншої вкладки shared session | Так, із shared authoritative ordering |

Оновлення idle відбувається за прийняттям activity, не за пізнішим read/response completion.
Server classification не доводить фізичний human click: stolen SID/XSS може генерувати
дозволені requests. Hard cap та local revoke залишаються незалежними обмеженнями.

#### Late updates and concurrency

Check-time admission може передувати E_old, а durable update — відбутися після E_old.
Такий late update допускається лише за цим profile; fresh authorization обов'язкова
для кожної наступної operation. Old receipt або stale positive cache не є дозволом.

Приклад: check о 11:59:59 для E_old = 12:00:00 та commit о 12:00:03 не відхиляється
лише через late commit. Якщо session не terminal і новий authoritative A законний,
fresh request після commit може пройти authorization до нового effectiveExpiry/H.
Це не STRICT_COMMIT_TIME і не обіцянка відсутності будь-якого wall-clock idle gap.

Дві concurrent activities мають conditional revision/transaction ordering. Stale writer
не перезаписує новіший A або terminal status. Кожна внутрішня retry attempt перечитує
current state і check time, зберігаючи original logical activity time/ID; duplicate
не надає другого extension. Якщо record expired на новій перевірці — deny.

Strong commit-before-old-expiry guarantee НЕ заявляється. Stronger wall-clock
no-resurrection property залишається OPEN. CAS, serializability або server timestamp
самі по собі не оголошуються її доказом. Race/ordering/clock traces ще потрібні.

### P-08 — Logout, revoke and terminality

Authoritative EXPIRED/REVOKED — terminal: transition до ACTIVE заборонений, включно
з late activity, configuration change, restart або recovery. Немає upsert, що
повторно створює відсутню session за старим SID/attempt.

Activity update та revoke/expire мають одну authoritative ordering boundary.
Якщо terminal transition serialized першою, delayed activity не проходить; якщо
activity serialized першою, наступний revoke однаково робить session непридатною.
Це required design invariant; реальний adapter/concurrency proof — OPEN.

Derived expiry негайно означає deny, але не доказ persisted terminal EXPIRED.
Authoritative terminal outcome оголошується лише після підтвердженої transition.
Пізніша authorization після допустимого late update не змішується з відновленням terminal state.

Logout/revoke діють незалежно від timeout. Cookie deletion і server revoke — окремі
дії; UNKNOWN revoke не оголошується успішним server logout. Storage unavailable — deny.

### P-09 — Current user and security administration

Кожна protected authorization перевіряє current active user, roles/permission та
authorizationVersion. Disable, role/entitlement changes підвищують user version;
старі sessions не оновлюються автоматично. Re-enable не відновлює старих sessions.

Security policy змінює лише власник або спеціально призначений ним Security Manager
із explicit security-management entitlement. Entitlement перевіряється окремо від
чинного ADMIN wildcard; сама роль ADMIN не дає цього доступу. Security Manager тут
позначає повноваження, а не зміну чинного ADMIN/MANAGER role enum.

Owner-controlled granting/revocation має окрему контрольовану audited процедуру.
Self-grant через звичайний user-management endpoint заборонений. Representation,
bootstrap і перевірка entitlement потребують contract-level рішення, не browser role flag.

Для sensitive administrative operations потрібний fresh verified Google login proof.
Це не гарантія recent password entry/MFA. Допустимий вік proof, operation binding,
перелік sensitive operations і acceptance механізму — OPEN contract decisions;
до їх acceptance відповідні sensitive mutation endpoints залишаються BLOCKED.

### P-10 — Activity, execution P, read, release R and delivery

| Stage | Responsibility | Updates A |
| --- | --- | --- |
| Eligible activity admission | Можливе одноразове idle continuation | Лише за P-07 |
| P | Fresh authorization конкретного protected read, ініційована GAS executor | Ні |
| Actual read | Виконання fixed GAS business operation | Ні |
| R | Fresh backend authorization перед result release | Ні |
| HTTP delivery | Transport до browser; delivery може бути невідомою | Ні |

P передує protected read та зв'язаний із request/context/operation/payload. R знову
перевіряє current session/user/permission. Read може завершитися після expiry/revoke;
за failed R результат browser не видається. P/R не є lease для queue, future retry
або іншої operation та не продовжують idle window.

Зміни, що передують відповідній authoritative snapshot boundary, повинні враховуватися.
Зміна після останнього snapshot не відкликає вже дозволену відповідь ретроактивно.
Немає гарантії фізичного browser receipt до expiry або cancellation already-started read.
Time sample після I/O не підміняється request-start time. Snapshot/time ordering — OPEN evidence.

Positive Users/Sessions cache не приховує current revoke/version change. Captured
immutable policy data не є cached authorization. Усі direct GAS/legacy RPC шляхи
повинні мати той самий approved boundary або залишатися closed.

Initial integration scope — одна accepted read-only ERP operation. Future session/audit
control-state writes не є дозволом на business mutations; жодний runtime write цим ADR не відкривається.

### P-11 — Retry, UNKNOWN, recovery and independent login

| Case | Required behavior |
| --- | --- |
| Retry original creation | Same createOperationId/S/SID binding; no replacement credential |
| UNKNOWN creation | Authoritative lookup original operation; missing receipt не доводить abort |
| Confirmed creation, raw SID ще у trusted process | Release лише після fresh current validation |
| Raw SID втрачений після commit/restart | Digest/receipt не реконструює bearer |
| New independent Google login | New proof/browser binding/createOperationId; не retry старої operation |
| UNKNOWN activity | Lookup same activityId; no new now-based touch |
| Old committed activity receipt | Status evidence only; fresh authorization окремо |
| ERP mutation uncertainty | No automatic repeat/replacement effect; mutations досі BLOCKED |

Independent login може створити окрему session за current policy; це не автоматичний
replacement зі старого proof. Old orphan обробляється окремим revoke/expiry/reconciliation
flow. Recovery не пересуває H, original timestamps або policy snapshot.
Recovery/status reads автентифіковані; metadata не видають bearer і не створюють permission.

### P-12 — Browser protection

Raw SID передається як protected first-party cookie: Secure, HttpOnly, host-only,
Path=/ і погоджений SameSite. Browser не задає SID. Cookie absolute expiry не
перевищує H; cookie presence/rolling issuance не є idle authority та не пересуває H.

Потрібні login CSRF/browser binding, state-changing request CSRF protection,
new SID для нового login, escaping untrusted content, контроль frontend scripts
та no-store для sensitive responses. Login callback cookie policy перевіряється
окремо від ERP cookie. Shared-cookie tabs мають один authoritative A.

### P-13 — Permissions and private MASTER

Fixed server-selected permissions перевіряються для кожної operation. Valid Google
proof, cookie або MAC самі по собі не надають ERP-доступу. Перевіряються current roles,
а не permissions snapshot у browser/token. Legacy holds, включно з held production
handlers, зберігаються. Нові generic function/resource dispatch APIs не дозволені.

### P-14 — Durable security audit

До protected read потрібний durable audit intent із verified actor, context,
operation/correlation ID і мінімальним request binding. Фіксуються activity outcome,
P allow/deny, actual read completed/failed/unknown, R allow/deny і transport uncertainty.
Для неперевіреної identity actor лишається unknown; browser email не стає verified actor.

READ_COMPLETED, RELEASE_ALLOWED і DELIVERED не є взаємозамінними. Server HTTP write
не доводить browser delivery. Crash після intent допускає unresolved outcome.
Reconciliation читає evidence, не вигадує success/failure та не повторює read/mutation
лише для заповнення AuditLog; OUTCOME_UNCONFIRMED є допустимим чесним результатом.
Raw SID, Google tokens, keys і credential-bearing bodies не журналюються.
Audit persistence, reconciliation, retention і capacity evidence — OPEN.

## Configuration contract and version semantics

Нижче proposed minimal schema documentation, не новий TypeScript/runtime contract:

~~~typescript
type Principal = { issuer: 'https://accounts.google.com'; sub: string };
type SecurityContext = {
  environment: 'PRODUCTION' | 'TEST';
  applicationAudience: string;
  expectedScriptId: string;
};

interface SessionPolicyConfig {
  profile: 'KUB_ERP_SESSION_BD2_V1';
  schemaVersion: 1;
  context: SecurityContext;
  policyVersion: number;          // monotonic integer >= 1
  idleTimeoutMinutes: number;    // integer 30..360 inclusive
  absoluteTimeoutMinutes: 720;
  appliesTo: 'NEW_SESSIONS_ONLY';
  updatedAtMs: number;           // server-owned audit metadata, not a time guard
  updatedBy: Principal;
}

interface Bd2Session {
  profile: 'KUB_ERP_SESSION_BD2_V1';
  schemaVersion: 1;
  context: SecurityContext;
  sessionDigest: string;
  createOperationId: string;
  principal: Principal;
  createdAtMs: number;               // S: immutable
  lastEligibleActivityAtMs: number;  // A
  policySnapshot: {
    policyVersion: number;
    idleTimeoutMinutes: number;
    absoluteTimeoutMinutes: 720;
  };
  authorizationVersionAtIssue: number;
  revision: number;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
  revokedAtMs: number | null;
}
~~~

| Version | Meaning | Must not do |
| --- | --- | --- |
| schemaVersion/profile | Format та semantics | Приймати mixed legacy/new records |
| policyVersion | Configuration revision, captured at creation | Міняти T існуючої session або вимагати equality з current policyVersion |
| session revision | Conditional activity/revoke ordering | Заміняти user version або створювати time proof |
| authorizationVersionAtIssue | Binding до current Users authorizationVersion | Автоматично підвищувати version старої session |

Початкове 180 встановлюється лише explicit validated policy record, не missing-config default.
Configuration API перевіряє range/type/context, expected version і fresh authorized actor;
current policy + immutable history + durable audit мають узгоджену atomic boundary.
Параметри можна змінювати без deployment лише після implementation/acceptance цього
захищеного API; такий API зараз відсутній і sensitive endpoint залишається BLOCKED.
Зменшення global idle не є revoke старих sessions; emergency response використовує
явний session revoke/disable/version change. Немає другої directory або fallback policy store.

## Owner decisions recorded and remaining contract decisions

| Decision | Recorded owner-approved design | Remaining evidence / follow-up |
| --- | --- | --- |
| Architecture | B/D2, private MASTER, manual enrollment, GAS reuse | Backend/executor composition, transport та ACL evidence |
| Lifetime | Initial 180, allowed 30..360, hard 720; captured snapshot/new sessions only | Validation, clock та durable lifecycle tests |
| Activity | CHECK_TIME_CONTINUATION, lawful late update possible | Race/ordering traces; stronger wall-clock no-resurrection OPEN |
| Policy administration | Owner або appointed Security Manager; explicit entitlement outside ADMIN wildcard; no self-grant | Entitlement representation, owner-controlled procedure, API contracts |
| Sensitive administration | Fresh verified Google login proof required | Exact proof age, operation binding, sensitive-operation list and acceptance |
| Google security events | Local logout/revoke/disable/version/hard cap sufficient for first version; RISC not required for first implementation slice | Optional later integration; no implementation claim |
| Creation/recovery | Create-once, digest-only SID storage, original-operation lookup, independent fresh login distinction | Durable adapters, fault/restart/credential-loss tests |
| Audit | Audited execution/release and honest delivery uncertainty | Durable capture/reconciliation, retention and safe cleanup decisions |

Fresh Google login proof не є обіцянкою recent password/MFA. Google logout або compromise
можуть не відкликати ERP session автоматично: residual risk явно прийнятий для першої
версії local-controls design. Ні RISC, ні automatic event propagation не оголошуються реалізованими.

## Component reuse and compatibility

| Component | Classification | Boundary |
| --- | --- | --- |
| Google verifier / login broker helpers | REUSE WITH ADAPTER | Google verification та binding; старий assertion/redeem profile не підключається автоматично |
| PermissionService | REUSE UNCHANGED (policy core) | Trusted session adapter і окремий entitlement guard потрібні |
| PropertyUserRepository | REUSE WITH ADAPTER | Existing Users semantics; one backend authority |
| SessionPrototype | REUSE WITH ADAPTER | Opaque/digest/revoke behaviors; fixed 15-minute issue logic не є новим lifetime |
| SessionResolver | RETAIN AS REFERENCE | Новий reader/schema; без fictitious grant/assertion/key fields |
| Assertion/grant/renewal chain | PROPOSED OUT OF NEW RUNTIME | Не видаляється і не відкривається старий strict gate |
| Temporal-attempt contracts / anchored planner | RETAIN AS REFERENCE | Data-only invariants, не нова admission authority |
| Channel contracts | REUSE WITH ADAPTER | Framing/binding/tests; нові operations/direction потребують profile review |
| Operation/recovery contracts | REUSE WITH ADAPTER | Original IDs/digests/UNKNOWN; login-only Wire v1 не стає generic ERP dispatcher |
| Production authorization | REUSE WITH ADAPTER | Current guards/holds зберігаються; wiring зараз unconfigured |
| ADMIN entrypoints | BLOCKED | Static shell не перепрофілюється автоматично в executor |
| GAS business services/repositories | REUSE UNCHANGED (business core) | Approved execution adapters перед core, не bypass guards |

Legacy sessionMs=900000, authenticationMaxAgeMs=3600000, строгі validators,
runtime ISSUE_SESSION/ACCEPT_ASSERTION і Wire v1 не змінюються. Transport freshness
не збільшується до session lifetime. Потрібен explicit new-profile boundary; невідомі
profiles, mixed records та silent legacy fallback відхиляються.

Цей ADR фіксує owner-selected replacement direction, не виконане supersession.
[ADR-049](<ADR-049 — Temporal Admission for ISSUE_SESSION.md>) зберігається як
попередній запропонований напрямок із незмінним статусом і нормативним текстом.
[PO-01–PO-14](../ADMIN_WEB_TEMPORAL_ADMISSION_PROOF_OBLIGATIONS.md) залишаються OPEN,
не стають PASS/N/A і не вважаються доведеними новими назвами operations.
Gate B не відкривається. Separate contract approvals та independent acceptance потрібні
перед integration; documentation approval не є technical proof або production authorization.

## Acceptance criteria and OPEN evidence

1. Real Google verification/browser binding: wrong audience/issuer/nonce/signature,
   unknown/inactive users deny; token iat не приймається як password/MFA time.
2. New ERP session може залишатися валідною після initial Google token expiry;
   expired Google token не приймається як новий login proof; no legacy ceiling/fake fields.
3. Configuration: 30/360 accept, 29/361/fraction/string/NaN/unknown profile deny;
   missing/corrupt config не має fallback. Owner/entitlement checks та self-grant deny.
4. Concurrent config edits: expected-version conflict, current/history/audit consistency;
   new sessions capture selected policy, old snapshots не змінюються в обидва боки.
5. Create-once across workers/restart: stable createOperationId/S/SID binding,
   atomic outcome, UNKNOWN lookup та raw-credential loss без replacement зі старого proof.
6. A=S initially; eligibility whitelist, duplicates, tabs, out-of-order requests та
   retries не створюють unintended extension. Dedup retention/capacity — reviewed.
7. Equality idle/hard expiry deny; H не пересувається після restart/recovery;
   clock rollback/unhealthy observation fail closed. Time-source error model — OPEN.
8. Check-before-E_old/commit-after-E_old traces: fresh subsequent authorization за
   погодженими semantics, без strict commit-time або stronger no-resurrection claim.
9. Concurrent activity/logout/disable/expire: terminal state не перезаписується,
   stale revisions та user versions deny; real store ordering evidence — OPEN.
10. Real authenticated channel: context/operation/payload/response binding, replay,
    rotation/compromise, direct endpoint/legacy RPC bypass deny; no stale positive cache.
11. P/read/R races: R не оновлює A, failed R не видає результат, delivery не вигадується.
12. Durable audit intent/outcomes, crash reconciliation і capacity/retention handling;
    reconciliation не виконує повторного ERP effect.
13. Actual Node/GAS build isolation і unchanged legacy contracts/holds; synthetic
    adapters не потрапляють у production. Deployment/MASTER ACL evidence — OPEN.
14. Initial acceptance — лише окрема read-only operation. Mutations та sensitive
    endpoints потребують окремих contract decisions, proofs і owner authorization.

## Consequences and documentation follow-up

Переваги: reuse чинного security/business core, Google verification на підтримуваному
backend, session policy для робочої зміни без власного grant-renewal chain у новому runtime.
Обмеження: idle 180–360 означає довший unattended-device exposure; stolen SID може
генерувати activity до H. Local revoke, current permissions, browser protection і
fresh-proof sensitive-operation policy залишаються потрібними.

Мінімальні cross-references додаються до ADR-049 та identity/proof documentation.
Ширша migration не виконується цим slice. Окремий follow-up повинен узгодити
[ADR-018](<ADR-018 — UI Pattern.md>)/[ADR-019](<ADR-019 — Google Sheets as Administration Interface.md>)
та релевантні manual workflow assumptions ADR-012 із private MASTER; role ADMIN не
створює неявного direct-Sheets exception. Domain ProjectContext lifetime ADR-030 не
є authentication/permission lease. ADR-033/ADR-044 business/persistence boundaries зберігаються.
Threat model, local-auth/durable/channel docs потребуватимуть profile-specific mapping
перед integration, без rewriting historical evidence або автоматичного закриття PO.

Наступний запропонований slice: independent documentation acceptance цього ADR та
вузьке contract-level визначення login/entitlement/session adapter boundary. Після
окремого дозволу — isolated backend Google verification slice без GAS business access,
Cloud resource creation або deployment за замовчуванням. Нічого з цього не запускається тут.

## References

- [Google ID token verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token): supported backend verification; не ERP enrollment.
- [GIS credential/session semantics](https://developers.google.com/identity/gsi/web/reference/js-reference): token expiry не керує application session.
- [Google OIDC claims](https://developers.google.com/identity/openid-connect/openid-connect): iat/exp/auth_time мають окремі значення.
- [Firestore transaction behavior](https://firebase.google.com/docs/firestore/manage-data/transactions): callbacks можуть повторюватися; не виконувати external effects усередині.
- [Firestore isolation](https://firebase.google.com/docs/firestore/transaction-data-contention): ordering не є application expiry predicate.
- [Current identity contracts](../ADMIN_WEB_IDENTITY_CONTRACTS.md), [local authentication](../ADMIN_WEB_LOCAL_AUTHENTICATION.md), [channel contracts](../ADMIN_WEB_CHANNEL_WIRE_CONTRACTS.md).
- [Current permission core](../../src/security/permission-service.ts), [production guards](../../src/security/production-authorization.ts), [blocked remote gate](../../src/admin/web/identity-contracts/durable-store-contracts.ts).
