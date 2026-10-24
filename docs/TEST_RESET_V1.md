> v1.4 Activate / Rollback supersedes the earlier execution surface below. Current controlled workflow and private editor functions: [TEST_RESET v1.4](TEST_RESET_V14_ACTIVATE_ROLLBACK.md). Historical stage results remain unchanged.

> Historical stage snapshot: role names below predate the ADMIN / MANAGER migration. Current rules: [role matrix](AC_002B_ROLE_MATRIX.md). Original stage results are unchanged.

# TEST_RESET v1 — isolated TEST administration

Дата: 2026-10-23. Гілка feature/bom-logic. Реалізація локальна, без GAS/Drive виконання.

Модуль: src/admin/test-reset/test-reset.ts; GAS адаптер: gas-test-reset.ts; mocks/tests:
test-reset.test.ts. Немає global TEST_RESET wrapper, register або production import.
Production allowlist лишилася 20 wrappers; VM-тест перевіряє відсутність TEST reset/config у bundle.

## Потік

1. Перевірити USER_MANAGE через чинний PermissionService/HandlerAuthorization із verified identity.
   ERP_OWNER дозволений; WORKSHOP_MANAGER/TECHNOLOGIST/anonymous/inactive — deny. Без owner fallback.
2. Перевірити поточний Script ID та окремий bootstrap marker у ScriptProperties TEST GAS:
   KUB_TEST_INSTALLATION_V1 = {"version":1,"environment":"TEST","scriptId":"<actual-test-script-id>"}.
   Production Script ID явно заборонений. Marker не авторизує користувача самостійно.
3. Отримати ScriptLock; повторити перевірку права; звірити expectedActiveGenerationId.
   Для першого reset обов'язковий null; для наступного — точний поточний generation ID.
4. Знайти ERP_KUB_TEST або створити її. При кількох однойменних папках — BLOCKED, без довільного вибору.
   Saved folder ID повторно перевіряється; недоступна/перейменована/trashed папка не замінюється мовчки.
   Зберегти folderId в тому самому JSON конфігурації, навіть якщо наступна перевірка копій не пройде.
5. Read-only перевірити джерела SpreadsheetConfig MASTER/OPERATIONAL/REPORTING, базові обов'язкові
   аркуші та повний перелік source sheets. Потім рівно по одній File.makeCopy(name,destination) для
   кожного джерела. Не копіювати sheets вибірково, не переносити рядки вручну й не модифікувати джерела.
6. Перевірити нові, різні ID (не production/active/previous), MIME, folder membership, доступність
   SpreadsheetApp.openById та ТОЧНИЙ перелік усіх аркушів від джерела, включно з додатковими аркушами.
7. Просканувати формули/значення/rich-text hyperlinks копій; блокувати URL, production IDs,
   IMPORTRANGE/IMPORT* та інші відомі external-функції. Не виправляти/переприв'язувати посилання автоматично.
   Сканер обмежений 250000 cells/book, batch до ~4096 cells (дуже широкий рядок може бути більшим);
   перевищення ліміту — BLOCKED, не частковий PASS. Діагностика містить тільки координати, не дані.
8. Окремий TRUSTED safety inspector має повернути fresh evidence, прив'язаний до точного fileId:
   externalConnections=SAFE, boundScripts=SAFE, triggers=SAFE + непорожній evidenceId.
   Без нього default inspector повертає UNKNOWN і активація заблокована.
9. Повторно перевірити source sheet structure. Якщо всі перевірки пройшли — одним setProperty
   замінити JSON активної TEST-конфігурації й звірити точний readback.
   active=new generation; previous=колишня active. Старі фізичні файли не видаляються.

## Конфігурація та rollback

KUB_TEST_ENV_V1 — ОДИН JSON зі version=1, environment=TEST, scriptId, folderId, active, previous.
Кожна generation: id, createdAt UTC ISO, files для трьох ролей (id/sourceId/full sheet names), evidence IDs.
Немає окремих active ID properties й жодного fallback до production IDs.
Source IDs зберігаються тільки для provenance, не як runtime targets.
activeConfig() fail-closed перевіряє JSON/контекст/permissions; null active → TEST_NOT_INITIALIZED.
Повертається окрема копія JSON, щоб caller не змінював authoritative state через reference.
Відсутній/пошкоджений/mismatched JSON не замінюється production-конфігурацією.

Один конфіг обмежений 8500 UTF-8 bytes до setProperty. У v1 зберігається лише current/previous
метадата, не необмежена історія. При великій кількості/довжині sheet names config може не вміститись:
це BLOCKED, потрібен окремо погоджений schema/storage slice, не обрізання manifests.

rollback(expectedActiveGenerationId): під тим самим guard/ScriptLock звірити active ID, повторно
відкрити/review previous copies, тоді одним JSON поміняти active і previous місцями.
Немає copy/delete під час rollback. Це повернення TEST pointers, не відкат production даних.
Якщо previous-файли згодом редагувалися, повертаються їхні ПОТОЧНІ дані, не immutable snapshot.
Older-than-previous generations залишаються фізично в ERP_KUB_TEST; автоматичного rollback на них
та автоматичного очищення v1 не має. Назви містять generation ID для окремого ручного inventory.

## Failures і concurrency

- Будь-яка перевірка до commit провалена: active/previous не змінюються; перший run може зберегти лише folderId.
- Часткові copy failures: не повторювати автоматично; зберегти всі вже створені IDs із ResetResult.
  Копії, створення яких завершилося timeout без повернення ID, можуть потребувати ручного Drive inventory
  за унікальною назвою generation. Нічого не видаляти автоматично.
