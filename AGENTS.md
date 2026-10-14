# Инструкции для агентов

Перед любой задачей прочитай `README.md`, `docs/implementation-plan.md` (включая раздел 4 о двух участниках), `docs/product-decisions.md` и `agents/README.md`. Затем прочитай общий контракт `agents/contracts/common.md`, контракт своей роли и контракт конкретной задачи.

## Порядок работы

1. Укажи ID задачи из плана (например, P4.2), назначенного участника A/B, входные данные, файлы в своей зоне и проверяемый результат.
2. Проверь зависимости этапа. Если решение из `docs/product-decisions.md` ещё открыто и влияет на реализацию, обозначь блокировку или сделай явно записанное обратимое предположение.
3. Работай в назначенной области; перед изменением чужого интерфейса согласуй контракт с ответственным агентом или владельцем задачи.
4. Не добавляй в Git секреты, реальные адреса тестовых пользователей, дампы БД, ключи API или сгенерированные зависимости.
5. Запусти проверки, относящиеся к изменению. Не называй задачу готовой, если критерии из плана не выполнены.
6. Передай результат по `agents/contracts/handoff.md`, включая изменённые файлы, проверки, ограничения и следующий шаг.

При конфликте документов приоритет такой: прямое указание пользователя, этот файл, `docs/implementation-plan.md`, контракт задачи, контракт роли. Агент не расширяет продукт за пределы плана без явного решения.

Правила коммитов и отправки в GitHub задаёт владелец задачи. Если это не указано, агент готовит изменения локально и сообщает результат; самостоятельный push не требуется.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
