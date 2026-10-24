> Historical stage snapshot: role names below predate the ADMIN / MANAGER migration. Current rules: [role matrix](AC_002B_ROLE_MATRIX.md). Original stage results are unchanged.

# AC-002B.3 — Google Identity Integration Feasibility

Дата перевірки: 2026-10-21. Лише локальний design/prototype. Production v32 незмінна.

## Висновок

Рекомендується B: зовнішній top-level HTTPS login/broker, контрольований callback та обмін через
автентифікований GAS→broker канал. ERP залишається в GAS із чинною адресою /exec.
Для A немає достатньої підстави створювати OAuth Client під внутрішній HtmlService origin:
googleusercontent.com заборонений правилами origins, а FedCM потребує керування parent policy.
Це висновок про підтримувану архітектуру, НЕ звіт успішного live Google-входу.

GO для погодження створення ОКРЕМОГО OAuth Web Client для B після вибору контрольованого HTTPS origin.
NO-GO для OAuth Client під припущений script.google.com origin, production deployment, Manufacturing write
та заяви про працездатність двох акаунтів. Фактичне створення будь-яких ресурсів тут не виконано.

## Доведені факти та межі огляду

| Питання | Доказ / результат |
|---|---|
| HtmlService sandbox | Офіційно IFRAME; setSandboxMode не знімає sandbox. HTTPS active content, user-activated popups/navigation дозволені з обмеженнями [1] |
| OAuth JS origins | Google прямо забороняє googleusercontent.com, wildcard, path/query/fragment [3] |
| FedCM | One Tap/FedCM Button у cross-origin frames потребують identity-credentials-get у КОЖНОМУ parent iframe [2] |
| Non-FedCM Button | Документація дозволяє цей альтернативний режим; це не скасовує origin registration [2] |
| Зміна Google parent iframe | Немає документованого HtmlService API для parent allow/Permissions-Policy; HTML дочірньої сторінки не є контролем Google parent. Це обмеження доступних API, не DOM-доказ поточного allow |
| Точний origin v32 | НЕ ВСТАНОВЛЕНО: browser inventory порожній, createBrowserTab(iab) → Browser is not available. JS/frame tree не виконані |
| script.google.com | URL верхнього /exec не доводить JS origin внутрішньої сторінки. Його не реєструємо за припущенням |
| Наявність identity-credentials-get у v32 | НЕ ВСТАНОВЛЕНО через недоступний browser; немає твердження, що він фактично відсутній |
| Google Cloud Console validation | НЕ ВИКОНАНО: OAuth Client не створювався; офіційне правило не видається за знімок Console |
| Google Login 2 акаунтів | NOT RUN: немає погоджених client/origin/callback/ресурсів |
| erbes.com.ua | Контроль DNS, хостинг/runtime/TLS не перевірено. Піддомен є пропозицією, не існуючим налаштованим ресурсом |

Для майбутнього read-only DOM доказу: відкрити /exec без натискання бізнес-кнопок, зафіксувати
frame tree, src origins, sandbox/allow attributes, Permissions-Policy; в контексті саме ERP frame
зняти location.origin, location.href без query secrets, typeof google.script.run і feature policy
identity-credentials-get якщо API доступний. У доказ не включати credentials/account cookies.
Не підміняти origin iframe адресою top-level. Не обходити недоступний Computer Use.

## Матриця сумісності

