# Передача P8.2/P8.4: подготовка выпуска, участник B

## Финальная интеграция root

Основание общей ветки — stage-7/b-price-alerts. Включён standalone и отключена автогенерация AGENTS.md при next dev, чтобы сохранять согласованные контракты. Node 24 и Inngest Docker images закреплены digest. В Compose добавлен отдельный jobs-profile с HTTP-портом только 127.0.0.1:8288; внутренние gRPC-порты не публикуются. Синтетический KO добавлен для сценария участника A.

Итоговые проверки общей ветки: npm run check прошёл (lint, typecheck, 132 unit-теста, production build); npm run test:integration — 71 тест в 9 файлах прошёл на настоящих изолированных MongoDB replica set; npm audit --omit=dev --audit-level=high — 0 известных runtime-уязвимостей. Исходные 5 high dev-findings описаны в dependency-audit.md.

Linux Docker build ai-stock-market:b-stage-8 прошёл без внешних ключей и env-файлов в контексте. Runtime Node v24.21.0, UID 1000. При пустой production-конфигурации контейнер завершился с ожидаемым кодом 1. С синтетическими параметрами проверки и настоящим локальным MongoDB replica set: health=200, readiness=200; после штатной остановки MongoDB readiness=503 с generic body. В runtime отсутствуют .env.local и work/. Тестовый контейнер удалён; постоянная локальная БД сохранена.

Дополнительные runtime-проверки: Nodemailer -> native Mailpit SMTP -> чтение и удаление только собственного тестового письма; Docker Inngest Dev Server health=200 и регистрация всех 6 функций (digest-dispatch/digest-user/welcome-dispatch/welcome-user/alert-poll/alert-delivery) через локальный Next.js. Расписания и отправка в этих dev-проверках выключены, пользовательские события не отправлялись. Временные процессы остановлены.

Сводка для владельца и A: participant-b-progress.md; порядок запуска и выпуска: production-deployment.md. Внешние аккаунты, реальная Gemini/Finnhub/SMTP/Cloud-проверка, домен и совместная UI-приёмка остаются обязательными до публичного выпуска. P8.4 остаётся частичным.

Дата: 2026-10-14. Вход: ветка этапа 6, действующие env/контракты и сервисные решения. Область: preflight, readiness, deployment-тесты, Dockerfile и документация. Проверяющий — основной агент; A принимает полный пользовательский путь. Это подготовка к выпуску, P8.4 остаётся частично выполненным до реальной среды, HTTPS, секретов, фоновых задач и подтверждённой контрольной доставки.

## Результат и файлы

- `src/server/production.ts` — чистый типизированный валидатор production env без чтения process.env при импорте. Общий для Node 24 CLI и readiness. Возвращает фиксированные сообщения/имена полей без значений секретов.
- `scripts/validate-production.mjs` — CLI, код 0/1, использует нативный TypeScript stripping Node 24. Команда: `node --env-file-if-exists=.env.production.local scripts/validate-production.mjs`.
- `src/app/api/readiness/route.ts` — generic 200/503, валидная конфигурация и MongoDB ping/hello writable replica set; кэш 5 секунд, coalescing, предел ответа 4 секунды. Секреты и топология не раскрываются.
- `tests/deployment/**` — опасные сочетания production-параметров, conditional keys, отказ fixture jobs/local SMTP, секреты в выводе CLI, Node env-file, generic readiness/timeout/coalescing.
- `Dockerfile`, `.dockerignore` — три стадии официального Node 24 bookworm-slim, nonroot runtime, preflight перед стартом; env/secrets исключены из context. Standalone подключён в общей ветке.
- `docs/production-deployment.md` — запуск, обязательные ручные проверки, monitoring/stop/recovery/key rotation и инструкции CI/package/next.config для root.

Дополнительных env-флагов не вводилось. Только включённые market/AI функции требуют соответствующих ключей. Production всегда требует SMTP для email verification; welcome outbox также требует Inngest. Отключённые digest/alert расписания не требуют Gemini и Finnhub, если live market отдельно не включён. Конфигурационные флаги не считаются подтверждением лицензии или доставки. Проверка D2 остаётся человеческим решением до реального выпуска.

## Проверки и ограничения

Промежуточный gate независимого worktree: npm ci, lint, typecheck, 118 unit-тестов (28 deployment/readiness), build и diff-check прошли. Результаты окончательной общей ветки и Docker приведены выше. Реальный production не существует, внешние аккаунты и отправки не создавались.

Перед выпуском закрыть D2/D4/D5, выбрать регион/backup/monitoring, проверить P8.1/P8.3 с A и одну согласованную внешнюю отправку с остановкой расписаний. До этого полный этап 8 готовым не объявлять.
