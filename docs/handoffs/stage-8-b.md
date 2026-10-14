# Передача P8.2/P8.4: подготовка выпуска, участник B

Дата: 2026-10-14. Вход: ветка этапа 6, действующие env/контракты и сервисные решения. Область: preflight, readiness, deployment-тесты, Dockerfile и документация. Проверяющий — основной агент; A принимает полный пользовательский путь. Это подготовка к выпуску, P8.4 остаётся частично выполненным до реальной среды, HTTPS, секретов, фоновых задач и подтверждённой контрольной доставки.

## Результат и файлы

- `src/server/production.ts` — чистый типизированный валидатор production env без чтения process.env при импорте. Общий для Node 24 CLI и readiness. Возвращает фиксированные сообщения/имена полей без значений секретов.
- `scripts/validate-production.mjs` — CLI, код 0/1, использует нативный TypeScript stripping Node 24. Команда: `node --env-file-if-exists=.env.production.local scripts/validate-production.mjs`.
- `src/app/api/readiness/route.ts` — generic 200/503, валидная конфигурация и MongoDB ping/hello writable replica set; кэш 5 секунд, coalescing, предел ответа 4 секунды. Секреты и топология не раскрываются.
- `tests/deployment/**` — опасные сочетания production-параметров, conditional keys, отказ fixture jobs/local SMTP, секреты в выводе CLI, Node env-file, generic readiness/timeout/coalescing.
- `Dockerfile`, `.dockerignore` — три стадии официального Node 24 bookworm-slim, nonroot runtime, preflight перед стартом; env/secrets исключены из context. Требует root-настройку standalone.
- `docs/production-deployment.md` — запуск, обязательные ручные проверки, monitoring/stop/recovery/key rotation и инструкции CI/package/next.config для root.

Дополнительных env-флагов не вводилось. Только включённые market/AI функции требуют соответствующих ключей. Production всегда требует SMTP для email verification; welcome outbox также требует Inngest. Отключённые digest/alert расписания не требуют Gemini и Finnhub, если live market отдельно не включён. Конфигурационные флаги не считаются подтверждением лицензии или доставки. Проверка D2 остаётся человеческим решением до реального выпуска.

## Проверки и ограничения

`npm ci` — успешно; 5 исходных high audit findings, зависимости/lockfile не менялись. `npm run check` — успешно: lint, typecheck, 118 unit-тестов (из них 28 новых deployment/readiness) и production build без credentials. `git diff --check` — успешно. Docker CLI/Engine доступны, однако сборка контейнера здесь намеренно не запускалась: root выполняет окончательный контейнер один раз после объединения stage 7/8 и включения standalone. Реальный production не существует, внешние аккаунты и отправки не создавались.

Следующие шаги root: cherry-pick; включить `output: "standalone"`; добавить при необходимости npm script preflight; запустить финальные unit/integration/build и container smoke. Перед выпуском закрыть D2/D4/D5, выбрать регион/backup/monitoring, проверить P8.1/P8.3 с A и одну согласованную отправку с остановкой расписаний. До этого полный этап 8 готовым не объявлять.