- CONFIG_COMMIT_UNCONFIRMED: setProperty/readback мав невизначений результат. Не припускати, що old/new
  generation активна; без retry/автовідкату. Read-only перевірити exact property та всі target IDs перед
  подальшим TEST використанням. BLOCKED result навмисно повертає activeGenerationId=null.
- Для відомих copy/validation failures фактичний previous active перевіряється окремим activeConfig();
  null у failure result не означає видалення конфігурації.
- ScriptLock серіалізує лише співпрацюючий код цього TEST GAS project; expected generation відхиляє
  застарілий послідовний запуск. Не захищає від іншого script project або прямих ручних змін.
- Lock завжди release в finally; busy → TEST_RESET_BUSY. При runtime termination автоматичний recovery
  не обіцяється; копії залишаються, authoritative property перевіряється вручну.
- Три production файли копіюються послідовно. Це НЕ cross-file consistent snapshot; source writers
  не блокуються. Перевірка sheet structure не доводить відсутності змін значень між копіями.

## Bound scripts, triggers та зовнішні зв'язки

File.makeCopy — повна file-copy операція, а НЕ sandbox або санітизація. Bound scripts можуть бути
частиною контейнера і не відображаються як окремі Drive files. getProjectTriggers не є глобальним
аудитом усіх trigger owners/скриптів. Тому стандартний adapter НЕ заявляє SAFE за цими пунктами.

Trusted inspection повинен документувати linked/bound script source, literals production IDs,
onOpen/onEdit/custom functions, installable triggers різних owners, URL/remote calls, connected data,
named formula functions, copied report metadata/hyperlinks. Неперевірена категорія → UNKNOWN/BLOCKED.
Оглядати контейнер/скрипт через окремо погоджений read-only інструмент/адмінпроцедуру; не виконувати
copied macros, simple triggers або custom functions заради перевірки. Не видавати ScriptLock за
вимкнення скопійованих scripts. Inspector повинен бути адміністративною залежністю, не browser DTO.
Тести використовують явний isolated inspector; це не доказ safety реальних файлів.

Strict v1 може заблокувати копію REPORTING через історичні production URLs/IDs у metadata,
навіть якщо це просто інформативний текст. Це свідомий conservative gate; не вмикати bypass для PASS.
У такому випадку потрібен окремий reviewed TEST sanitization/link-mapping slice, не тихе виправлення v1.
Навіть неактивна копія не вважається безпечною для ручного відкриття/виконання; копіювання може
зберегти формули/automation. Немає заяви про відсутність зовнішніх побічних ефектів реального makeCopy.

Офіційні джерела:
[File.makeCopy](https://developers.google.com/apps-script/reference/drive/file#makecopyname,-destination),
[bound scripts](https://developers.google.com/apps-script/guides/bound),
[ScriptApp trigger scope](https://developers.google.com/apps-script/reference/script/script-app#getProjectTriggers()).

## Адміністративний запуск — НЕ ВИКОНУВАТИ ЗАРАЗ

Модуль поки не має GAS admin bundle/entrypoint. Майбутня окрема TEST-only composition має:
підтвердити standalone TEST Script ID, встановити bootstrap marker вручну, підключити реальну
verified identity до HandlerAuthorization, передати trusted safety inspector, викликати
createGasTestReset(authorization, inspector) із TEST editor admin workflow і очікуваним generation ID.
Жодного public google.script.run/reset wrapper, onOpen menu action або production register.
execution=TEST_ADMIN_EDITOR — internal composition invariant, не незалежний доказ виклику з редактора;
безпечність забезпечують відсутність RPC/export bundle, script allow marker, explicit production deny
та PermissionService. Кодредактори залишаються trusted administrators, їх не ізолює browser роль.

AC-002 production IdentityProvider досі default-deny: не підключати test user чи EffectiveUser fallback,
щоб запустити reset. Цей slice не інтегрує TEST runtime repositories із production factories і не
послаблює їхню авторизацію. Перед live TEST reset потрібні окреме погодження та повний safety evidence.
Повні копії production містять справжні дані: їх не можна вважати synthetic fixtures; ACL/privacy
папки та повноваження адміністраторів мають бути перевірені окремо. ACL тут не змінюються.

Реального копіювання, видалення, GAS запусків, clasp push, deployment, Git commit/push не виконано.
Web App v32 незмінна. Незавершені локальні AC-002B.4 артефакти не інтегровані й не публікувалися.

## Перевірки 2026-10-23

| Перевірка | Результат |
|---|---|
| TEST_RESET mock suite | 26/26 PASS |
| Vitest run src (Node.js 22.16.0) | 872/872 PASS, 46 files |
| TypeScript --noEmit --incremental false | PASS |
| npm run build (Rollup + assets) | PASS |
| Actual production bundle VM | Exact 20 wrappers; TEST_RESET/factories/config absent, default-deny збережено |

Mock coverage: перший/repeated reset, full sheet manifest, folder reuse/ambiguity, copy failures,
new IDs, missing sheets/wrong open ID, external risks, unknown scripts/unsafe triggers, evidence ID binding,
partial initial failure, USER_MANAGE для ERP_OWNER та deny інших ролей/anonymous/inactive,
production/wrong/missing installation deny, malformed/prod-ID config deny, stale/concurrent calls,
source structure changes, readback/commit uncertainty без retry, UTF-8 cap, retained files і rollback,
реальний GAS adapter contract File.makeCopy із mock Drive/Properties/Spreadsheet/ScriptLock.

Перевірки Google файлів/реальних trigger owners/bound scripts НЕ виконувалися. Safety PASS у mocks
не є дозволом на реальний TEST_RESET. Наступний крок — незалежний review і окреме погодження TEST
admin composition/ідентичності/ризиків, без послаблення AC-002.
