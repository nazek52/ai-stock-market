"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Mode = "login" | "register";
type Field = "name" | "email" | "password" | "confirmPassword";
type Errors = Partial<Record<Field, string>>;

const inputClass = "mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:border-destructive";

export function AuthForm({ mode }: { mode: Mode }) {
  const isRegister = mode === "register";
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const noticeRef = useRef<HTMLParagraphElement>(null);

  function clearField(field: Field) {
    setErrors((current) => ({ ...current, [field]: undefined }));
    setNotice("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");

    const name = nameRef.current?.value.trim() ?? "";
    const email = emailRef.current?.value.trim() ?? "";
    const password = passwordRef.current?.value ?? "";
    const confirmPassword = confirmRef.current?.value ?? "";
    const nextErrors: Errors = {};

    if (isRegister && !name) nextErrors.name = "Укажите имя.";
    if (!email) nextErrors.email = "Укажите адрес электронной почты.";
    else if (!emailRef.current?.checkValidity()) nextErrors.email = "Проверьте формат адреса электронной почты.";
    if (!password) nextErrors.password = "Введите пароль.";
    if (isRegister && !confirmPassword) nextErrors.confirmPassword = "Повторите пароль.";
    else if (isRegister && password !== confirmPassword) nextErrors.confirmPassword = "Пароли не совпадают.";

    setErrors(nextErrors);
    const firstInvalid = (Object.keys(nextErrors) as Field[])[0];
    if (firstInvalid) {
      const refs = { name: nameRef, email: emailRef, password: passwordRef, confirmPassword: confirmRef };
      requestAnimationFrame(() => refs[firstInvalid].current?.focus());
      return;
    }

    setNotice(isRegister
      ? "Регистрация пока недоступна: серверная авторизация ещё не подключена. Данные не отправлены и аккаунт не создан."
      : "Вход пока недоступен: серверная авторизация ещё не подключена. Данные не отправлены и сессия не создана.");
    requestAnimationFrame(() => noticeRef.current?.focus());
  }

  return (
    <>
      <a className="skip-link" href="#main">Перейти к содержимому</a>
      <main id="main" className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 px-4 py-12 sm:px-6">
        <Link href="/" className="w-fit text-sm font-semibold text-primary hover:underline">← К обзору</Link>
        <Card className="py-8 sm:py-10">
          <CardHeader className="gap-2 px-6 sm:px-8">
            <span className="text-xs font-semibold uppercase tracking-widest text-primary">Личный кабинет</span>
            <CardTitle><h1 className="text-3xl">{isRegister ? "Создать аккаунт" : "Войти в аккаунт"}</h1></CardTitle>
            <CardDescription>Форма доступна для просмотра. Отправка данных станет возможной после подключения авторизации.</CardDescription>
          </CardHeader>
          <CardContent className="px-6 sm:px-8">
            <form noValidate onSubmit={handleSubmit} className="grid gap-5">
              {isRegister && (
                <div>
                  <label htmlFor="auth-name" className="text-sm font-medium">Имя</label>
                  <input id="auth-name" name="name" ref={nameRef} type="text" autoComplete="name" required aria-invalid={!!errors.name} aria-describedby={errors.name ? "auth-name-error" : undefined} onChange={() => clearField("name")} className={inputClass} />
                  {errors.name && <p id="auth-name-error" className="mt-1 text-sm text-destructive">{errors.name}</p>}
                </div>
              )}
              <div>
                <label htmlFor="auth-email" className="text-sm font-medium">Электронная почта</label>
                <input id="auth-email" name="email" ref={emailRef} type="email" inputMode="email" autoComplete="email" required aria-invalid={!!errors.email} aria-describedby={errors.email ? "auth-email-error" : undefined} onChange={() => clearField("email")} className={inputClass} />
                {errors.email && <p id="auth-email-error" className="mt-1 text-sm text-destructive">{errors.email}</p>}
              </div>
              <div>
                <label htmlFor="auth-password" className="text-sm font-medium">Пароль</label>
                <input id="auth-password" name="password" ref={passwordRef} type="password" autoComplete={isRegister ? "new-password" : "current-password"} required aria-invalid={!!errors.password} aria-describedby={errors.password ? "auth-password-error" : undefined} onChange={() => clearField("password")} className={inputClass} />
                {errors.password && <p id="auth-password-error" className="mt-1 text-sm text-destructive">{errors.password}</p>}
              </div>
              {isRegister && (
                <div>
                  <label htmlFor="auth-confirm" className="text-sm font-medium">Повторите пароль</label>
                  <input id="auth-confirm" name="confirmPassword" ref={confirmRef} type="password" autoComplete="new-password" required aria-invalid={!!errors.confirmPassword} aria-describedby={errors.confirmPassword ? "auth-confirm-error" : undefined} onChange={() => clearField("confirmPassword")} className={inputClass} />
                  {errors.confirmPassword && <p id="auth-confirm-error" className="mt-1 text-sm text-destructive">{errors.confirmPassword}</p>}
                </div>
              )}
              <Button type="submit" size="lg" className="mt-1 w-full">{isRegister ? "Зарегистрироваться" : "Войти"}</Button>
              {notice && <p ref={noticeRef} tabIndex={-1} role="status" className="rounded-lg border border-border bg-muted p-3 text-sm text-foreground">{notice}</p>}
            </form>
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
