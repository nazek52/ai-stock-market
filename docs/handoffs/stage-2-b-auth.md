# P2.1, P2.3 — серверная авторизация и профиль

Участник B. Статус: серверная часть реализована и проверена локально. Этап 2 целиком требует форм и защищённых страниц участника A (P2.2, P2.4, P2.5).

## Результат

- Better Auth 1.7.7: регистрация email/пароль (12–128 символов), вход, выход, сохраняемые сессии на 7 дней. MongoDB хранит хеш пароля в служебной коллекции Better Auth, отдельно от анкеты и предпочтений.
- MongoDB подключается лениво через один пул; импорт маршрутов и production-сборка не требуют секрета или доступной БД. Повтор после неуспешного подключения разрешён; URI не выводится в ответы и логи.
- Уникальные индексы email, session token, пары provider/account, ключа rate limit и владельца анкеты/предпочтений; TTL для истёкших сессий и verification. Лимиты авторизации хранятся в БД.
- Любая операция с анкетой или предпочтениями получает владельца только из проверенной серверной сессии. Строгая схема отклоняет `userId` в JSON; параметр `?userId=` не меняет владельца.
- Все POST авторизации, PATCH анкеты и PUT предпочтений требуют точный Origin приложения, включая вход до появления session cookie. Ответы не кэшируются.
- Пустая анкета возвращает `null` для незаполненных значений и `UTC`. Дайджест изначально отключён; локальное время `09:00`, зона `UTC`, время изменения согласия хранится отдельно.

## Файлы и интерфейсы для A и следующих задач B

- `src/server/db/index.ts`, `mongodb.ts`: `getDatabase()`, `getMongoClient()`, `closeDatabase()`; закрывать общий пул после HTTP-запроса нельзя.
- `src/server/auth/index.ts`: асинхронный `getAuth()`, тип `Auth`.
- `src/server/auth/session.ts`: `getSession(headers)` и `requireSession(headers)`, тип `Session`. Проверка выполняется по БД, наличие cookie само по себе не даёт доступа.
- `src/server/profile/repository.ts`: `getProfile(userId)`, `updateProfile(userId, input)`, `getPreferences(userId)`, `updatePreferences(userId, input)`. `userId` — доверенный идентификатор текущей сессии; эти функции не импортировать в браузер.
- `src/app/api/auth/[...all]/route.ts`: нативный JSON Better Auth для `/sign-up/email`, `/sign-in/email`, `/sign-out`, `/get-session`. Для клиента A использовать `better-auth/react` либо нативные endpoint-форматы; `ApiResult` к этим ответам не применяется.
- `src/app/api/profile/route.ts`: GET/PATCH с DTO `Profile` / `ProfileUpdate` в общем `ApiResult`.
- `src/app/api/preferences/digest/route.ts`: GET/PUT с DTO `DigestPreference` / `DigestPreferenceUpdate` в общем `ApiResult`.
- `tests/integration/auth-profile.test.ts`: реальная MongoDB replica set через `mongodb-memory-server` 8.0.16; синтетические адреса только в зарезервированном `.test`.

## Проверки

- `npm run typecheck` — пройдено.
- `npm run lint` — пройдено.
- `npm run test:integration -- tests/integration/auth-profile.test.ts` — 8/8 пройдено: регистрация, хеш, cookie, вход, дубликат email, неверный/короткий пароль, сессия/поддельная cookie, дефолты, конкурентный первый доступ, сохранение анкеты/согласия, изоляция, подмена владельца, CSRF, валидация, выход и истечение сессии.
- Первый прогон выявил отсутствие обязательной проверки Origin при входе без cookie; исправлено и повторный прогон прошёл.

## Ограничения и следующий шаг

Для локального запуска необходима MongoDB replica set (в `compose.yaml`) и локальный `BETTER_AUTH_SECRET`. Секреты и реальные аккаунты этим изменением не создаются. Первый запуск интеграционного теста может скачать MongoDB; бинарный файл не входит в Git.

Отправка писем, подтверждение адреса и восстановление пароля ожидают настройки транспорта в этапе 6. Регистрация пока не требует подтверждения адреса. Production-рассылки нельзя включать до проверки адреса, согласия и отписки; тесты не отправляют письма. Для production дополнительно подтвердить настройки доверенного IP-заголовка на выбранном хостинге, поскольку rate limit зависит от адреса клиента.

Участнику A: подключить формы, обрабатывать коды Better Auth отдельно от `ApiResult`, выполнять `requireSession(await headers())` на личных страницах и проверять состояние после перезагрузки. Каждая новая серверная операция B также должна вызывать `requireSession` и фильтровать записи по владельцу.

Источники API: [MongoDB adapter](https://better-auth.com/docs/adapters/mongo), [Next.js integration](https://better-auth.com/docs/integrations/next), [Rate limit](https://better-auth.com/docs/concepts/rate-limit). Коммиты и отправку ветки выполняет основной агент.
