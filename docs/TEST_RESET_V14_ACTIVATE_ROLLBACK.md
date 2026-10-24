# TEST_RESET v1.4 — Activate / Rollback

Дата: 2026-10-23. Гілка `feature/bom-logic`. Локальна реалізація; Google Apps Script, Drive і Sheets не запускалися. Production Web App v32 та production authorization не змінені.

## Контракт

V1.4 розширює наявний `TestPreparation`; нового reset-сервісу або другого JSON немає. Канонічний ключ — `KUB_TEST_ENV_V1`. Схема version 1 лишається сумісною:

`active` — єдина generation, доступна v1.3 runtime resolver; `previous` — одна попередня active generation; `pending` — кандидат prepare/review. Стан `READY_FOR_ACTIVATION` сам не відкриває pending-файли runtime resolver-у.

`activate(expectedGeneration)` трактує `expectedGeneration` як точний `pending.id`. Усередині ScriptLock він:

1. Повторно підтверджує TEST installation marker, непродукційний Script ID, Google identity активного ADMIN і `USER_MANAGE`.
2. Читає й повністю валідовує поточний JSON. Pending має бути саме expected ID, `READY_FOR_ACTIVATION`, без in-flight, із review; `baseActiveId` мусить збігатися з поточним active ID або null.
3. Заново відкриває всі три кандидатні копії, звіряє точні ID, унікальні канонічні імена, folder, sheet manifests, відсутність відомих hazards і content fingerprints.
4. Заново перевіряє unexpired SAFE receipts для external connections, bound scripts і triggers. Поточні fingerprints, evidence IDs та загальний review commitment повинні точно збігатися із записаним checkpoint. Новий/оновлений receipt вимагає нового `record-review`.
5. Ще раз перевіряє ADMIN перед commit. Одним `setProperty` записує `active=candidate`, `previous=old active`, `pending=null`, а потім вимагає byte-exact readback. Timeout, exception або mismatch повертає `CONFIG_COMMIT_UNCONFIRMED`; прихованого retry/rollback немає.

Production IDs використовуються лише як source provenance і denylist. В active потрапляють тільки три candidate copy IDs. Жодне значення з browser request не визначає identity, роль, safety або file IDs.

## Rollback

`rollback(expectedGeneration)` трактує параметр як точний поточний `active.id`, перевіряє ADMIN/marker/Script ID під ScriptLock і відмовляє, якщо існує pending.

- Після повторної активації target — `previous`. Перед перемиканням усі три target-копії повторно перевіряються за folder, canonical name, ID, sheet manifest, fingerprint, hazards та свіжими SAFE receipts. Evidence ID має збігатися з generation. Потім active/previous міняються місцями одним JSON commit із readback. Це дозволяє контрольовано повернути щойно замінену generation; автоматичної історії глибиною понад один крок немає.
- Після першої активації `previous=null`. Rollback встановлює `active=null, previous=null`, тобто TEST runtime знову fail-closed як неініціалізований. Це не активує жодних інших файлів, тому target-копій для revalidation немає.

Файли current/previous/candidate не видаляються автоматично в жодному сценарії. Folder ID зберігається. Після first-generation rollback три копії лишаються для аудиту, але не мають config pointer і не можуть бути повторно активовані без окремо погодженого recovery/prepare workflow.

При помилці або невизначеному commit не повторювати команду автоматично. Спочатку вручну прочитати `KUB_TEST_ENV_V1`, порівняти expected active/pending ID та провести read-only review. Повторний виклик із уже застосованим expected ID fail-closed.

## Editor-only поверхня

TEST-admin build має рівно дев'ять приватних функцій із суфіксом `_`; Web RPC, `doGet`, меню й triggers відсутні. Нові функції:

- `KUB_TEST_activate_()`
- `KUB_TEST_rollback_()`

Вони читають request лише з ScriptProperties TEST-проєкту під `KUB_TEST_ADMIN_REQUEST_V1`. Функції не приймають аргументів; Rollup wrapper відхиляє їх. Production bundle і TEST runtime build ці entrypoints не імпортують.

## Точна ручна процедура після окремого дозволу

