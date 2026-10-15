import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata = { title: "Сменить пароль | AI Stock Market" };

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-lg p-6"><p role="status">Проверяем ссылку…</p></main>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