| Режим | A: GIS усередині HtmlService | B: зовнішній top-level login |
|---|---|---|
| GIS Button + FedCM | Origin gate + parent policy gate; NO-GO до доказу обох | Контрольований origin; без GAS parent iframe. Live browser test потрібен |
| GIS Button non-FedCM popup | Може не вимагати FedCM delegation, але origin gate лишається; popup не легалізує caller origin | Документований popup UX, callback на зовнішньому origin; перевірити popup blocker/COOP |
| GIS redirect | HTTPS login_uri, registered URI та CSRF; GAS callback не є рекомендованим endpoint | Зареєстрований зовнішній HTTPS POST login endpoint із ID token verification [4][5] |
| OIDC code redirect | Можна навігувати за явною дією; це вже зовнішній server flow, не GIS-in-GAS | Рекомендований тут: server callback, state + nonce + PKCE S256, code exchange на backend [6][7] |
| Implicit/access_token fragment | Не застосовувати для ERP authentication | Не застосовувати; access token не ERP identity/session, implicit не обираємо [3] |
| Google token verification | Наявний CJS verifier не працює у GAS; власний RSA порт не створюємо | Підтримувана server library, trusted Google keys/rotation, exact audience [5] |
| google.script.run | Доступний у початковому HtmlService frame, не забезпечує visitor identity сам | Не доступний на довільному зовнішньому сайті; первинний GAS frame лишається відкритим і виконує exchange [8] |
| Повернення до ERP | Redirect самого ERP frame втрачає його runtime/RPC контекст | Окремий login window; polling з початкового GAS frame. Browser ніколи не приносить готові roles/identity |
| Поточний /exec | Потребував би майбутнього code/deployment update | URL ERP зберігається; окрема login URL. Поточна v32 не змінюється |

GIS redirect ID-token POST та OIDC authorization-code callback — РІЗНІ flows. Для probe обрано
OIDC code на зовнішньому backend. Scopes openid email profile, access_type=online; refresh token не потрібен.
GIS button redirect залишається альтернативою, не змішується з code callback: у нього власна
g_csrf_token double-submit перевірка та cookie/SameSite нюанси [5].

## Рекомендований протокол B

Обов'язково два зв'язування: (1) Google login до зовнішнього browser transaction; (2) цей transaction
до первинного GAS browser frame. Public transaction ID або postMessage самі по собі цього НЕ доводять.

1. Явне натискання Login у майбутньому ізольованому GAS shell створює CSPRNG browserProof (256 bits),
   тримає його лише в memory та відправляє SHA-256(proof) у begin через google.script.run.
   При user gesture синхронно відкрити окреме вікно контрольованого login origin; мережевий begin
   завершити після відкриття, щоб не покладатися на popup після async callback.
2. GAS генерує challenge ID/nonce із TTL 120s, зберігає proofHash. Автентифікованим server channel
   реєструє у broker id/nonce/proofHash та pinned ERP deployment/environment audience.
   Launch URL містить лише public rendezvous id; немає ID token, session, proof чи ролі в URL.
   Наявність id не дозволяє завершити login. Begin відповідає лише id.
3. ПЕРЕД Google redirect зовнішня login page обмінюється startup-ready повідомленням із конкретним
   opener WindowProxy. GAS приймає READY лише з exact login origin + конкретного popup + свого id,
   і тільки тоді передає proof через postMessage з ТОЧНИМ targetOrigin. Broker page приймає message
   тільки від pinned actual GAS frame origin і window.opener + свого id. Ні wildcard suffix, ні '*'.
   Bootstrap не має передавати identity/session. Нова bridgeReadyMessage перевіряє лише GAS сторону;
   повний browser adapter, reverse guard і серверний bind endpoint ще не реалізовані.
4. External bind endpoint перевіряє hash(proof) з server-registered transaction, атомарно прив'язує
   його до нового __Host- HttpOnly Secure browser cookie. Одноразовий bind, TTL, POST, body bounds,
   exact same-origin Origin/CSRF. Cookie на login host, не Domain=.erbes.com.ua. Не приймати browser
   subject/email/role. За відсутності proof сторонній відвідувач public launch URL не може логінити
   свою особу у victim transaction: це критичний login-CSRF gate.
5. Backend створює OAuth state (256-bit), nonce=registered challenge nonce, PKCE verifier/challenge,
   зв'язує з cookie+transaction. Google auth тільки top-level login window, не GAS iframe.
   Callback рівно зареєстрований https://<chosen-login-host>/oauth/callback; HTTPS, одноразовий state,
   cookie binding, exact redirect_uri, code+PKCE exchange, Google ID-token signature/iss/aud/exp/iat/
   sub/nonce (azp коли застосовно), strict error handling. Не використовувати tokeninfo.