Поточне завдання не дозволяє виконувати ці кроки у GAS. Після окремого погодження використати лише standalone TEST project/TEST-admin target із перевіреним Script ID:

1. Зібрати `npm.cmd run build:test-admin`, звірити Code.gs, manifest і дев'ять private globals. Не використовувати production `.clasp.json` або `npm run push`.
2. Запустити `KUB_TEST_adminIdentity_`, потім `KUB_TEST_readOnlyPreflight_`. Будь-який BLOCKED/UNKNOWN — STOP.
3. Після дозволеного prepare/recovery і незалежного audit зареєструвати receipts, виконати read-only `KUB_TEST_reviewPending_`, потім `KUB_TEST_recordPendingReview_`. Зафіксувати pending ID, три file IDs/fingerprints/evidence IDs та JSON до activation.
4. Для activation записати рівно:

```json
{"version":1,"operation":"activate","expectedGeneration":"ACTUAL_PENDING_GENERATION_ID"}
```

5. Один раз вручну виконати `KUB_TEST_activate_`. Приймати успіх лише за `status:"ACTIVATED"`, точним generation ID і незалежним readback `KUB_TEST_ENV_V1`: pending null, active=очікуваний кандидат, previous=попередній active або null. Не запускати TEST business handlers.
6. Для rollback записати рівно:

```json
{"version":1,"operation":"rollback","expectedGeneration":"ACTUAL_CURRENT_ACTIVE_GENERATION_ID"}
```

7. Один раз виконати `KUB_TEST_rollback_`. Приймати успіх лише за `status:"ROLLED_BACK"` і незалежним config readback. Для першої generation очікується active/previous null; для повторної — active дорівнює раніше перевіреній previous generation.
8. За `CONFIG_COMMIT_UNCONFIRMED`, timeout, stale evidence, conflict або іншу помилку не повторювати дію та нічого не видаляти. Зберегти execution log/config/Drive inventory для recovery review.

Manual receipts мають TTL 15 хвилин. Registration allowlist охоплює лише три sources та IDs поточних active/previous/pending generations, тому receipt для rollback target можна безпечно оновити. Activation/rollback після expiry потребує нового audit receipt; activation також потребує нового `record-review`. ScriptLock захищає тільки цей TEST Apps Script project і не блокує ручні зміни файлів або інші scripts.

## Офлайн-перевірки

Покрито: перша/друга activation, rollback до previous і uninitialized, точні CAS IDs, repeated calls, stale/expired/changed evidence, candidate/target ID/name/fingerprint, missing/ambiguous files, marker/Script ID/ADMIN deny, pending conflict, lock conflict, property failures до/після commit, readback mismatch та збереження всіх копій.

Фактичні результати 2026-10-23: Vitest **991/991 PASS** у 51 файлі; v1.4 admin/preflight/prepare subset **81/81 PASS**; TypeScript `--noEmit --incremental false` PASS; production Rollup, TEST-admin Rollup і TEST-runtime Rollup PASS. Actual TEST-admin bundle VM перевірив рівно дев'ять private globals, відсутність load-time Google calls, public/production wrappers і Sheets mutations у контрольному сценарії.

## Залишкові блокери

- Реальний TEST project, ADMIN enrollment, OAuth consent, source/candidate evidence та Google resource limits не перевірені live.
- Inspector не може автоматично довести повноту bound scripts, triggers і зовнішніх connections; UNKNOWN лишається blocker.
- TEST runtime v1.3 дозволяє лише обмежене readValues; усі бізнес-записи, Manufacturing, Placement, reports, planning, BOM writers та прямі SpreadsheetApp/DriveApp маршрути заблоковані або не інтегровані.
- Немає TEST Web build, production fallback заборонений. Немає автоматичного cleanup, discard чи reactivation orphaned first-generation copies.
- Evidence ledger має ліміт 12 receipts; після кількох generations receipts orphaned copies можуть вичерпати ліміт. Окремий reviewed cleanup/retention механізм ще не реалізовано.
- ScriptProperties/editor ACL лишається адміністративною trust boundary; код editor може змінити код/JSON/ledger.

Статус першого реального TEST_RESET: **NO-GO** до окремого дозволу, live preflight/evidence і завершення безпечної TEST business composition.
