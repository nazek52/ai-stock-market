"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { authClient } from "@/components/auth/client";
import { PasswordResetRequest } from "@/components/auth/password-reset-request";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Mode = "login" | "register";
type Field = "name" | "email" | "password" | "confirmPassword";
type Errors = Partial<Record<Field, string>>;

const inputClass = "mt-1.5 min-w-0 max-w-full w-full rounded-lg border border-input bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:border-destructive";

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const isRegister = mode === "register";
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const noticeRef = useRef<HTMLParagraphElement>(null);

  function clearField(field: Field) {
    setErrors((current) => ({ ...current, [field]: undefined }));
    setNotice("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setNotice("");

    const name = nameRef.current?.value.trim() ?? "";
    const email = emailRef.current?.value.trim() ?? "";
    const password = passwordRef.current?.value ?? "";
    const confirmPassword = confirmRef.current?.value ?? "";
    const nextErrors: Errors = {};

    if (isRegister && !name) nextErrors.name = "Укажите имя.";
    else if (isRegister && name.length > 100) nextErrors.name = "Имя должно быть не длиннее 100 символов.";
    if (!email) nextErrors.email = "Укажите адрес электронной почты.";
    else if (!emailRef.current?.checkValidity()) nextErrors.email = "Проверьте формат адреса электронной почты.";
    if (!password) nextErrors.password = "Введите пароль.";
    else if (isRegister && password.length < 12) nextErrors.password = "Пароль должен содержать не менее 12 символов.";
    else if (isRegister && password.length > 128) nextErrors.password = "Пароль должен содержать не более 128 символов.";
    if (isRegister && !confirmPassword) nextErrors.confirmPassword = "Повторите пароль.";
    else if (isRegister && password !== confirmPassword) nextErrors.confirmPassword = "Пароли не совпадают.";

    setErrors(nextErrors);
    const firstInvalid = (Object.keys(nextErrors) as Field[])[0];
    if (firstInvalid) {
      const refs = { name: nameRef, email: emailRef, password: passwordRef, confirmPassword: confirmRef };
      requestAnimationFrame(() => refs[firstInvalid].current?.focus());
      return;
    }

    setPending(true);
    try {
      const result = isRegister
        ? await authClient.signUp.email({ name, email, password })
        : await authClient.signIn.email({ email, password });

      if (result.error) {
        const code = result.error.code;
        const status = result.error.status;
        const serverErrors: Errors = {};
        let message = "Не удалось выполнить запрос. Попробуйте ещё раз позже.";

        if (code === "INVALID_NAME") serverErrors.name = "Имя должно содержать от 1 до 100 символов.";
        else if (code === "INVALID_EMAIL") serverErrors.email = "Проверьте формат адреса электронной почты.";
        else if (code === "USER_ALREADY_EXISTS" || code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") serverErrors.email = "Аккаунт с таким адресом уже существует. Войдите в аккаунт.";
        else if (code === "PASSWORD_TOO_SHORT") serverErrors.password = "Пароль должен содержать не менее 12 символов.";
        else if (code === "PASSWORD_TOO_LONG") serverErrors.password = "Пароль должен содержать не более 128 символов.";
        else if (code === "INVALID_EMAIL_OR_PASSWORD" || code === "INVALID_PASSWORD") message = "Неверный адрес электронной почты или пароль.";
        else if (code === "EMAIL_NOT_VERIFIED") message = "Адрес электронной почты не подтверждён. Проверьте почту, если отправка включена.";
        else if (status === 429) message = "Слишком много попыток. Подождите и попробуйте снова.";

        if (Object.keys(serverErrors).length) {
          setErrors(serverErrors);
          requestAnimationFrame(() => (serverErrors.name ? nameRef : serverErrors.email ? emailRef : passwordRef).current?.focus());
        } else {
          setNotice(message);
          requestAnimationFrame(() => noticeRef.current?.focus());
        }
        return;
      }

      if (!result.data) {
        setNotice("Ответ сервера не подтвердил вход. Попробуйте ещё раз.");
        requestAnimationFrame(() => noticeRef.current?.focus());
        return;
      }

      const session = await authClient.getSession();
      if (session.error || !session.data?.session) {
        setNotice(isRegister
          ? "Аккаунт создан, но сессия не подтвердилась. Попробуйте войти."
          : "Вход не подтверждён сервером. Попробуйте ещё раз.");
        requestAnimationFrame(() => noticeRef.current?.focus());
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setNotice("Не удалось завершить запрос. Проверьте соединение и состояние сессии перед повторной попыткой.");
      requestAnimationFrame(() => noticeRef.current?.focus());
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <a className="skip-link" href="#main">Перейти к содержимому</a>
      <main id="main" tabIndex={-1} className="mx-auto flex min-h-screen min-w-0 w-full max-w-lg flex-col justify-center gap-6 px-4 py-12 sm:px-6">
        <Link href="/" className="w-fit text-sm font-semibold text-primary hover:underline">← К обзору</Link>
        <Card className="min-w-0 py-8 sm:py-10">
          <CardHeader className="gap-2 px-6 sm:px-8">
            <span className="text-xs font-semibold uppercase tracking-widest text-primary">Личный кабинет</span>
            <CardTitle><h1 id="auth-form-title" className="text-3xl">{isRegister ? "Создать аккаунт" : "Войти в аккаунт"}</h1></CardTitle>
            <CardDescription>{isRegister ? "Укажите имя, адрес электронной почты и пароль от 12 до 128 символов." : "Введите адрес электронной почты и пароль для входа."}</CardDescription>
          </CardHeader>
          <CardContent className="px-6 sm:px-8">
            <form noValidate onSubmit={handleSubmit} aria-busy={pending} aria-labelledby="auth-form-title" className="grid min-w-0 gap-5">
              {isRegister && (
                <div>
                  <label htmlFor="auth-name" className="text-sm font-medium">Имя</label>
                  <input disabled={pending} id="auth-name" name="name" ref={nameRef} type="text" autoComplete="name" maxLength={100} required aria-invalid={!!errors.name} aria-describedby={errors.name ? "auth-name-error" : undefined} onChange={() => clearField("name")} className={inputClass} />
                  {errors.name && <p id="auth-name-error" className="mt-1 text-sm text-destructive">{errors.name}</p>}
                </div>
              )}
              <div>
                <label htmlFor="auth-email" className="text-sm font-medium">Электронная почта</label>
                <input disabled={pending} id="auth-email" name="email" ref={emailRef} type="email" inputMode="email" autoComplete="email" required aria-invalid={!!errors.email} aria-describedby={errors.email ? "auth-email-error" : undefined} onChange={() => clearField("email")} className={inputClass} />
                {errors.email && <p id="auth-email-error" className="mt-1 text-sm text-destructive">{errors.email}</p>}
              </div>
              <div>
                <label htmlFor="auth-password" className="text-sm font-medium">Пароль</label>
                <input disabled={pending} id="auth-password" name="password" ref={passwordRef} type="password" autoComplete={isRegister ? "new-password" : "current-password"} minLength={isRegister ? 12 : undefined} maxLength={isRegister ? 128 : undefined} required aria-invalid={!!errors.password} aria-describedby={errors.password ? "auth-password-error" : undefined} onChange={() => clearField("password")} className={inputClass} />
                {errors.password && <p id="auth-password-error" className="mt-1 text-sm text-destructive">{errors.password}</p>}
              </div>
              {isRegister && (
                <div>
                  <label htmlFor="auth-confirm" className="text-sm font-medium">Повторите пароль</label>
                  <input disabled={pending} id="auth-confirm" name="confirmPassword" ref={confirmRef} type="password" autoComplete="new-password" required aria-invalid={!!errors.confirmPassword} aria-describedby={errors.confirmPassword ? "auth-confirm-error" : undefined} onChange={() => clearField("confirmPassword")} className={inputClass} />
                  {errors.confirmPassword && <p id="auth-confirm-error" className="mt-1 text-sm text-destructive">{errors.confirmPassword}</p>}
                </div>
              )}
              <Button type="submit" size="lg" disabled={pending} className="mt-1 w-full">{pending ? "Проверяем данные…" : isRegister ? "Зарегистрироваться" : "Войти"}</Button>
              {notice && <p ref={noticeRef} tabIndex={-1} role="alert" className="rounded-lg border border-border bg-muted p-3 text-sm text-foreground">{notice}</p>}
            </form>
            {!isRegister && <PasswordResetRequest />}
          </CardContent>
        </Card>
        <p className="text-center text-sm">
          {isRegister ? "Уже есть аккаунт? " : "Нет аккаунта? "}
          <Link href={isRegister ? "/login" : "/register"} className="font-semibold text-primary underline-offset-4 hover:underline">
            {isRegister ? "Войти" : "Зарегистрироваться"}
          </Link>
        </p>
      </main>
    </>
  );
}
