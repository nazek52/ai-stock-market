# AI Stock Market

Репозиторий для разработки приложения наблюдения за фондовым рынком по мотивам [видеоурока JavaScript Mastery](https://youtu.be/gu4pafNCXng).

Рабочий репозиторий: https://github.com/nazek52/ai-stock-market. Интерфейс A и серверная основа B используют одно приложение Next.js в корне репозитория. Контракты данных описаны в [api-contract.md](docs/api-contract.md).

## Локальный запуск

Требуется Node.js 24 LTS. Внешние аккаунты для сборки и unit-тестов не нужны.

```sh
npm ci
npm run setup:local
npm run services:up
npm run dev
```

`setup:local` создаёт игнорируемый `.env.local` со случайным секретом и не перезаписывает существующий файл. `services:up` требует запущенный Docker Desktop: MongoDB replica set доступен только на `127.0.0.1:27017`, тестовая почта Mailpit - на `http://127.0.0.1:8025`. Остановка: `npm run services:down` (данные MongoDB сохраняются в Docker volume).

Если Docker недоступен, в отдельных терминалах запустить `npm run services:mongo` и `npm run services:mail` (Windows, PowerShell 7). Оба процесса слушают только localhost; MongoDB сохраняет данные между запусками. Подробности и проверенные способы остановки: [локальные сервисы](docs/local-services.md).

После запуска приложение: `http://localhost:3000`; liveness: `/api/health`. Экраны `/`, `/search`, `/stocks/[symbol]`, `/login` и `/settings` уже доступны, но формы A пока работают в режиме предпросмотра, а поиск использует четыре явно обозначенные справочные записи. В настройках по умолчанию серверные рыночные данные синтетические, реальная отправка и расписания выключены. Для приёма писем в Mailpit выбрать `EMAIL_TRANSPORT=smtp`; значения ключей внешних сервисов добавляются только в `.env.local`.

## Проверки

```sh
npm run check
npm run test:integration
```

`check` запускает lint, TypeScript, unit-тесты и production build. Интеграционные тесты появляются с этапом 2 и поднимают собственный временный MongoDB replica set; Docker им не нужен. Тестовая БД не использует `.env.local` и не должна указывать на реальную БД.

## Документы

- [Единый подробный план](docs/implementation-plan.md) - основной источник задач и критериев готовности для людей и AI-агентов.
- [PDF-версия плана](docs/implementation-plan.pdf) - копия для чтения и обсуждения.
- [Правила работы агентов](AGENTS.md) и [контракты](agents/README.md).
- [Рабочий контракт B](docs/tasks/participant-b.md), [сервисные решения](docs/service-setup.md) и [проверка зависимостей](docs/dependency-audit.md).

При расхождении между Markdown и PDF действующим считается Markdown. Версия плана и журнал изменений указаны в начале основного документа.

## Источники

- Видео: https://youtu.be/gu4pafNCXng
- Код автора видео: https://github.com/adrianhajdin/signalist_stock-tracker-app

Проект представляет собой информационный сервис: операции покупки и продажи ценных бумаг в текущий объём работ не входят.