6. Backend зберігає original signed ID token лише короткочасно для server-only redemption,
   не в URL або browser storage. State/Google code одноразові, callback без сторонніх ресурсів,
   Cache-Control:no-store, Referrer-Policy:no-referrer, query code/state не логуються, після обробки
   clean redirect на completion page. Перш ніж віддати результат, broker звіряє environment/audience,
   transaction/proofHash, expiry, стан VERIFIED і атомарний single-use redeem.
7. GAS frame робить bounded polling через google.script.run.complete(id, proof), максимум TTL,
   один in-flight запит, явна зупинка на error/expiry. PENDING не є PASS або правом на дані.
   GAS перевіряє local proofHash/expiry ДО мережі; потім server-to-server redeem.
   Broker повертає signed Google ID token лише до GAS server. Існуючий IdentityPrototype з
   GoogleTokenVerifier port перевіряє його через trusted verifier, звіряє local nonce/aud,
   атомарно consume local challenge. Немає альтернативного mint identity з browser claims.
8. SessionPrototype перевіряє активний enrolled User за issuer+sub, створює НОВИЙ випадковий
   session secret (не proof, не OAuth code і не прийнятий browser session ID). Лише session
   повертається до початкового GAS callback і зберігається в memory. Roles беруться з UserRepository
   на кожній операції; logout/expiry/version revocation і RPC tickets — згідно AC-002B.2.

Browser proof передається довіреному login origin, тому компрометація login host/XSS критична.
Не класифікуємо proof як нешкідливий public state. Доказ знання browser proof не є Google identity:
необхідні обидві перевірки. Callback не може самостійно прислати ERP session через postMessage/URL.
Якщо broker redemption уже consume, а GAS упав — без прихованого повтору, вхід завершується error;
новий login лише явною дією користувача. Business writer у цьому probe взагалі не запускається.

COOP/opener: початковий proof handoff потребує доступного opener. Не змінювати isolation headers
наосліп; перевірити exact browser behavior до увімкнення. Після bind можна втратити opener на
Google navigation, бо completion використовує GAS polling, не postMessage від Google popup.
Якщо opener недоступний уже на startup — STOP, не відправляти proof через URL чи '*'.
Reload первинного GAS frame втрачає memory proof/session: fail closed, новий явний login.

Server channel: застосувати окремо reviewed HMAC request authentication із nonce/timestamp/replay
store/body hash та response request binding із AC-002B.2 або погоджену IAM схему; не покладатися
на довільний HTTPS JSON. ScriptApp OAuth access token не видавати за Cloud Run identity token.
Не дозволяти browser вибирати verifier URL, audience, deployment або callback. Весь broker
token storage/replay atomicity/channel і browser harness поки ports/design, не готовий service.

## Піддомен erbes.com.ua без перенесення ERP

Можна виділити, наприклад, login-probe.erbes.com.ua (назва ще НЕ погоджена), залишивши ERP на /exec.
OAuth Authorized JS origin = точний https://login-probe.erbes.com.ua, callback = той самий host +
/oauth/callback. GAS iframe origin не є OAuth JS origin у B; він потрібен тільки exact message guard.
Потрібні підтверджені DNS control/TLS та довірений backend/secret storage. Якщо чинний erbes host
лише static/PHP без підтримуваної server auth бібліотеки/атомарного storage — не вважати його готовим.
Окремий subdomain не ізолює автоматично небезпечні parent-domain cookies; __Host- cookie і відсутність
Domain attribute обов'язкові. Не публікувати login page як iframe основного ERP.

## Точні ресурси для майбутнього ізольованого live probe

Перед створенням власник обирає hosting path та погоджує budget/акаунти/домен.
Пакет P (якщо є придатний власний server):

1. Один HTTPS vhost/subdomain + TLS certificate, DNS record; один ізольований Node backend/process
   login+callback+verifier, pinned maintained auth library. ERP переносити не потрібно.
