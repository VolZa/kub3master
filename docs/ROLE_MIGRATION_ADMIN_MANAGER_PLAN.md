> ???? ????? ????????? ?? ????????????????????? snapshot. ???????? ?????????? ????????? ??????? slice; ?????????? ?????????: [???? ????????](ROLE_MIGRATION_ADMIN_MANAGER_REPORT.md).

# Окрема мінімальна міграція ролей: ADMIN / MANAGER

Статус: PREPARED — план, не реалізація. Дата: 2026-10-23.
Остаточне рішення власника заміняє попередню рольову модель для наступної міграції.
TEST_RESET v1.1 завершений у своєму обсязі; його код і результати цим документом не змінюються.

## Цільова модель

Лише дві системні ролі:

| Роль | Призначення |
|---|---|
| ADMIN | Власник/адміністратор: усі визначені системні права, включно з TEST-платформою й TEST_RESET |
| MANAGER | Директор/начальник цеху: керування виробництвом, плануванням і звітністю в PRODUCTION |

Посада не є окремою роллю. ERP_OWNER, WORKSHOP_MANAGER, TECHNOLOGIST не залишаються
активними/зарезервованими ролями після міграції. Нові ролі — лише за наступними явними рішеннями.
ADMIN не виводиться з Drive owner, GAS USER_DEPLOYING, email/browser claims або першого входу.

## Мінімальний локальний slice

1. Role union: лише ADMIN | MANAGER; strict UserRepository parser приймає тільки ці значення.
2. PermissionService: ADMIN отримує всі ЯВНО ВИЗНАЧЕНІ permissions. Невідомий permission завжди deny,
   включно з ADMIN. MANAGER отримує REPORT_GENERATE/VIEW/SAVE/LIST/RENAME/DELETE у PRODUCTION.
   USER_MANAGE, BOM_EDIT, TECHNOLOGY_EDIT — тільки ADMIN у чинному наборі permissions.
3. TEST-admin composition та TEST_RESET вимагають USER_MANAGE від ADMIN; MANAGER не отримує
   TEST admin/preflight/reset доступу. KUB_TEST_ENV_V1, джерела, guards і JSON generation не змінюються.
4. Узгодити archive-management-web policy з тими самими двома ролями; не створювати другу модель
   довіри та не підключати сумісні role aliases. Production identity лишається default-deny.
5. Оновити isolated fixtures/tests, актуальну матрицю та runbook templates. Історичні audit/results
   позначити попередньою моделлю, не переписувати їхні результати під нові назви.

Цільові файли: src/security/permission-service.ts, property-user-repository.ts; поточні security tests;
src/ui/archive-management-web.ts і archive tests; src/admin/test-reset mocks/tests/comments;
docs/AC_002B_ROLE_MATRIX.md та актуальні TEST-admin instructions. Token/broker claims не отримують roles.

## Виробництво та планування

Право MANAGER на ці функціональні області погоджено власником. Проте поточний код не має повного
набору операційних permissions; createManufacturingFromWeb та onEdit мають policy hold.
Міграція назв не повинна автоматично перетворити null guard на дозвіл або REPORT_VIEW на write permission.

Перед увімкненням окремо зіставити фактичні create/cancel/placement/synchronization/plan operations
із явними permissions і відповідними server handlers. Додати ці permissions ADMIN та MANAGER
відповідно до погоджених областей, зберігаючи окремі межі trigger/service/admin контекстів.
Нереалізовану Planning функціональність не вигадувати. Цей наступний integration slice не входить
до мінімальної міграції назв; незняті holds мають бути явно відображені у фінальному звіті.

## Дані користувачів і сесії

Локальні fixture replacements: ERP_OWNER → ADMIN; WORKSHOP_MANAGER → MANAGER.
Це НЕ автоматична міграція реальних assignments. Для кожного реального issuer+subject потрібен
явно затверджений запис нової ролі. TECHNOLOGIST не має автоматичного відповідника — без рішення deny.
Невідомі/старі role values не приймати через aliases/fallback; parser має fail closed.

Перед окремо дозволеною міграцією directory зберегти захищений baseline, перевірити subject/active,
погоджений mapping, оновити authorizationVersion і відкликати старі сесії/tickets. Узгодити code та
directory versions у maintenance window: тимчасовий ACCESS_DENIED допустимий, приховане розширення
прав — ні. Не виконувати зміни production/test users лише на підставі цього плану.
Rollback коду потребує узгодженого directory baseline та revocation; не відновлювати старі сесії.

## Перевірки та exit gate

- ADMIN: усі визначені permissions; невідомий permission — deny.
- MANAGER: звіти дозволені; USER_MANAGE/TEST admin/TEST_RESET/BOM_EDIT/TECHNOLOGY_EDIT — deny.
- Anonymous, unknown/inactive/revoked User, fabricated identity та browser roles — deny.
- Старі ERP_OWNER/WORKSHOP_MANAGER/TECHNOLOGIST значення — deny, без compatibility aliases.
- Direct RPC bypass, expiry/replay, актуальний UserRepository та version revocation збережені.
- Production allowlist незмінна; TEST-admin bundle — лише дві read-only editor diagnostics,
  без makeCopy/write/production handlers. Existing TEST_RESET v1 та B1–B4.2 regressions збережені.
- Vitest, TypeScript, обидві Rollup збірки — PASS; кількість тестів фіксувати фактичну,
  не змінювати expectations заради попереднього числового baseline.

Зараз змінено тільки цей план. Поточний код ще використовує попередні назви ролей.
Наступний окремий крок — локальна реалізація описаної мінімальної міграції, без deployment,
реальних assignments, Git commit/push або послаблення default-deny.
Цей план не знімає RESET_NO-GO, operational holds або production identity blockers.
