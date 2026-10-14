"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { authClient } from "@/components/auth/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const linkError = searchParams.get("error");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [confirmationError, setConfirmationError] = useState("");
  const [formError, setFormError] = useState("");
  const [pending, setPending] = useState(false);
  const [complete, setComplete] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmationRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !token) return;
    const nextPasswordError = password.length < 12 || password.length > 128 ? "Пароль должен содержать от 12 до 128 символов." : "";
    const nextConfirmationError = !confirmation ? "Повторите пароль." : password !== confirmation ? "Пароли не совпадают." : "";
    setPasswordError(nextPasswordError);
    setConfirmationError(nextConfirmationError);
    setFormError("");
    if (nextPasswordError || nextConfirmationError) {
      requestAnimationFrame(() => (nextPasswordError ? passwordRef : confirmationRef).current?.focus());
      return;
    }

    setPending(true);
    try {
      const result = await authClient.resetPassword({ newPassword: password, token });
      if (result.error || !result.data?.status) {
        setFormError(result.error?.code === "INVALID_TOKEN" || result.error?.code === "TOKEN_EXPIRED"
          ? "Ссылка недействительна или устарела. Запросите новую ссылку на странице входа."
          : result.error?.status === 429
            ? "Слишком много попыток. Повторите позже."
            : "Не удалось сменить пароль. Повторите позже.");
        requestAnimationFrame(() => errorRef.current?.focus());
        return;
      }
      setComplete(true);
      window.history.replaceState(null, "", "/reset-password");
    } catch {
      setFormError("Не удалось завершить запрос. Проверьте соединение и повторите попытку.");
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <a className="skip-link" href="#main">Перейти к содержимому</a>
      <main id="main" className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 px-4 py-12 sm:px-6">
        <Link href="/login" className="w-fit text-sm font-semibold text-primary hover:underline">← К входу</Link>
        <Card className="py-8 sm:py-10">
          <CardHeader className="px-6 sm:px-8"><CardTitle><h1 className="text-3xl">Сменить пароль</h1></CardTitle></CardHeader>
          <CardContent className="px-6 sm:px-8">
            {complete ? (
              <div role="status" className="grid gap-4">
                <p>Пароль изменён. Прежние сессии отозваны. Войдите с новым паролем.</p>
                <Link href="/login" className="w-fit font-semibold text-primary underline">Войти</Link>
              </div>
            ) : linkError || !token ? (
              <div role="alert" className="grid gap-4">
                <p>Ссылка недействительна или устарела. Запросите новую ссылку на странице входа.</p>
                <Link href="/login" className="w-fit font-semibold text-primary underline">Перейти к входу</Link>
              </div>
            ) : (
              <form noValidate onSubmit={submit} className="grid gap-4">
                <p>Введите новый пароль длиной от 12 до 128 символов.</p>
                <div>
                  <label htmlFor="new-password" className="text-sm font-medium">Новый пароль</label>
                  <input id="new-password" ref={passwordRef} type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={(event) => { setPassword(event.target.value); setPasswordError(""); }} aria-invalid={!!passwordError} aria-describedby={passwordError ? "new-password-error" : undefined} className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:border-destructive" />
                  {passwordError && <p id="new-password-error" className="mt-1 text-sm text-destructive">{passwordError}</p>}
                </div>
                <div>
                  <label htmlFor="confirm-new-password" className="text-sm font-medium">Повторите пароль</label>
                  <input id="confirm-new-password" ref={confirmationRef} type="password" autoComplete="new-password" required value={confirmation} onChange={(event) => { setConfirmation(event.target.value); setConfirmationError(""); }} aria-invalid={!!confirmationError} aria-describedby={confirmationError ? "confirm-new-password-error" : undefined} className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:border-destructive" />
                  {confirmationError && <p id="confirm-new-password-error" className="mt-1 text-sm text-destructive">{confirmationError}</p>}
                </div>
                <Button type="submit" disabled={pending} className="w-fit">{pending ? "Сохраняем…" : "Сменить пароль"}</Button>
                {formError && <p ref={errorRef} tabIndex={-1} role="alert" className="text-sm text-destructive">{formError}</p>}
              </form>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