2. Один захищений durable transactional store для login/state/replay/одноразових redeem (існуюча DB
   придатна лише після перевірки). Не in-memory Map у multi-instance production.
3. Захищені secrets: OAuth client secret, channel key(s), cookie signing/encryption key; без repo/logs.
4. Один Google Cloud project (можна погоджений наявний), Google Auth Platform branding/audience,
   один Web OAuth Client, External Testing і рівно два погоджені test accounts; scopes openid/email/profile.
   JS origin та redirect URI EXACT як вище; підтвердження domain ownership за вимогами Console.
   Client secret тільки backend, не GIS/browser. Окремого Sheets/Drive access для відвідувача не просити.
5. Один окремий standalone GAS probe project/shell deployment, без виробничих repositories/writers,
   minimal begin/complete/logout/read-only permission-probe endpoints. Не змінювати v32/її deployment.
   Stores/challenge/session/crypto adapters і approved GAS→broker transport, не нові реальні ERP users
   без окремого enrollment погодження. Script editors залишаються trusted security boundary.

Пакет C (якщо власний server непридатний): замість пп.1–3 — один Cloud Run service, runtime service
account без Sheets/Drive прав, Artifact Registry repository, build pipeline (Cloud Build якщо обрано),
Secret Manager secrets і Firestore database/transactions для TTL/replay. APIs: run, artifactregistry,
secretmanager, firestore та cloudbuild лише для відповідного build path. Billing/budget alert,
min instances=0, max instances=1 для probe, request/body/rate bounds; один instance не замінює транзакції.
Login origin може бути exact service HTTPS URL для probe, якщо прийнятий Console; це перевірити,
не вважати попередньо зареєстрованим. Для власного піддомену додатково погодити HTTPS custom-domain
frontend/reverse proxy (наприклад Firebase Hosting custom domain + Run rewrite) та DNS/TLS.
Firebase НЕ обов'язковий для протоколу; без потреби його не створювати. Не створювати одночасно P і C.

Ні OAuth Client, ні DNS/TLS, Cloud Run/Firebase/Firestore, секрети чи GAS probe не створені цим Slice.
Production auth bootstrap й RPC request-scope adapter залишаються окремим implementation gate.

## Орієнтовні витрати

Це оцінка порядку величини, не пропозиція провайдера. Для 2 користувачів, до 100 login/month,
коротких callbacks, min instances=0, малого storage/log volume і доступного free tier:

| Варіант | Орієнтир |
|---|---|
| P, наявний оплачений hosting із придатним backend/DB | Додаткові hosting витрати можуть бути $0; фактичні DNS/TLS/DB тарифи невідомі |
| C, невеликий ізольований cloud probe | Планувальний резерв $0–10/month; compute часто малий, але registry/secrets/storage/logs/egress рахуються окремо |
| GIS / OAuth Client | Не закладено окремої usage плати за сам client; не плутати з платними Identity Platform features |

Cloud Run тарифікується за використанням із free allowance [9]. За ілюстративних 100 CPU-seconds,
1 vCPU, 0.5 GiB і наведених list rates $0.000024/vCPU-s та $0.0000025/GiB-s compute ≈ $0.002525
до free tier/rounding; це НЕ повний місячний bill і не оцінка cold starts/builds. Регіон та тариф
перевірити при погодженні. $10 не є hard cap; budget alerts не обмежують billing.
Не перевіряли тарифи існуючого hosting erbes.com.ua. Firebase pricing окремо [10].

## Контроль двох акаунтів і exit criteria

Після окремого дозволу: owner і manager у різних browser profiles, різні verified Google subjects,
explicit account choice, no auto-owner enrollment. Перший ERP_OWNER призначається ручною підтвердженою
процедурою AC-002B.2; другому лише WORKSHOP_MANAGER. Email — довідка, не ключ і не роль.

