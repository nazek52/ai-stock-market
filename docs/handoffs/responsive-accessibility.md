# Handoff P8.3 — адаптивность и доступность

**ID и статус:** P8.3, локальная реализация и перечисленные проверки готовы. Настоящий zoom 200% ограничен возможностями инструмента; это не формальная сертификация WCAG.

**Участники:** A — интерфейс/клавиатура; B — интеграционные проверки и выпуск. Пользователь B явно поручил доработку экранов A и слияние в main. Работа выполнена в `codex/p8-responsive-accessibility` с тремя вспомогательными агентами и проверкой основным агентом в браузере.

## Результат и файлы

- Оболочка, палитра, кнопки, metadata основных страниц: `src/app/globals.css`, `src/app/layout.tsx`, основные `src/app/**/page.tsx`, `src/components/app-shell.tsx`, `demo-mode.tsx`, `ui/button.tsx`.
- Формы и обратная связь: `src/components/auth/*` (кроме client), `src/components/profile/*`, `stocks/*`, `alerts/alert-rules.tsx`, `watchlist/watchlist.tsx`, `demo/*`, `market/{dashboard-data,market-empty-state,tradingview-widgets}.tsx`.
- Служебные страницы: `src/app/global-error.tsx`, `loading.tsx`, `api/email/unsubscribe/route.ts`.
- Интеграционная регрессия: `tests/integration/unsubscribe-accessibility.test.ts`.
- Документация: README, [контракт](../tasks/responsive-accessibility.md), [отчёт](../responsive-accessibility-audit.md), [матрица плана](../plan-audit.md).

## Интерфейсы, схемы, события и env

Новых env, схем и фоновых событий нет. Публичный boolean demo-mode передаётся из server layout в клиентскую оболочку и устраняет SSR mismatch; он не даёт серверного доступа к /demo. У отписки form POST с `Accept: text/html` получает HTML; программные клиенты по умолчанию сохраняют JSON. GET не меняет согласие; строгий CSP использует nonce, владельцы изолированы.

## Проверки на коде `d20b74a`

| Команда / проверка | Результат |
| --- | --- |
| `npm ci` | exit 0, lockfile не менялся |
| `npm run check` | exit 0: ESLint без warnings, typegen/TypeScript, 151 unit-тест / 11 файлов, production build |
| `npm run test:integration` | exit 0: 95 тестов / 13 файлов, изолированный MongoDB replica set |
| `npm audit --omit=dev --audit-level=high` | exit 0, 0 runtime-уязвимостей |
| `git diff --check` | exit 0 |
| Чистый demo restart после build | Next.js запущен на 3100; health/readiness/Mailpit/Inngest — HTTP 200; сессия сохранилась |

Полный audit установщика по-прежнему сообщает девять high в dev-дереве, описанных в [dependency-audit](../dependency-audit.md). Они не названы нулём runtime-аудита; `audit fix --force` не применялся.

## Ручная проверка

60 измерений 15 экранов/состояний при 320/768/1440/720 CSS px; own DOM без горизонтального переполнения, безымянных controls и сломанных ARIA-ссылок. Клавиатура: skip-link всех основных маршрутов; ошибки форм; поиск и очистка; подтверждение/Escape/Shift+Tab/Space/Enter правил; отмена удаления акции; фокус сохранения; реальный длинный preview и PageDown; демосводка skipped; HTML-отписка. 18 управляемых API ошибок (401/429/503/обрыв, поиск и котировки), пустой список и восстановление форм. Подробности/ограничения и имена локальных свидетельств — в [отчёте](../responsive-accessibility-audit.md).

Временные правила очищены, AAPL сохранён, рассылка выключена. Локальный proxy ошибок остановлен. Скриншоты, токены и сырые журналы не добавлены в Git. Основной demo оставлен работающим; временный viewport сброшен.

## Ограничения и следующий шаг A/B

Реальный 200% zoom, NVDA/VoiceOver, реальные мобильные устройства и доступность сторонних TradingView iframe отдельно не сертифицированы. Глобальное падение root layout не инъецировалось; fallback просмотрен по коду. Облака, live AI/SMTP/данные и отложенный P7.5 сохраняют границы плана. A/B могут показывать локальную v1 по [сценарию](../local-demo.md); будущая публикация требует отдельного решения владельца.

## Коммиты и выпуск

- `75d7792` — reflow, контраст, metadata, skip-link, согласованная навигация.
- `1bac420` — формы, ошибки, подтверждения и фокус.
- `d20b74a` — async feedback, HTML-отписка, регрессионные интеграционные проверки.
- Итоговый документирующий коммит находится в [PR #23](https://github.com/nazek52/ai-stock-market/pull/23). Точный HEAD, результаты CI и факт слияния отображаются в этом PR; координатор проверяет все checks именно финального HEAD перед merge, без обхода gates. Изменения исходников после полного локального gate не вносились.
