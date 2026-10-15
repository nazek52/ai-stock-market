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

После запуска приложение: `http://localhost:3000`; liveness: `/api/health`. Экраны `/`, `/search`, `/stocks/[symbol]`, `/login` и `/settings` доступны. Вход, профиль, поиск и карточка акции вызывают защищённые серверные маршруты и требуют запущенной MongoDB. В настройках по умолчанию рыночные данные синтетические и так помечены в интерфейсе; реальная отправка писем и расписания выключены. Для приёма писем в Mailpit выбрать `EMAIL_TRANSPORT=smtp`; значения ключей внешних сервисов добавляются только в `.env.local`.

Для локального Inngest после запуска приложения выполнить `npm run services:jobs` (Docker). Интерфейс: `http://127.0.0.1:8288`; остановка только jobs: `npm run services:jobs:stop`. Compose публикует только HTTP-порт на loopback, внутренние gRPC-порты не публикуются. Для приложения на другом порту задать `INNGEST_APP_PORT` в окружении команды Compose. `INNGEST_DEV=1` в локальном env; расписания включать отдельно. Для локального перехвата verification/reset дополнительно требуется `EMAIL_ENABLED=true`; письма останутся в Mailpit.

## Проверки

```sh
npm run check
npm run test:integration
```

`check` запускает lint, TypeScript, unit-тесты и production build. Интеграционные тесты поднимают собственный временный MongoDB replica set; Docker им не нужен. Тестовая БД не использует `.env.local` и не должна указывать на реальную БД. `/api/readiness` проверяет доступность writable replica set, в production также проверяет конфигурацию; возвращает только 200/503. `npm run production:check` предназначен для окружения выпуска, а не для стандартного локального запуска.

## Документы

- [Единый подробный план](docs/implementation-plan.md) - основной источник задач и критериев готовности для людей и AI-агентов.
- [PDF-версия плана](docs/implementation-plan.pdf) - копия для чтения и обсуждения.
- [Правила работы агентов](AGENTS.md) и [контракты](agents/README.md).
- [Рабочий контракт B](docs/tasks/participant-b.md), [сервисные решения](docs/service-setup.md) и [проверка зависимостей](docs/dependency-audit.md).
- [Состояние работ B и порядок объединения](docs/participant-b-progress.md), [подготовка production](docs/production-deployment.md).

При расхождении между Markdown и PDF действующим считается Markdown. Версия плана и журнал изменений указаны в начале основного документа.

## Источники

- Видео: https://youtu.be/gu4pafNCXng
- Код автора видео: https://github.com/adrianhajdin/signalist_stock-tracker-app

Проект представляет собой информационный сервис: операции покупки и продажи ценных бумаг в текущий объём работ не входят.
