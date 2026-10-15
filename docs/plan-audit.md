# Проверка выполнения плана v1.2: локальная демонстрация A+B

Дата: 2026-10-15. Основание: [план v1.2](implementation-plan.md), особенно раздел 4, [решения владельца](product-decisions.md), [назначение текущей проверки](tasks/demo-acceptance.md) и [контракт передачи](../agents/contracts/handoff.md). Снимок: ветка `codex/p8-demo-acceptance`; базовый HEAD на момент подготовки — `2d40f5d`. Последующие коммиты и окончательный результат проверок координатор фиксирует в итоговом handoff.

## Область и назначение

ID аудита: P8.1–P8.5 с проверкой всех 47 задач P0.1–P8.5. Координатор — B; интерфейс и пользовательскую приёмку ведёт роль A, сервер и автоматизацию — B. Разрешённые изменения финализации: данный документ, quick path/ссылки README и историческая пометка QA участника A. Входы — текущий код, тесты и существующие handoff. Результат — полная матрица, которая отделяет наличие реализации, автоматические доказательства и фактическую ручную приёмку и её ограничения. Документ не меняет API, модель данных или объём продукта.

Текущая поставка — бесплатная локальная v1: собственный синтетический US equity/USD набор, русский UI, настоящие аккаунты/ownership/MongoDB, детерминированная сводка и SMTP Mailpit. Fixture-сводка не вызывает Gemini и не является ответом языковой модели. Облачные аккаунты, live Finnhub/Gemini/SMTP, публичный домен и HTTPS-размещение относятся к отдельному будущему режиму. Первая установка пакетов/образов и необязательные TradingView-виджеты требуют Интернета. Письма демозапуска остаются в Mailpit; расписания выключены по умолчанию.

## Как читать доказательства

- **Реализация** означает наличие указанного кода или принятого решения. Это не утверждение, что все критерии задачи приняты.
- **Авто** указывает существующий тест и проверяемое поведение. Интеграционные проверки используют изолированный настоящий MongoDB replica set; захваченный тестовый транспорт не равен ручному письму в Mailpit.
- **M1–M14** — результаты текущего ручного/HTTP-прогона основного агента ниже. PASS применяется только к перечисленным наблюдениям; частичные пункты имеют точные ограничения. Lint, TypeScript и build не доказывают внешний вид или пользовательский путь.
- **Условно отложено** относится только к P7.5: условие включения volume-данных ещё не принято; этот тип правила намеренно отклоняется.

### Журнал автоматических запусков текущего аудита

| Проверка | Статус / границы доказательства |
| --- | --- |
| Targeted ESLint восьми UI-файлов с `--max-warnings 0` | PASS: семь компонентов из раздела исправлений и `src/app/page.tsx`. |
| `npx tsc --noEmit` | PASS после UI-исправлений и добавления индексов/графика. |
| `git diff --check` | PASS после UI-исправлений; предупреждение Git о CRLF/LF не является ошибкой whitespace. |
| `npm run check` текущей итоговой ветки | **PASS**: lint, Next typegen/TypeScript, 151 unit-тест в 11 файлах, production build 14 страниц; exit 0. |
| `npm run test:integration` текущей итоговой ветки | **PASS: 90/90 тестов в 12 файлах**, изолированный MongoDB replica set. Результат текущего аудита передан координатором. |
| `npm audit --omit=dev --audit-level=high` текущей итоговой ветки | **PASS: 0 runtime-уязвимостей**, результат текущего запуска координатора. |

Предыдущая объединённая версия имела успешные 150 unit-тестов, 79 интеграционных тестов и CI; это историческое доказательство из [handoff интеграции](handoffs/integration-ab-local-demo.md), а не результат полного запуска после текущих исправлений. Интеграционные файлы матрицы включены в текущие 90/90; unit/build также прошли текущий полный check. Наличие теста само по себе не подменяет результат запуска.

## Матрица всех задач

Локальный функциональный сценарий подтверждён M2–M12 в указанных границах. Расширенная UI-матрица неполная (M13); это дополнительный объём проверки, а не заявление полного WCAG/E2E. Полный gate и локальный stop/restart подтверждены; детали — в журнале и M14. Роль в столбце A/B — ведущий исполнитель из раздела 4 плана; второй участник принимает интерфейс своей зоны. Обозначения `src/...`, `tests/...` и `.github/...` в ссылках относятся к корню репозитория.

### Этап 0. Решения и подготовка

