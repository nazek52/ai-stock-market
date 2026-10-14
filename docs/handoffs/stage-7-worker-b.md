# P7.3/P7.4: фоновый обход и доставка, участник B

Серверный worker реализован в независимом worktree. Root подключает экспорт `createAlertFunctions()` из `src/server/inngest/alerts.ts` к существующему подписанному `/api/inngest`; общие route/functions/repository/package этим изменением не меняются. Основы зависимостей: alert repository/engine `50f0616`, market `1a99613`, shared permit `3d40fa0`, доставка P6 `83e2863`/`d42443b`/`8e5f9f1`. Root переносит только отдельный worker-коммит поверх своих уже объединённых зависимостей.

## Вызовы и конфигурация

- `pollPriceAlerts({ quoteProvider?, clock?, maxRunMs? })`: обычный provider — `getMarketClient().quote(symbol)`, который использует общий Mongo budget/lease Finnhub. Инъекции предназначены для детерминированных тестов и не принимаются из HTTP. По умолчанию/максимум runtime budget — 60 с; 90-секундный shared lease `alerts:poll` предотвращает одновременные polling-запуски.
- `deliverPendingAlerts({ transport?, clock?, maxRunMs? })`: отдельный shared lease `alerts:delivery`, до 100 pending-событий; не удерживает market provider lease во время SMTP. Перед новой отправкой резервирует 25 с для SMTP timeout и DB-записей.
- Обе функции имеют минутный cron в Inngest. Poll выключен при `ALERT_SCHEDULE_ENABLED=false`. Delivery также требует `EMAIL_ENABLED=true` и `EMAIL_TRANSPORT=smtp`; stream preview не отмечается как реальная доставка.

## Обход символов и продолжение

Символы группируются по активным правилам; выбираются максимум 5 разных eligible-символов, сначала наиболее давно посещённые/ещё не посещённые. `alert_symbol_poll_state` хранит lastAttemptAt/nextAttemptAt, lastVisitedAt, cursor (`ObjectId`), activePass и временно quote. Новая попытка получения цены одного символа допускается не чаще `ALERT_POLL_SECONDS` (схема требует минимум 300 с), включая неуспешные запросы. Ошибка одного символа не останавливает остальные; 429 прекращает текущий batch до следующего cron и сохраняет attempt state.

Первая страница до 100 правил и их version фиксируется до асинхронного запроса цены. После получения цены используется новое время `clock()` для `processRule`, а не момент начала HTTP-запроса: свежий fetchedAt не считается будущим из-за задержки API. Каждая запись передаёт expectedVersion своего snapshot; редактирование во время запроса не обрабатывается по старому правилу.

Цена получается один раз на проход символа, а правила читаются по страницам с возрастающим `_id`. После каждого обработанного правила сохраняется cursor. При исчерпании бюджета проход остаётся activePass и продолжается с того же cursor с сохранённой ещё свежей ценой, даже до истечения 300 с; нового обращения к провайдеру при этом нет. Если цена успела устареть, cursor сохраняется, следующий разрешённый запрос получает новую цену и продолжает с оставшихся записей. Это позволяет длинному проходу добраться до поздних ID, а другим символам — получить очередь через lastVisitedAt.

Страницы после первой/после продолжения фиксируют актуальный version непосредственно перед обработкой сохранённой цены. Правка всегда сбрасывает baseline в repository; первая котировка обновлённого правила не создаёт crossing. `processRule` выполняет транзакционную фиксацию baseline+event; повтор после прерывания безопасен по времени источника и уникальному ключу события. Отдельные текущие DB-операции могут завершиться после исчерпания локального бюджета; уже начатые транзакции не отменяются внешним таймером. Их поздний результат не сбрасывает cursor и не разрешает повторную SMTP-отправку.

## Отдельная доставка

Из `alert_events` выбираются старейшие pending. Событие старше `MARKET_STALE_SECONDS` по времени котировки или проверки, событие из будущего и production fixture отменяются с причиной. Перед вызовом общего sender повторно проверяется `isEventDeliverable`: правило активно, version совпадает, событие всё ещё pending.

Notification key — `alert:${event._id}`; общий sender атомарно получает claim, проверяет актуальный подтверждённый email и сохраняет исход в `notification_deliveries`. Payload содержит цену, порог, валюту, source, observedAt, checkedAt и fixture marker; HTML генерирует только безопасный общий renderer. `markEventDelivered` вызывается только при `sent`.

Для skipped/uncertain событие отменяется с диагностической причиной, а notification journal сохраняется. Это освобождает очередь после 100 неподтверждённых/terminal-получателей и не даёт им постоянно вытеснять следующие события. Старые price_alert sending-claims старше 5 минут переводятся в uncertain, не в pending. Неопределённые SMTP-исходы автоматически не повторяются; оператор проверяет журнал провайдера по стабильному Message-ID. Известная ошибка до SMTP оставляет event pending и выбрасывает retriable-ошибку после обработки остальных записей batch.

MongoDB и SMTP не образуют общую транзакцию. Проверка паузы проводится непосредственно перед общим sender; остаётся техническое окно между этой проверкой и сетевой отправкой. Полную атомарность отмены во время уже начавшейся отправки и SMTP exactly-once реализация не обещает.

## Проверки

Интеграционные проверки используют отдельный временный MongoDB replica set, собственные synthetic users/quotes и injected transport/provider; внешняя сеть Finnhub и реальная отправка писем не используются. Проверяются grouping одного запроса, интервал 300 с, конкурентный lease, version edit во время fetch, stale source data, изоляция provider failure и остановка на 429, максимум 5 символов/ротация, durable cursor/deadline/resume, одна доставка при replay/concurrency, свежая pause-check, stale event cancellation, 100 terminal-событий перед валидным пользователем, неопределённый SMTP исход, pre-SMTP retry и выключенные флаги.

Проверки выполнены: `npm run lint`, `npm run typecheck`, `npm run test:integration -- tests/integration/alert-worker.test.ts` (13/13), `npm run build`, `git diff --check` прошли. После добавления общего timer-bound для ожидания SMTP повторно прошли lint/typecheck и все 13 target integration. Для typecheck изолированных старых зависимостей временно исправлялась известная generic-аннотация `request_windows` в dependency-тесте; после проверки она возвращена к исходному dependency-состоянию. Этот файл не входит в worker-коммит, root уже имеет исправление. Production quota/licensing/SLA, реальные аккаунты и P7.5 volume остаются открыты; UI/приёмка принадлежат A.
