"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  digestPreferenceUpdateSchema,
  profileUpdateSchema,
  type ApiError,
  type ApiResult,
  type DigestPreference,
  type Profile,
} from "@/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const fieldClass = "mt-2 min-h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive";
const timezones = ["UTC", "Asia/Qyzylorda", "Asia/Almaty", "Europe/Moscow", "Europe/London", "America/New_York"];
type Notice = { kind: "success" | "error"; text: string; login?: boolean } | null;
type FieldErrors = Record<string, string | undefined>;

class ApiFailure extends Error {
  constructor(public readonly detail: ApiError) {
    super(detail.message);
  }
}

async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...init });
  const result: ApiResult<T> = await response.json();
  if (!result || typeof result !== "object" || typeof result.ok !== "boolean") {
    throw new Error("Invalid API response");
  }
  if (!result.ok) throw new ApiFailure(result.error);
  if (!response.ok) throw new Error("Unexpected API status");
  return result.data;
}

function explainError(error: unknown): string {
  if (error instanceof ApiFailure) {
    switch (error.detail.code) {
      case "UNAUTHENTICATED": return "Сессия истекла. Войдите снова, чтобы сохранить настройки.";
      case "INVALID_INPUT": return "Проверьте заполненные поля и попробуйте ещё раз.";
      case "RATE_LIMITED": return "Слишком много запросов. Подождите и повторите попытку.";
      case "SERVICE_UNAVAILABLE":
      case "UPSTREAM_UNAVAILABLE": return "Сервис временно недоступен. Попробуйте позже.";
      default: return "Не удалось выполнить запрос. Попробуйте ещё раз.";
    }
  }
  return "Не удалось связаться с сервером. Проверьте соединение и повторите попытку.";
}

function errorNotice(error: unknown): Notice {
  return {
    kind: "error",
    text: explainError(error),
    login: error instanceof ApiFailure && error.detail.code === "UNAUTHENTICATED",
  };
}

function validationErrors(issues: readonly { path: PropertyKey[]; message: string }[]): FieldErrors {
  return Object.fromEntries(issues.map((issue) => [String(issue.path[0] ?? "form"), issue.message]));
}

function serverFieldErrors(error: unknown): FieldErrors {
  return error instanceof ApiFailure && error.detail.code === "INVALID_INPUT"
    ? Object.fromEntries(Object.entries(error.detail.fields ?? {}).map(([field, messages]) => [field, messages.join(" ")]))
    : {};
}

function Status({ notice, retry }: { notice: Notice; retry?: () => void }) {
  if (!notice) return null;
  return (
    <div role={notice.kind === "error" ? "alert" : "status"} className={`rounded-lg border p-3 text-sm ${notice.kind === "error" ? "border-destructive text-destructive" : "border-border bg-muted text-foreground"}`}>
      {notice.text}
      {retry && <Button className="ml-3" type="button" variant="outline" size="sm" onClick={retry}>Повторить</Button>}
      {notice.login && <Link className="ml-3 font-semibold underline" href="/login">Войти</Link>}
    </div>
  );
}

type ProfileValues = {
  countryCode: string;
  investmentGoal: string;
  riskTolerance: string;
  preferredSector: string;
  timezone: string;
};