PASS потребує: actual frame origin/message policy evidence; stable HTTPS login origin; Google callback
state/cookie/PKCE/nonce; maintained signature/aud/iss/expiry verification; single-use broker redeem та
local challenge consume; нова session, expiry/logout/revocation; відсутність credentials у URL/logs;
REPORT_VIEW/LIST для обох і BOM_EDIT deny для workshop; Manufacturing/onEdit deny для обох.
Тільки read-only callbacks, без Generate/Save/Delete/BOM write чи реальних таблиць.

Обов'язкові adversarial checks: stolen public transaction ID без proof, swapped popup/source/origin,
wrong proof, login-CSRF account swap, wrong state/cookie/PKCE/nonce/aud/signature, replay callback/redeem,
expired transaction/session, disabled User, forged roles, direct RPC, broker outage, timeout після consume,
blocked popup/COOP opener loss, reload/login cancel. Safari/Chrome та FedCM/non-FedCM behavior позначати
окремо за фактичним виконанням; offline mocks не дають browser PASS.

Критичні blockers: browser недоступний; actual GAS origin/parent policy не зняті; hosting/DNS/TLS не
підтверджені; OAuth Client не створено; channel/GAS stores/live callback не реалізовані. Це не забороняє
погодити ізольований Client для B з ВЛАСНИМ HTTPS origin, але не дозволяє починати production rollout.

## Локальні зміни й докази

- src/security/login-bridge-prototype.ts: LoginBroker port + orchestrator; reuse IdentityPrototype,
  SessionPrototype; wrong proof/expiry перевіряються до broker; browser READY predicate exact origin/source/id.
- src/security/login-bridge-prototype.test.ts: ізольовані broker/verifier/store, без Google network.
- src/ui/gas-entrypoint-boundary.test.ts: прототип/fixtures не потрапляють у production; exact 20 wrappers deny.
- Цей документ. Попередні specifications/design docs не переписані; це уточнення feasibility після AC-002B.2.

Prototype не містить реального OAuth endpoint, browser window/message implementation або channel adapter.
Fake verifier тут перевіряє composition, не Google signature; наявні RSA tests залишилися незалежно.

Перевірки 2026-10-21:

| Команда | Результат |
|---|---|
| npx vitest run | 836/836 PASS, 44 test files (було 827; додано 9 bridge tests) |
| node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false | PASS |
| npm run build | PASS, локальний dist/Code.gs та assets |

Тести bridge: owner/manager distinct subjects, без token/roles у відповіді, wrong proof/expiry/transaction
до broker, PENDING до TTL без session, invalid token/unknown User без fallback, challenge/redeem replay,
message exact origin/source/id та відхилення browser role assertions. Built VM surface лишилася 20
default-deny wrappers, без LoginBridgePrototype/fixtures. Не тестували реальний callback/CSRF-cookie/
PKCE, reverse message guard, durable stores або browser behavior. Повна B1–B4.2 регресія входить у suite.

Жодних clasp push/deployment, Git commit/push, ACL/Cloud/DNS змін або записів у реальні таблиці.
Web App v32 і її URL незмінні. Результат зупинено для review.

## Офіційні джерела, прочитані 2026-10-21

1. [HtmlService restrictions](https://developers.google.com/apps-script/guides/html/restrictions).
2. [FedCM migration](https://developers.google.com/identity/gsi/web/guides/fedcm-migration).
3. [OAuth JavaScript origins та implicit-flow обмеження](https://developers.google.com/identity/protocols/oauth2/javascript-implicit-flow).
4. [GIS Button popup/redirect](https://developers.google.com/identity/gsi/web/guides/display-button).
5. [Google ID token verification / CSRF](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).
6. [OAuth web server callback](https://developers.google.com/identity/protocols/oauth2/web-server).
7. [OpenID Connect nonce/claims](https://developers.google.com/identity/openid-connect/openid-connect).
8. [google.script.run](https://developers.google.com/apps-script/guides/html/reference/run).
9. [Cloud Run pricing](https://cloud.google.com/run/pricing).
10. [Firebase pricing](https://firebase.google.com/pricing).
