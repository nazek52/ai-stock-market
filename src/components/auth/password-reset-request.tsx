"use client";

import { useRef, useState, type FormEvent } from "react";
import { authClient } from "@/components/auth/client";
import { Button } from "@/components/ui/button";

export function PasswordResetRequest() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const completionRef = useRef<HTMLParagraphElement>(null);

  async function requestReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const address = email.trim();
    if (!address || !emailRef.current?.checkValidity()) {
      setError("Укажите корректный адрес электронной почты.");
      requestAnimationFrame(() => emailRef.current?.focus());
      return;
    }

    setPending(true);
    setError("");
    try {
      await authClient.requestPasswordReset({ email: address, redirectTo: `${window.location.origin}/reset-password` });
    } catch {
      // The same response is shown for all addresses and delivery outcomes.
    } finally {
      setComplete(true);
      setPending(false);
      requestAnimationFrame(() => completionRef.current?.focus());
    }
  }

  return (
    <section aria-labelledby="reset-request-title" className="mt-6 border-t border-border pt-5">
      <h2 id="reset-request-title" className="text-base font-semibold">Восстановление доступа</h2>
      <p className="mt-2 text-sm text-muted-foreground">Если адрес зарегистрирован и отправка почты включена, вы сможете получить ссылку для смены пароля. В этой среде почта может быть выключена.</p>
      {complete ? (
        <p ref={completionRef} tabIndex={-1} role="status" className="mt-4 rounded-lg border border-border bg-muted p-3 text-sm">Если адрес есть в системе, почта включена и запрос принят сервером, ссылка может прийти на этот адрес. Проверьте входящие и папку спама; если письма нет, повторите позже. Ссылка действует один час.</p>
      ) : (
        <form noValidate onSubmit={requestReset} aria-busy={pending} aria-labelledby="reset-request-title" className="mt-4 grid min-w-0 gap-3">
          <div>
            <label htmlFor="reset-request-email" className="text-sm font-medium">Электронная почта</label>
            <input disabled={pending} id="reset-request-email" ref={emailRef} type="email" inputMode="email" autoComplete="email" required value={email} onChange={(event) => { setEmail(event.target.value); setError(""); }} aria-invalid={!!error} aria-describedby={error ? "reset-request-error" : undefined} className="mt-1.5 min-w-0 max-w-full w-full rounded-lg border border-input bg-background px-3 py-2 text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:border-destructive" />
          </div>
          {error && <p id="reset-request-error" role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" variant="outline" disabled={pending} className="w-fit">{pending ? "Отправляем запрос…" : "Запросить ссылку"}</Button>
        </form>
      )}
    </section>
  );
}
