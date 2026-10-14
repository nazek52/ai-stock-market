"use client";

import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const fieldClass =
  "mt-2 min-h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

export function ProfileSettingsPreview() {
  function preventPreviewSubmission(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  return (
    <div className="grid max-w-4xl gap-5">
      <div className="rounded-xl border border-border bg-muted px-5 py-4 text-sm text-foreground" role="status">
        <strong>Предпросмотр формы.</strong> Аккаунты пока не подключены. Введённые здесь данные не сохраняются, а письма не отправляются.
      </div>

      <form className="grid gap-5" onSubmit={preventPreviewSubmission} noValidate>
        <Card>
          <CardHeader>
            <CardTitle>Интересы</CardTitle>
            <CardDescription>Эти сведения помогут настроить ваш профиль после подключения учётной записи.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium" htmlFor="country">Страна</label>
              <input className={fieldClass} id="country" name="country" type="text" autoComplete="country-name" maxLength={80} placeholder="Например, Казахстан" aria-describedby="country-help" />
              <p className="mt-2 text-xs" id="country-help">Укажите страну проживания.</p>
            </div>
            <div>
              <label className="block text-sm font-medium" htmlFor="goal">Инвестиционная цель</label>
              <select className={fieldClass} id="goal" name="goal" defaultValue="">
                <option value="" disabled>Выберите цель</option>
                <option value="growth">Рост капитала</option>
                <option value="income">Регулярный доход</option>
                <option value="preservation">Сохранение капитала</option>
                <option value="learning">Изучение рынка</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium" htmlFor="risk">Допустимый риск</label>
              <select className={fieldClass} id="risk" name="risk" defaultValue="" aria-describedby="risk-help">
                <option value="" disabled>Выберите уровень</option>
                <option value="low">Низкий</option>
                <option value="medium">Средний</option>
                <option value="high">Высокий</option>
              </select>
              <p className="mt-2 text-xs" id="risk-help">Это предпочтение профиля, а не оценка пригодности инвестиций.</p>
            </div>
            <div>
              <label className="block text-sm font-medium" htmlFor="sector">Интересующая отрасль</label>
              <select className={fieldClass} id="sector" name="sector" defaultValue="">
                <option value="" disabled>Выберите отрасль</option>
                <option value="technology">Технологии</option>
                <option value="healthcare">Здравоохранение</option>
                <option value="finance">Финансы</option>
                <option value="industry">Промышленность</option>
                <option value="consumer">Потребительские товары</option>
                <option value="other">Другая отрасль</option>
              </select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ежедневная сводка</CardTitle>
            <CardDescription>Время и возможность отправки зависят от будущих серверных настроек.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div>
              <label className="block text-sm font-medium" htmlFor="timezone">Часовой пояс</label>
              <input className={fieldClass} id="timezone" name="timezone" type="text" autoComplete="off" list="timezone-options" placeholder="Например, Asia/Qyzylorda" aria-describedby="timezone-help" />
              <datalist id="timezone-options">
                <option value="Asia/Qyzylorda" />
                <option value="Asia/Almaty" />
                <option value="Europe/Moscow" />
                <option value="Europe/London" />
                <option value="America/New_York" />
                <option value="UTC" />
              </datalist>
              <p className="mt-2 text-xs" id="timezone-help">Используйте название часового пояса IANA. Выбор здесь пока не влияет на доставку.</p>
            </div>
            <div className="flex items-start gap-3 rounded-lg border border-border bg-background p-4">
              <input className="mt-1 size-4 shrink-0 accent-primary" id="digest-consent" name="digestConsent" type="checkbox" aria-describedby="digest-help" />
              <div>
                <label className="text-sm font-medium" htmlFor="digest-consent">Хочу получать ежедневную сводку по email</label>
                <p className="mt-1 text-xs" id="digest-help">По умолчанию рассылка выключена. Отметка в предпросмотре не оформляет подписку.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled>Сохранить настройки</Button>
          <span className="text-sm text-muted-foreground">Сохранение станет доступно после подключения защищённой операции профиля.</span>
        </div>
      </form>
    </div>
  );
}