| ID | A/B | Объект | Существующие файлы | Автоматическое доказательство / остаток приёмки |
| --- | --- | --- | --- | --- |
| P0.1 | A | Рынок, валюта, язык и аудитория локальной v1 | [docs/product-decisions.md](../docs/product-decisions.md)<br>[docs/participant-a-stage-0.md](../docs/participant-a-stage-0.md) | Документированное решение владельца 15.10: синтетический US equity/USD, русский UI, учебный проект. Автотест не заменяет продуктового решения. |
| P0.2 | B | Источник и интервалы | [src/server/config.ts](../src/server/config.ts)<br>[src/server/market/cache.ts](../src/server/market/cache.ts)<br>[src/server/alerts/evaluate.ts](../src/server/alerts/evaluate.ts) | [tests/market/client.test.ts](../tests/market/client.test.ts)<br>[tests/alerts/evaluate.test.ts](../tests/alerts/evaluate.test.ts)<br>Кэш/срок действия, квоты и stale-порог; live-лицензия и задержка вне локальной v1. |
| P0.3 | B | Нулевой бюджет и локальные сервисы | [compose.yaml](../compose.yaml)<br>[scripts/demo.mjs](../scripts/demo.mjs)<br>[docs/local-services.md](../docs/local-services.md) | [tests/deployment/demo.test.ts](../tests/deployment/demo.test.ts)<br>Изоляция от унаследованных облачных параметров проверена. Запуск — [M1](#m1); финальная остановка/restart — [M14](#m14). |
| P0.4 | A | Основные экраны | [docs/participant-a-interface-requirements.md](../docs/participant-a-interface-requirements.md)<br>[src/components/app-shell.tsx](../src/components/app-shell.tsx) | Маршруты существуют. Основной путь зарегистрированного пользователя проверен [M2–M12](#m2); полная матрица всех экранов не выполнена — [M13](#m13). |
| P0.5 | A | Приёмка и тестовые тикеры | [docs/participant-a-stage-0.md](../docs/participant-a-stage-0.md)<br>[src/server/market/fixtures.ts](../src/server/market/fixtures.ts) | [tests/market/client.test.ts](../tests/market/client.test.ts)<br>Синтетические семь тикеров/псевдонимов проверены API; Apple/AAPL проверен UI [M4](#m4). Локальная приёмка [M2–M12](#m2), границы [M13](#m13). |

### Этап 1. Каркас и качество

| ID | A/B | Объект | Существующие файлы | Автоматическое доказательство / остаток приёмки |
| --- | --- | --- | --- | --- |
| P1.1 | A | Next.js App Router и зависимости | [package.json](../package.json)<br>[package-lock.json](../package-lock.json)<br>[src/app/layout.tsx](../src/app/layout.tsx) | Next.js/lockfile и команды существуют; приложение работает [M1](#m1). Полный check PASS: lint/typegen/TypeScript, 151 unit-тест и production build. |
| P1.2 | A | Стили, тема, компоненты, адаптивный каркас | [src/app/globals.css](../src/app/globals.css)<br>[src/components/ui/button.tsx](../src/components/ui/button.tsx)<br>[src/components/app-shell.tsx](../src/components/app-shell.tsx) | Targeted TypeScript/ESLint PASS; /demo 390×844 и desktop 1264 проверены [M13](#m13). Все экраны/200% не проверены. |
| P1.3 | B | Доменные DTO и серверная конфигурация | [src/contracts/index.ts](../src/contracts/index.ts)<br>[src/server/config.ts](../src/server/config.ts)<br>[src/server/db/index.ts](../src/server/db/index.ts) | [tests/contracts/contracts.test.ts](../tests/contracts/contracts.test.ts)<br>[tests/deployment/production.test.ts](../tests/deployment/production.test.ts)<br>Ownership не принимается от клиента, даты/лимиты/условные production-настройки валидируются. |
| P1.4 | B | Env, команды и CI | [.env.example](../.env.example)<br>[.gitignore](../.gitignore)<br>[package.json](../package.json)<br>[.github/workflows/ci.yml](../.github/workflows/ci.yml) | [tests/deployment/production.test.ts](../tests/deployment/production.test.ts)<br>[tests/server/http.test.ts](../tests/server/http.test.ts)<br>CLI не печатает значения секретов; HTTP скрывает произвольные исключения; runtime audit PASS. Полный check PASS; CI финального commit фиксирует координатор. |
| P1.5 | A | Пустые состояния, ошибки, навигация | [src/app/error.tsx](../src/app/error.tsx)<br>[src/app/global-error.tsx](../src/app/global-error.tsx)<br>[src/app/not-found.tsx](../src/app/not-found.tsx)<br>[src/components/market/market-empty-state.tsx](../src/components/market/market-empty-state.tsx) | Пустые правила после удаления подтверждены [M11](#m11), Tab/focus ring — [M13](#m13). Общие error/retry/skip-link реализованы; их полный браузерный обход не выполнен. |

### Этап 2. Аккаунт и профиль

| ID | A/B | Объект | Существующие файлы | Автоматическое доказательство / остаток приёмки |
| --- | --- | --- | --- | --- |
| P2.1 | B | MongoDB, Better Auth, профиль | [src/server/auth/index.ts](../src/server/auth/index.ts)<br>[src/server/auth/session.ts](../src/server/auth/session.ts)<br>[src/server/profile/repository.ts](../src/server/profile/repository.ts) | [tests/integration/auth-profile.test.ts](../tests/integration/auth-profile.test.ts)<br>[tests/integration/auth-validation.test.ts](../tests/integration/auth-validation.test.ts)<br>HttpOnly cookie, хеш пароля, постоянная сессия, выход, серверное имя покрыты интеграцией; регистрация с созданием сессии — [M2](#m2), verified — [M3](#m3). |
| P2.2 | A | Формы профиля | [src/components/profile/profile-settings-preview.tsx](../src/components/profile/profile-settings-preview.tsx)<br>[src/app/api/profile/route.ts](../src/app/api/profile/route.ts) | [tests/contracts/contracts.test.ts](../tests/contracts/contracts.test.ts)<br>[tests/integration/auth-profile.test.ts](../tests/integration/auth-profile.test.ts)<br>API PATCH→GET профиля и неверный timezone 400/fields подтверждены [M8](#m8); timezone/consent сохранены UI. Полная анкета и фокус всех ошибок отдельно не прогонялись. |
| P2.3 | B | Сессия и изоляция владельца | [src/server/auth/session.ts](../src/server/auth/session.ts)<br>[src/server/http.ts](../src/server/http.ts)<br>[src/server/watchlist/repository.ts](../src/server/watchlist/repository.ts)<br>[src/server/alerts/repository.ts](../src/server/alerts/repository.ts) | [tests/integration/auth-profile.test.ts](../tests/integration/auth-profile.test.ts)<br>[tests/integration/watchlist.test.ts](../tests/integration/watchlist.test.ts)<br>[tests/integration/alerts.test.ts](../tests/integration/alerts.test.ts)<br>Поддельная cookie, подмена userId, чужие записи/CSRF покрыты 90/90. Runtime smoke: foreign Origin 403, no session 401, unknown fields 400 — [M2](#m2). |
| P2.4 | A | Ошибки входа и восстановление | [src/components/auth/auth-form.tsx](../src/components/auth/auth-form.tsx)<br>[src/components/auth/password-reset-request.tsx](../src/components/auth/password-reset-request.tsx)<br>[src/components/auth/reset-password-form.tsx](../src/components/auth/reset-password-form.tsx) | [tests/integration/auth-profile.test.ts](../tests/integration/auth-profile.test.ts)<br>[tests/integration/auth-email.test.ts](../tests/integration/auth-email.test.ts)<br>[tests/integration/auth-validation.test.ts](../tests/integration/auth-validation.test.ts)<br>Дубли/пароли/сессия и одноразовый reset с отзывом сессий покрыты интеграцией. Регистрация/verification наблюдались [M2](#m2), [M3](#m3); recovery UI отдельно не прогонялся. |
| P2.5 | A | Согласие, зона и время сводки | [src/components/profile/profile-settings-preview.tsx](../src/components/profile/profile-settings-preview.tsx)<br>[src/app/api/preferences/digest/route.ts](../src/app/api/preferences/digest/route.ts) | [tests/contracts/contracts.test.ts](../tests/contracts/contracts.test.ts)<br>[tests/integration/auth-profile.test.ts](../tests/integration/auth-profile.test.ts)<br>[tests/digest/schedule.test.ts](../tests/digest/schedule.test.ts)<br>Default opt-out, IANA/HH:mm/DST покрыты тестами. В UI сохранены Asia/Qyzylorda и явное согласие [M8](#m8); HTTP-отписка подтверждена [M10](#m10). |

### Этап 3. Дашборд и рынок

| ID | A/B | Объект | Существующие файлы | Автоматическое доказательство / остаток приёмки |
| --- | --- | --- | --- | --- |
| P3.1 | A | Дашборд: индексы, карта, котировки, новости | [src/app/page.tsx](../src/app/page.tsx)<br>[src/components/market/dashboard-data.tsx](../src/components/market/dashboard-data.tsx)<br>[src/components/market/tradingview-widgets.tsx](../src/components/market/tradingview-widgets.tsx) | [tests/integration/stock-api.test.ts](../tests/integration/stock-api.test.ts)<br>TV config фиксирует SP:SPX / DJ:DJI / NASDAQ:IXIC; отдельные AAPL/MSFT/NVDA сохранены. Основной desktop просмотр [M5](#m5); наблюдение каждого индексного значения не заявлено. |
| P3.2 | A | Контролируемые TradingView-виджеты | [src/components/market/tradingview-widgets.tsx](../src/components/market/tradingview-widgets.tsx) | Fixed script host, height bounds, theme, iframe title, timeout/retry. Внешний AAPL chart реально загрузился [M5](#m5); все темы/offline виджетов отдельно не проверены. |
| P3.3 | B | Finnhub и fixture-адаптер | [src/server/market/transport.ts](../src/server/market/transport.ts)<br>[src/server/market/cache.ts](../src/server/market/cache.ts)<br>[src/server/market/normalization.ts](../src/server/market/normalization.ts)<br>[src/server/rate-limit.ts](../src/server/rate-limit.ts) | [tests/market/client.test.ts](../tests/market/client.test.ts)<br>[tests/integration/rate-limit.test.ts](../tests/integration/rate-limit.test.ts)<br>5s timeout, header token, quota/lease, coalescing, cache, 429 и ошибочные ответы; live-сеть/аккаунт не проверены. |
| P3.4 | A | Источник и время собственных данных | [src/components/market/dashboard-data.tsx](../src/components/market/dashboard-data.tsx)<br>[src/components/stocks/stock-detail.tsx](../src/components/stocks/stock-detail.tsx)<br>[src/components/watchlist/watchlist.tsx](../src/components/watchlist/watchlist.tsx) | [tests/market/client.test.ts](../tests/market/client.test.ts)<br>[tests/integration/stock-api.test.ts](../tests/integration/stock-api.test.ts)<br>Source/ISO время проверены API; собственная цена 100, её source/time и отдельный внешний график 343.94 наблюдались [M4](#m4), [M5](#m5). Это значения конкретного прогона, не обещание актуальной цены. |
| P3.5 | A | Узкий экран и отказ поставщика | [src/app/globals.css](../src/app/globals.css)<br>[src/components/market/tradingview-widgets.tsx](../src/components/market/tradingview-widgets.tsx)<br>[src/components/market/dashboard-data.tsx](../src/components/market/dashboard-data.tsx) | [tests/market/client.test.ts](../tests/market/client.test.ts)<br>Provider timeout/errors покрыты тестами; mobile /demo 390×844 без переполнения [M13](#m13). Полная UI/offline матрица всех экранов не выполнена — [M6](#m6). |

### Этап 4. Поиск и акция

| ID | A/B | Объект | Существующие файлы | Автоматическое доказательство / остаток приёмки |
| --- | --- | --- | --- | --- |
| P4.1 | A | Поиск по тикеру/названию | [src/components/stocks/stock-search.tsx](../src/components/stocks/stock-search.tsx)<br>[src/app/api/stocks/search/route.ts](../src/app/api/stocks/search/route.ts) | [tests/market/client.test.ts](../tests/market/client.test.ts)<br>[tests/market/normalization.test.ts](../tests/market/normalization.test.ts)<br>[tests/integration/stock-api.test.ts](../tests/integration/stock-api.test.ts)<br>Семь aliases проверены API, Apple→1 AAPL проверен UI [M4](#m4). Debounce350ms/AbortController реализованы; все гонки ввода браузером отдельно не воспроизводились. |
| P4.2 | B | Символ, биржа и equity | [src/contracts/index.ts](../src/contracts/index.ts)<br>[src/server/market/normalization.ts](../src/server/market/normalization.ts) | [tests/contracts/contracts.test.ts](../tests/contracts/contracts.test.ts)<br>[tests/market/normalization.test.ts](../tests/market/normalization.test.ts)<br>BRK.B, equity/ETF, max5 и биржа покрыты тестами; aliases: 7 и результаты runtime smoke — [M4](#m4). |
| P4.3 | A | Карточка акции и отдельный график | [src/app/stocks/[symbol]/page.tsx](../src/app/stocks/[symbol]/page.tsx)<br>[src/components/stocks/stock-detail.tsx](../src/components/stocks/stock-detail.tsx)<br>[src/components/market/tradingview-widgets.tsx](../src/components/market/tradingview-widgets.tsx) | [tests/integration/stock-api.test.ts](../tests/integration/stock-api.test.ts)<br>[tests/market/client.test.ts](../tests/market/client.test.ts)<br>Цена100/source/time, компания/новости и внешний график 343.94 наблюдались [M4](#m4), [M5](#m5). Nullable показатели имеют «нет данных»; синтетическая история не создаётся. |
| P4.4 | A | Unknown/unavailable/quota состояния | [src/components/stocks/stock-search.tsx](../src/components/stocks/stock-search.tsx)<br>[src/components/stocks/stock-detail.tsx](../src/components/stocks/stock-detail.tsx)<br>[src/components/market/market-empty-state.tsx](../src/components/market/market-empty-state.tsx) | [tests/integration/stock-api.test.ts](../tests/integration/stock-api.test.ts)<br>[tests/market/client.test.ts](../tests/market/client.test.ts)<br>400/404/429/provider errors покрыты тестами; неизвестный символ подтверждён runtime API [M6](#m6). Все error states в UI отдельно не воспроизводились. |
| P4.5 | A | Переходы поиск → акция → список | [src/components/stocks/stock-search.tsx](../src/components/stocks/stock-search.tsx)<br>[src/components/stocks/stock-detail.tsx](../src/components/stocks/stock-detail.tsx)<br>[src/app/watchlist/page.tsx](../src/app/watchlist/page.tsx) | [tests/integration/watchlist.test.ts](../tests/integration/watchlist.test.ts)<br>Apple→звезда→карточка AAPL→watchlist: 1 подтверждено [M4](#m4), [M7](#m7). |

### Этап 5. Личный список

| ID | A/B | Объект | Существующие файлы | Автоматическое доказательство / остаток приёмки |
| --- | --- | --- | --- | --- |
| P5.1 | B | WatchlistItem и уникальность | [src/server/watchlist/repository.ts](../src/server/watchlist/repository.ts)<br>[src/contracts/index.ts](../src/contracts/index.ts) | [tests/integration/watchlist.test.ts](../tests/integration/watchlist.test.ts)<br>15 одновременных добавлений дают одну запись, одно увеличение counter; ограничение 50 и освобождение слота проверяются. |
| P5.2 | B | Защищённые операции списка | [src/app/api/watchlist/route.ts](../src/app/api/watchlist/route.ts)<br>[src/app/api/watchlist/[symbol]/route.ts](../src/app/api/watchlist/[symbol]/route.ts)<br>[src/server/watchlist/repository.ts](../src/server/watchlist/repository.ts) | [tests/integration/watchlist.test.ts](../tests/integration/watchlist.test.ts)<br>Сессия/Origin/owner, нормализация, неизвестная акция, повторные POST/DELETE и сохранение после нового входа. |
| P5.3 | A | Кнопки списка из состояния БД | [src/components/stocks/stock-search.tsx](../src/components/stocks/stock-search.tsx)<br>[src/components/stocks/stock-detail.tsx](../src/components/stocks/stock-detail.tsx) | [tests/integration/watchlist.test.ts](../tests/integration/watchlist.test.ts)<br>GET/POST/DELETE и persistence покрыты интеграцией. Звезда Apple/AAPL и watchlist: 1 проверены [M7](#m7); отдельный reload/new login UI в этом прогоне не заявлен. |
| P5.4 | A | Список, котировки, сортировка и пустота | [src/components/watchlist/watchlist.tsx](../src/components/watchlist/watchlist.tsx)<br>[src/app/watchlist/page.tsx](../src/app/watchlist/page.tsx) | [tests/integration/watchlist.test.ts](../tests/integration/watchlist.test.ts)<br>[tests/integration/stock-api.test.ts](../tests/integration/stock-api.test.ts)<br>Watchlist: 1 подтверждён [M7](#m7). Доступны sort новые/старые/тикер/компания; P5.4 не требует sort по цене. Все sort/pagination варианты вручную не прогонялись. |
| P5.5 | A | Повтор и неопределённый ответ мутации | [src/components/stocks/stock-search.tsx](../src/components/stocks/stock-search.tsx)<br>[src/components/stocks/stock-detail.tsx](../src/components/stocks/stock-detail.tsx)<br>[src/components/watchlist/watchlist.tsx](../src/components/watchlist/watchlist.tsx) | [tests/integration/watchlist.test.ts](../tests/integration/watchlist.test.ts)<br>Конкуренция/idempotency covered 90/90; runtime повтор add подтверждён [M7](#m7). Pending/reload защита UI реализована; потеря ответа UI отдельно не инъецировалась [M6](#m6). |

### Этап 6. Сводка и email

| ID | A/B | Объект | Существующие файлы | Автоматическое доказательство / остаток приёмки |
| --- | --- | --- | --- | --- |
| P6.1 | B | Welcome и ежедневные Inngest-задания | [src/server/inngest/functions.ts](../src/server/inngest/functions.ts)<br>[src/server/notifications/welcome-outbox.ts](../src/server/notifications/welcome-outbox.ts)<br>[src/app/api/inngest/route.ts](../src/app/api/inngest/route.ts) | [tests/integration/digest.test.ts](../tests/integration/digest.test.ts)<br>[tests/integration/auth-email.test.ts](../tests/integration/auth-email.test.ts)<br>[tests/digest/inngest.test.ts](../tests/digest/inngest.test.ts)<br>Durable welcome/signature покрыты интеграцией; отдельное welcome-письмо наблюдалось в Mailpit [M3](#m3). Runtime задания — [M1](#m1); внешняя Cloud-среда вне v1. |
| P6.2 | B | Новости только своего списка/общий рынок | [src/server/digest/market-news.ts](../src/server/digest/market-news.ts)<br>[src/server/digest/news.ts](../src/server/digest/news.ts)<br>[src/server/digest/processor.ts](../src/server/digest/processor.ts) | [tests/integration/digest-market.test.ts](../tests/integration/digest-market.test.ts)<br>[tests/digest/content.test.ts](../tests/digest/content.test.ts)<br>Своя сохранённая watchlist; пустой список берёт общий synthetic рынок; фильтруются даты/дубли/unsafe URLs. |
| P6.3 | B | Ограниченный вход и проверяемый пересказ | [src/server/digest/summary.ts](../src/server/digest/summary.ts)<br>[src/server/digest/news.ts](../src/server/digest/news.ts) | [tests/digest/content.test.ts](../tests/digest/content.test.ts)<br>[tests/integration/digest.test.ts](../tests/integration/digest.test.ts)<br>Неизвестные source IDs/неструктурный AI output отвергаются; fixture детерминирован. Качество live Gemini не заявляется. |
| P6.4 | A | Безопасное письмо с источниками/настройками | [src/server/notifications/render.ts](../src/server/notifications/render.ts)<br>[src/server/digest/processor.ts](../src/server/digest/processor.ts)<br>[src/components/profile/digest-preview.tsx](../src/components/profile/digest-preview.tsx) | [tests/digest/content.test.ts](../tests/digest/content.test.ts)<br>[tests/integration/digest.test.ts](../tests/integration/digest.test.ts)<br>HTML/plaintext/escaping/source links/max headlines покрыты тестами. Preview наблюдался в UI; реальная локальная сводка есть в Mailpit [M9](#m9). |
| P6.5 | B | Consent, timezone, retries и журнал | [src/server/digest/schedule.ts](../src/server/digest/schedule.ts)<br>[src/server/digest/processor.ts](../src/server/digest/processor.ts)<br>[src/server/notifications/send.ts](../src/server/notifications/send.ts)<br>[src/server/notifications/repository.ts](../src/server/notifications/repository.ts) | [tests/digest/schedule.test.ts](../tests/digest/schedule.test.ts)<br>[tests/integration/digest.test.ts](../tests/integration/digest.test.ts)<br>[tests/integration/demo-digest.test.ts](../tests/integration/demo-digest.test.ts)<br>DST/local date, повторная проверка consent, атомарный claim; неизвестный SMTP outcome не автоповторяется; pre-send ошибки можно повторить. |
| P6.6 | A | Ручной локальный выпуск и выключение | [src/app/demo/page.tsx](../src/app/demo/page.tsx)<br>[src/components/demo/digest-scenario.tsx](../src/components/demo/digest-scenario.tsx)<br>[src/server/demo/digest.ts](../src/server/demo/digest.ts)<br>[src/server/demo/guard.ts](../src/server/demo/guard.ts) | [tests/integration/demo-digest.test.ts](../tests/integration/demo-digest.test.ts)<br>[tests/deployment/demo.test.ts](../tests/deployment/demo.test.ts)<br>Guard, daily replay и unsubscribe покрыты тестами. UI sent→duplicate, Mailpit: 1 и Mongo sent: 1 подтверждены [M9](#m9); отписка и UI skipped — [M10](#m10). |

### Этап 7. Правила уведомлений

| ID | A/B | Объект | Существующие файлы | Автоматическое доказательство / остаток приёмки |
| --- | --- | --- | --- | --- |
| P7.1 | A | CRUD/пауза правил в UI | [src/components/alerts/alert-rules.tsx](../src/components/alerts/alert-rules.tsx)<br>[src/app/alerts/page.tsx](../src/app/alerts/page.tsx) | [tests/integration/alerts.test.ts](../tests/integration/alerts.test.ts)<br>UI create 105 → edit 106→pause→delete → empty 0 подтверждены [M11](#m11). Resume проверен API; отдельный UI resume не заявляется. |
| P7.2 | B | Модель и price_above/price_below | [src/server/alerts/repository.ts](../src/server/alerts/repository.ts)<br>[src/server/alerts/evaluate.ts](../src/server/alerts/evaluate.ts)<br>[src/contracts/index.ts](../src/contracts/index.ts) | [tests/alerts/evaluate.test.ts](../tests/alerts/evaluate.test.ts)<br>[tests/integration/alerts.test.ts](../tests/integration/alerts.test.ts)<br>Первое наблюдение — baseline; strict crossing, цена=порог, валюта/символ/источник/порядок времени проверяются. |
| P7.3 | B | Периодический обход с ограничением квот | [src/server/alerts/worker.ts](../src/server/alerts/worker.ts)<br>[src/server/inngest/alerts.ts](../src/server/inngest/alerts.ts)<br>[src/components/alerts/alert-rules.tsx](../src/components/alerts/alert-rules.tsx) | [tests/integration/alert-worker.test.ts](../tests/integration/alert-worker.test.ts)<br>[tests/integration/rate-limit.test.ts](../tests/integration/rate-limit.test.ts)<br>300s interval, lease, до 5 символов, группировка/курсор, quota stop, явные flags; измеренная live-задержка не заявляется. |
| P7.4 | B | Переход, outbox, email и cooldown | [src/server/alerts/evaluate.ts](../src/server/alerts/evaluate.ts)<br>[src/server/alerts/repository.ts](../src/server/alerts/repository.ts)<br>[src/server/alerts/worker.ts](../src/server/alerts/worker.ts) | [tests/alerts/evaluate.test.ts](../tests/alerts/evaluate.test.ts)<br>[tests/integration/alerts.test.ts](../tests/integration/alerts.test.ts)<br>[tests/integration/alert-worker.test.ts](../tests/integration/alert-worker.test.ts)<br>[tests/integration/demo-scenario.test.ts](../tests/integration/demo-scenario.test.ts)<br>Конкурентное событие/replay/cooldown/SMTP semantics покрыты тестами. Одно ценовое письмо в Mailpit и один sent journal подтверждены [M12](#m12). |
| P7.5 | B | volume_above | [docs/product-decisions.md](../docs/product-decisions.md)<br>[src/contracts/index.ts](../src/contracts/index.ts) | [tests/integration/alerts.test.ts](../tests/integration/alerts.test.ts)<br>УСЛОВНО ОТЛОЖЕНО: нет принятого контракта доступности/смысла volume. Unsupported volume rule отклоняется; это не отсутствующая обязательная функция локальной v1. |
| P7.6 | A | Старые/отсутствующие данные, replay и изменение | [src/server/alerts/evaluate.ts](../src/server/alerts/evaluate.ts)<br>[src/server/alerts/worker.ts](../src/server/alerts/worker.ts)<br>[src/server/alerts/repository.ts](../src/server/alerts/repository.ts) | [tests/alerts/evaluate.test.ts](../tests/alerts/evaluate.test.ts)<br>[tests/integration/alerts.test.ts](../tests/integration/alerts.test.ts)<br>[tests/integration/alert-worker.test.ts](../tests/integration/alert-worker.test.ts)<br>Stale/future/out-of-order, provider failure, captured version/concurrent pause/delete покрыты интеграцией. UI pause/delete — [M11](#m11). Реальные выходные/календарь live не проверены. |

### Этап 8. Проверка и выпуск

| ID | A/B | Объект | Существующие файлы | Автоматическое доказательство / остаток приёмки |
| --- | --- | --- | --- | --- |
| P8.1 | A | Полный пользовательский путь | [docs/local-demo.md](../docs/local-demo.md)<br>[src/components/demo/alert-scenario.tsx](../src/components/demo/alert-scenario.tsx)<br>[src/components/demo/digest-scenario.tsx](../src/components/demo/digest-scenario.tsx) | [tests/integration/auth-profile.test.ts](../tests/integration/auth-profile.test.ts)<br>[tests/integration/demo-scenario.test.ts](../tests/integration/demo-scenario.test.ts)<br>[tests/integration/demo-digest.test.ts](../tests/integration/demo-digest.test.ts)<br>Основной путь браузера и реальные локальные письма подтверждены [M2–M12](#m2); signed unsubscribe проверена HTTP, а не отдельным browser-click. Это ручной сценарий плюс API, не автоматизированный browser E2E. |
| P8.2 | B | Автоматическая бизнес-проверка | [tests/integration/watchlist.test.ts](../tests/integration/watchlist.test.ts)<br>[tests/integration/alerts.test.ts](../tests/integration/alerts.test.ts)<br>[tests/integration/digest.test.ts](../tests/integration/digest.test.ts)<br>[.github/workflows/ci.yml](../.github/workflows/ci.yml) | PASS: 90/90 интеграционных тестов в 12 файлах: isolation/uniqueness/crossing/replay/recipients. Полный check PASS: 151 unit-тест и production build. |
| P8.3 | A | Сборка, адаптивность, клавиатура, API/quota | [package.json](../package.json)<br>[src/app/globals.css](../src/app/globals.css)<br>[src/components/app-shell.tsx](../src/components/app-shell.tsx) | [tests/server/http.test.ts](../tests/server/http.test.ts)<br>[tests/market/client.test.ts](../tests/market/client.test.ts)<br>[tests/integration/rate-limit.test.ts](../tests/integration/rate-limit.test.ts)<br>Targeted lint/TypeScript PASS, runtime audit: 0, API smoke [M6](#m6), mobile/focus [M13](#m13). Полный check PASS; расширенная UI-матрица неполная. |
| P8.4 | B | Локальный запуск, readiness и остановка | [scripts/demo.mjs](../scripts/demo.mjs)<br>[compose.yaml](../compose.yaml)<br>[src/app/api/readiness/route.ts](../src/app/api/readiness/route.ts)<br>[Dockerfile](../Dockerfile)<br>[src/server/production.ts](../src/server/production.ts) | [tests/deployment/demo.test.ts](../tests/deployment/demo.test.ts)<br>[tests/deployment/readiness.test.ts](../tests/deployment/readiness.test.ts)<br>[tests/deployment/production.test.ts](../tests/deployment/production.test.ts)<br>Безопасный launcher/env/readiness покрыты тестами; приложение/локальные сервисы работали [M1](#m1). Stop/restart подтверждены [M14](#m14); public deploy future. |
| P8.5 | A | Запуск, recovery, rotation и выключение | [README.md](../README.md)<br>[docs/local-demo.md](../docs/local-demo.md)<br>[docs/participant-a-stage-8-runbook.md](../docs/participant-a-stage-8-runbook.md)<br>[docs/production-deployment.md](../docs/production-deployment.md) | Инструкции запуска/stop/recovery/rotation существуют; локальный сценарий [M1](#m1), [M14](#m14). Rotation внешних ключей в production не выполнялась, он вне локальной v1. |

## Текущие исправления UI и контракт внешних графиков

В ходе аудита исправлены: локализация INVALID_NAME и фокус поля; блокировка профиля/рассылки во время сохранения и фокус timezone; контекст 404 неизвестной акции; идемпотентное удаление правила; консервативное состояние после потерянного ответа мутации, чтобы не предлагать повторное создание без чтения БД; некорректные даты/HTTP success; фальшивые переходы по синтетическим новостям. Это изменения реализации; ручная проверка ниже остаётся отдельной.

P3.1 дополнен фиксированным обзором индексов S&P 500, Dow Jones и Nasdaq Composite. Собственные котировки AAPL/MSFT/NVDA остаются отдельным блоком с собственным source/time. P4.3 дополнен отдельным графиком акции: `TradingViewStockChart({symbol, exchange, source, theme?, height?, className?})`, NASDAQ/NYSE из нормализованной компании. Для семи fixture-тикеров есть фиксированное сопоставление биржи только для внешнего виджета; оно не создаёт цену/историю приложения. Неизвестная биржа показывает unavailable. Высота ограничена 320–900px; скрипт имеет фиксированный домен; factory очищает DOM/listeners и даёт 15s timeout/retry.

Источники проверки внешнего контракта:

- [TradingView Symbol Overview: официальный пример виджета](https://www.tradingview.com/widget-docs/widgets/charts/symbol-overview/) — `embed-widget-symbol-overview.js`, `symbols`, `chartOnly`, `autosize`, `dateRanges`.
- [TradingView: пояснение SP:SPX и DJ:DJI](https://www.tradingview.com/support/solutions/43000709178-what-does-tvc-stand-for-in-the-instrument-ticker/) — используются исходные идентификаторы, не подмена TVC-производными.
- [Nasdaq Composite NASDAQ:IXIC](https://www.tradingview.com/symbols/NASDAQ-IXIC/) — третий индекс фиксированного обзора.
- [Berkshire Hathaway NYSE:BRK.B](https://www.tradingview.com/symbols/NYSE-BRK.B/) — класс акции сохраняется в символе графика.

Наличие корректной конфигурации не подтверждает доступность внешнего сервиса или скорость данных. TradingView может показывать данные, отличающиеся от синтетической цены и от Finnhub. Этого виджета нет в тракте проверки правил/доставки писем.

## Ручная и runtime-приёмка текущего аудита

Наблюдения выполнены основным агентом и переданы для фиксации 2026-10-15. Они относятся к локальному dev/fixture/SMTP Mailpit, текущему аудитному прогону и вымышленным пользователям. Значения цен ниже — снимок конкретной проверки. Пароли, cookie, токены, реальные email и дампы БД не сохраняются. Запись PASS подтверждает только названные действия.

<a id="m1"></a>
### M1. Запуск — PASS для работающей среды

Демоприложение работало через локальный launcher; MongoDB, SMTP Mailpit и локальный Inngest обеспечили сценарии M2–M12. Публичные сервисы не использовались. Окончательные start/stop/restart, журнал и поведение при занятом порте фиксируются отдельно в M14.

<a id="m2"></a>
### M2. Аккаунт и серверные границы — PASS

В браузере пользователь зарегистрировался и оказался вошедшим. Runtime API smoke подтвердил profile PATCH→GET, no session 401, foreign Origin 403 и unknown fields 400. Данные owner isolation/logout/expired-cookie покрыты интеграционными тестами. Отдельный браузерный logout→login→reload в этом прогоне не заявляется.

<a id="m3"></a>
### M3. Подтверждение email — PASS

Настоящая локальная ссылка из Mailpit обработана с HTTP 302; настройки показали verified. В Mailpit отдельно наблюдались verification и welcome, они не считались письмом сводки или ценовым событием.

<a id="m4"></a>
### M4. Поиск и карточка — PASS

Apple дал один AAPL; звезда добавила его в watchlist. Открыта карточка с собственной fixture-ценой100, source/time и явным отличием внешних данных. Runtime API smoke подтвердил все семь поисковых aliases и unknown-symbol ошибку. Все гонки печати в браузере отдельно не инъецировались.

<a id="m5"></a>
### M5. Индексы и внешний stock chart — PASS для наблюдённой части

График AAPL реально загрузился и показал 343.94, отдельно от собственной fixture-цены 100. Fixed index config и подпись «Индексы рынка» включают SP:SPX / DJ:DJI / NASDAQ:IXIC; реальные значения каждого индексного iframe отдельно не записаны. Доступность всех виджетов/тем не утверждается.

<a id="m6"></a>
### M6. API ошибки и квоты — PASS backend; расширенный UI не выполнен

Runtime script smoke: invalid timezone 400 с fields, foreign Origin 403, noauth 401, unknown fields 400, unknown symbol; aliases: 7, повтор списка и CRUD правила прошли. Автотесты покрывают quota 429, upstream failures/timeouts и безопасный ответ ошибок. В UI нет полного отдельного прогона 429/503/offline и потерянного ответа после commit; обработка реализована, но это не ручное доказательство этих состояний.

<a id="m7"></a>
### M7. Личный список — PASS основного пути

Apple→звезда→AAPL detail→watchlist: 1 выполнено в браузере. Runtime duplicate add не создаёт вторую запись. В select доступны новые/старые/тикер/компания; сортировка по цене не требуется точной строкой P5.4. Полный прогон четырёх sort, нескольких страниц и logout/reload UI не выполнен; persistence/uniqueness/cap покрыты интеграцией.

<a id="m8"></a>
### M8. Настройки — PASS наблюдённого сохранения

В UI сохранены Asia/Qyzylorda и явное согласие на рассылку. Runtime PATCH→GET профиля и invalid timezone 400/fields подтверждены. Полная анкета, фокус каждой ошибки и блокировка ввода при медленном запросе отдельно в браузере не воспроизводились.

<a id="m9"></a>
### M9. Preview и доставка сводки — PASS

Preview открыт в UI. На /demo сводка вернула sent, повтор — duplicate. В реальном локальном Mailpit ровно одно письмо сводки; MongoDB содержит один соответствующий sent journal. Это отдельные доказательства preview и доставки; fixture-сводка не является Gemini-результатом.

<a id="m10"></a>
### M10. Отписка и прекращение сводки — PASS

Signed unsubscribe GET ответил 200 и сохранил enabled=true (только подтверждение). POST дважды ответил 200, enabled=false, дополнительных писем нет. После этого повторная кнопка сводки в UI показала skipped. GET/POST выполнены HTTP-проверкой реальной ссылки; отдельный browser-click отписки не заявляется.

<a id="m11"></a>
### M11. Правила — PASS UI CRUD/паузы, resume API

В UI создан порог 105, изменён на 106, правило приостановлено и удалено с подтверждением; список показал 0. Resume отдельно подтверждён API. Факт UI resume не утверждается.

<a id="m12"></a>
### M12. Ценовое событие и письмо — PASS локальной доставки

Реальный Mailpit содержит одно ценовое письмо, MongoDB — один соответствующий sent journal. Вместе со сводкой подтверждены 1 digest + 1 alert; verification/welcome считаются отдельно. Синтетический crossing/replay/ownership/очистка временного правила дополнительно покрыты demo-scenario integration. Статичная fixture-цена сама по себе доказательством перехода не считается.

<a id="m13"></a>
### M13. Размеры и клавиатура — ЧАСТИЧНО; расширенная матрица дополнительная

Получен full-page screenshot /demo при 390×844: содержимое помещается; Tab показал видимое focus ring. Просмотрен desktop screenshot при ширине 1264. Полная матрица девяти экранов при 320/768/1440, масштаб 200%, Shift+Tab/Enter/Space/Escape и все error states не выполнена. Поэтому полный responsive/WCAG-аудит не объявляется пройденным. Основной локальный показ подтверждён в перечисленных размерах и сценариях; расширение матрицы остаётся отдельной проверкой.

<a id="m14"></a>
### M14. Остановка и повторный запуск — PASS

Основной агент выполнил `npm run services:jobs:stop`: Inngest завершился с кодом 0, MongoDB и Mailpit остались healthy. Ctrl+C остановил только свой Next, общие контейнеры сохранились. Повторный `npm run demo -- --port 3100` прошёл: Next Ready за 1511 мс, Inngest запущен с callback на 3100. Полное `services:down` в этом аудите не выполнялось; восстановление после удаления данных и production disaster recovery не заявляются.

## Ограничения и передача

Дополнение после последнего перезапуска: readiness 200 по localhost/127.0.0.1/::1, Mailpit/Inngest health 200. В браузере сохранены сессия и AAPL в списке; загрузились три индекса, heatmap, собственные котировки 100/110/120 с source/time. Ограничение Tailwind до `src` (`0879d0a`) и новый запуск устранили наблюдённый цикл dev reload: 0 повторных Compiled за контрольные 7 секунд. Конкретный внутренний сбой OneDrive не доказан. После CSS-исправления production build повторно PASS. Итоговый [handoff](handoffs/demo-acceptance.md), [PR #22](https://github.com/nazek52/ai-stock-market/pull/22).

P7.5 намеренно deferred. Не заявляются live-качество Gemini, внешняя SMTP-доставка, реальная задержка/биржевой календарь, лицензия Finnhub, облачные задания и публичный production. Nullable показатели остаются «нет данных», а синтетика не является фактической рыночной историей. Полный WCAG-аудит не подменяется клавиатурным smoke-тестом.

Статус: локальный функциональный сценарий готов в границах M2–M12; матрица 47/47 и 90/90 интеграционных тестов подтверждены. Полный check и stop/restart прошли; финальный commit/CI фиксирует координатор. Расширенная UI-матрица M13 неполная и остаётся дополнительной проверкой, P7.5 условно отложен. Финализированы только документация аудита, README и историческая пометка QA; API/схемы/env не менялись. Результат передаётся A/B и основному агенту для итогового handoff `docs/handoffs/demo-acceptance.md` (создаёт координатор), фиксации финального коммита/CI и действительных наблюдений. Самостоятельный commit/push/deploy этой задачей не выполняется.