function ProfileForm() {
  const [values, setValues] = useState<ProfileValues>({ countryCode: "", investmentGoal: "", riskTolerance: "", preferredSector: "", timezone: "UTC" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState<Notice>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [saving, setSaving] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    apiRequest<Profile>("/api/profile", { signal: controller.signal })
      .then((profile) => {
        if (controller.signal.aborted) return;
        setValues({
          countryCode: profile.countryCode ?? "",
          investmentGoal: profile.investmentGoal ?? "",
          riskTolerance: profile.riskTolerance ?? "",
          preferredSector: profile.preferredSector ?? "",
          timezone: profile.timezone,
        });
        setLoadState("ready");
        setNotice(null);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setLoadState("error");
        setNotice(errorNotice(error));
      });
    return () => controller.abort();
  }, [retryToken]);

  function change(field: keyof ProfileValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setNotice(null);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || loadState !== "ready") return;
    const parsed = profileUpdateSchema.safeParse({
      countryCode: values.countryCode.trim().toUpperCase(),
      investmentGoal: values.investmentGoal,
      riskTolerance: values.riskTolerance,
      preferredSector: values.preferredSector || null,
      timezone: values.timezone.trim(),
    });
    if (!parsed.success) {
      const nextErrors = validationErrors(parsed.error.issues);
      setErrors(nextErrors);
      setNotice({ kind: "error", text: "Проверьте поля профиля." });
      const first = Object.keys(nextErrors)[0];
      if (first) requestAnimationFrame(() => formRef.current?.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${first}"]`)?.focus());
      return;
    }
    setSaving(true);
    setErrors({});
    setNotice(null);
    try {
      const profile = await apiRequest<Profile>("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      setValues({
        countryCode: profile.countryCode ?? "",
        investmentGoal: profile.investmentGoal ?? "",
        riskTolerance: profile.riskTolerance ?? "",
        preferredSector: profile.preferredSector ?? "",
        timezone: profile.timezone,
      });
      setNotice({ kind: "success", text: "Профиль сохранён." });
    } catch (error) {
      setErrors(serverFieldErrors(error));
      setNotice(errorNotice(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle><h2 className="m-0 text-lg">Профиль</h2></CardTitle>
        <CardDescription>Страна, цель, риск и интересующая отрасль.</CardDescription>
      </CardHeader>
      <CardContent>
        {loadState === "loading" ? <p role="status">Загружаем профиль…</p> : loadState === "error" ? (
          <Status notice={notice} retry={() => { setLoadState("loading"); setRetryToken((value) => value + 1); }} />
        ) : (
          <form ref={formRef} onSubmit={save} noValidate className="grid gap-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="country-code" className="text-sm font-medium">Код страны</label>
                <input disabled={saving} id="country-code" name="countryCode" className={fieldClass} value={values.countryCode} onChange={(event) => change("countryCode", event.target.value.toUpperCase())} maxLength={2} autoComplete="country" placeholder="KZ" required aria-invalid={!!errors.countryCode} aria-describedby={errors.countryCode ? "country-code-error" : "country-code-help"} />
                <p id="country-code-help" className="mt-1 text-xs">Две буквы ISO 3166-1, например KZ или US.</p>
                {errors.countryCode && <p id="country-code-error" className="mt-1 text-sm text-destructive">Укажите код страны из двух латинских букв.</p>}
              </div>
              <div>
                <label htmlFor="goal" className="text-sm font-medium">Инвестиционная цель</label>
                <select disabled={saving} id="goal" name="investmentGoal" className={fieldClass} value={values.investmentGoal} onChange={(event) => change("investmentGoal", event.target.value)} required aria-invalid={!!errors.investmentGoal} aria-describedby={errors.investmentGoal ? "goal-error" : undefined}>
                  <option value="">Выберите цель</option>
                  <option value="capital_preservation">Сохранение капитала</option>
                  <option value="income">Регулярный доход</option>
                  <option value="growth">Рост капитала</option>
                </select>
                {errors.investmentGoal && <p id="goal-error" className="mt-1 text-sm text-destructive">Выберите цель.</p>}
              </div>
              <div>
                <label htmlFor="risk" className="text-sm font-medium">Допустимый риск</label>
                <select disabled={saving} id="risk" name="riskTolerance" className={fieldClass} value={values.riskTolerance} onChange={(event) => change("riskTolerance", event.target.value)} required aria-invalid={!!errors.riskTolerance} aria-describedby={errors.riskTolerance ? "risk-error" : undefined}>
                  <option value="">Выберите уровень</option>
                  <option value="conservative">Низкий</option>
                  <option value="moderate">Средний</option>
                  <option value="aggressive">Высокий</option>
                </select>
                {errors.riskTolerance && <p id="risk-error" className="mt-1 text-sm text-destructive">Выберите уровень риска.</p>}
              </div>
              <div>
                <label htmlFor="sector" className="text-sm font-medium">Интересующая отрасль</label>
                <select disabled={saving} id="sector" name="preferredSector" className={fieldClass} value={values.preferredSector} onChange={(event) => change("preferredSector", event.target.value)} aria-invalid={!!errors.preferredSector} aria-describedby={errors.preferredSector ? "sector-error" : undefined}>
                  <option value="">Без предпочтения</option>
                  <option value="technology">Технологии</option>
                  <option value="healthcare">Здравоохранение</option>
                  <option value="financials">Финансы</option>
                  <option value="consumer_discretionary">Потребительские товары и услуги</option>
                  <option value="consumer_staples">Товары первой необходимости</option>
                  <option value="industrials">Промышленность</option>
                  <option value="energy">Энергетика</option>
                  <option value="materials">Материалы</option>
                  <option value="utilities">Коммунальные услуги</option>
                  <option value="real_estate">Недвижимость</option>
                  <option value="communication_services">Связь и медиа</option>
                </select>
                {errors.preferredSector && <p id="sector-error" className="mt-1 text-sm text-destructive">Выберите отрасль из списка.</p>}
              </div>
            </div>
            <div>
              <label htmlFor="profile-timezone" className="text-sm font-medium">Часовой пояс профиля</label>
              <input disabled={saving} id="profile-timezone" name="timezone" className={fieldClass} value={values.timezone} onChange={(event) => change("timezone", event.target.value)} list="profile-timezones" maxLength={100} required aria-invalid={!!errors.timezone} aria-describedby={errors.timezone ? "profile-timezone-error" : "profile-timezone-help"} />
              <datalist id="profile-timezones">{timezones.map((zone) => <option key={zone} value={zone} />)}</datalist>
              <p id="profile-timezone-help" className="mt-1 text-xs">Название часового пояса IANA, например Asia/Qyzylorda.</p>
              {errors.timezone && <p id="profile-timezone-error" className="mt-1 text-sm text-destructive">Укажите действующий часовой пояс IANA.</p>}
            </div>
            <Button type="submit" disabled={saving} className="w-fit">{saving ? "Сохраняем…" : "Сохранить профиль"}</Button>
            <Status notice={notice} />
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function DigestForm() {
  const [values, setValues] = useState({ enabled: false, timezone: "UTC", localTime: "09:00" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState<Notice>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [saving, setSaving] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    apiRequest<DigestPreference>("/api/preferences/digest", { signal: controller.signal })
      .then((preference) => {
        if (controller.signal.aborted) return;
        setValues({ enabled: preference.enabled, timezone: preference.timezone, localTime: preference.localTime });
        setLoadState("ready");
        setNotice(null);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setLoadState("error");
        setNotice(errorNotice(error));
      });
    return () => controller.abort();
  }, [retryToken]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || loadState !== "ready") return;
    const parsed = digestPreferenceUpdateSchema.safeParse({ ...values, timezone: values.timezone.trim() });
    if (!parsed.success) {
      const nextErrors = validationErrors(parsed.error.issues);
      setErrors(nextErrors);
      setNotice({ kind: "error", text: "Проверьте часовой пояс и время отправки." });
      const first = Object.keys(nextErrors)[0];
      if (first) requestAnimationFrame(() => formRef.current?.querySelector<HTMLInputElement>(`[name="${first}"]`)?.focus());
      return;
    }
    setSaving(true);
    setErrors({});
    setNotice(null);
    try {
      const preference = await apiRequest<DigestPreference>("/api/preferences/digest", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      setValues({ enabled: preference.enabled, timezone: preference.timezone, localTime: preference.localTime });
      setNotice({ kind: "success", text: preference.enabled ? "Согласие и настройки рассылки сохранены. Отправка сводок станет доступна после запуска почтового задания." : "Рассылка отключена." });
    } catch (error) {
      setErrors(serverFieldErrors(error));
      setNotice(errorNotice(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle><h2 className="m-0 text-lg">Ежедневная сводка</h2></CardTitle>
        <CardDescription>Управляйте согласием на email, местным временем и часовым поясом рассылки.</CardDescription>
      </CardHeader>
      <CardContent>
        {loadState === "loading" ? <p role="status">Загружаем настройки рассылки…</p> : loadState === "error" ? (
          <Status notice={notice} retry={() => { setLoadState("loading"); setRetryToken((value) => value + 1); }} />
        ) : (
          <form ref={formRef} onSubmit={save} noValidate className="grid gap-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="digest-timezone" className="text-sm font-medium">Часовой пояс рассылки</label>
                <input disabled={saving} id="digest-timezone" name="timezone" className={fieldClass} value={values.timezone} onChange={(event) => { setValues((current) => ({ ...current, timezone: event.target.value })); setErrors((current) => ({ ...current, timezone: undefined })); setNotice(null); }} list="digest-timezones" maxLength={100} required aria-invalid={!!errors.timezone} aria-describedby={errors.timezone ? "digest-timezone-error" : "digest-timezone-help"} />
                <datalist id="digest-timezones">{timezones.map((zone) => <option key={zone} value={zone} />)}</datalist>
                <p id="digest-timezone-help" className="mt-1 text-xs">Название часового пояса IANA.</p>
                {errors.timezone && <p id="digest-timezone-error" className="mt-1 text-sm text-destructive">Укажите действующий часовой пояс IANA.</p>}
              </div>
              <div>
                <label htmlFor="digest-time" className="text-sm font-medium">Местное время отправки</label>
                <input disabled={saving} id="digest-time" name="localTime" className={fieldClass} type="time" value={values.localTime} onChange={(event) => { setValues((current) => ({ ...current, localTime: event.target.value })); setErrors((current) => ({ ...current, localTime: undefined })); setNotice(null); }} required aria-invalid={!!errors.localTime} aria-describedby={errors.localTime ? "digest-time-error" : "digest-time-help"} />
                <p id="digest-time-help" className="mt-1 text-xs">Фактическое время доставки зависит от работы сервиса.</p>
                {errors.localTime && <p id="digest-time-error" className="mt-1 text-sm text-destructive">Укажите время в формате ЧЧ:ММ.</p>}
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-lg border border-border bg-background p-4">
              <input disabled={saving} id="digest-consent" name="enabled" className="mt-1 size-4 shrink-0 accent-primary" type="checkbox" checked={values.enabled} onChange={(event) => { setValues((current) => ({ ...current, enabled: event.target.checked })); setNotice(null); }} aria-describedby="digest-consent-help" />
              <div>
                <label htmlFor="digest-consent" className="text-sm font-medium">Хочу получать ежедневную сводку по email</label>
                <p id="digest-consent-help" className="mt-1 text-xs">Изменение начнёт действовать после сохранения. Вы можете отключить письма здесь же.</p>
              </div>
            </div>
            <Button type="submit" disabled={saving} className="w-fit">{saving ? "Сохраняем…" : "Сохранить рассылку"}</Button>
            <Status notice={notice} />
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export function ProfileSettingsPreview() {
  return <div className="grid max-w-4xl gap-5"><ProfileForm /><DigestForm /></div>;
}
