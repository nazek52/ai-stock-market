import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { AuthFrame } from "@/components/auth/auth-frame";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Сменить пароль | AI Stock Market" };

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<AuthFrame variant="reset"><Card className="min-w-0 py-7 sm:py-8"><CardHeader className="gap-3 px-5 sm:px-7"><span className="auth-kicker">Безопасность аккаунта</span><CardTitle><h1 className="text-3xl">Сменить пароль</h1></CardTitle></CardHeader><CardContent className="grid gap-4 px-5 sm:px-7" role="status"><p>Проверяем ссылку…</p><div className="skeleton h-12 rounded-xl" aria-hidden="true" /><div className="skeleton h-12 rounded-xl" aria-hidden="true" /></CardContent></Card></AuthFrame>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
