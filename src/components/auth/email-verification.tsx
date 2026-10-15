"use client";

import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { authClient } from "@/components/auth/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export interface VerificationUser { email: string; emailVerified: boolean }
interface Props { user: VerificationUser | null; sessionUnavailable: boolean; showMailpit: boolean }
type Notice = { kind: "success" | "error"; text: string } | null;

/** The address is supplied by the server session; there is no arbitrary-recipient input. */
export function EmailVerification({ user, sessionUnavailable, showMailpit }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const verifiedRef = useRef<HTMLParagraphElement>(null);
  const previousVerified = useRef(user?.emailVerified);

  useEffect(() => {
    if (user?.emailVerified && previousVerified.current === false) verifiedRef.current?.focus();
    previousVerified.current = user?.emailVerified;
  }, [user?.emailVerified]);

  async function sendVerification() {
    if (!user || user.emailVerified || pending) return;
    setPending(true);
    setNotice(null);
    try {
      const result = await authClient.sendVerificationEmail({ email: user.email, callbackURL: "/settings" });
      if (result.error) {
        setNotice({ kind: "error", text: result.error.status === 429
          ? "Слишком много запросов подтверждения. Подождите несколько минут и повторите попытку."
          : result.error.code === "EMAIL_ALREADY_VERIFIED"
            ? "Адрес уже подтверждён. Обновите статус ниже."
            : result.error.status === 401 || result.error.code === "EMAIL_MISMATCH"
              ? "Сессия изменилась. Обновите статус или войдите снова."
              : "Не удалось запросить письмо. Проверьте доступность почты и повторите позже." });
      } else if (!result.data?.status) {
        setNotice({ kind: "error", text: "Сервер не подтвердил запрос письма. Повторите позже." });
      } else {
        setNotice({ kind: "success", text: "Запрос принят. Если отправка почты включена, откройте письмо и перейдите по ссылке. Ссылка действует один час. Затем обновите статус на этой странице." });
      }
    } catch {
      setNotice({ kind: "error", text: "Не удалось связаться с сервером. Проверьте соединение и повторите попытку." });
    } finally {
      setPending(false);
    }
  }

  return <Card className="motion-enter min-w-0">
    <CardHeader>
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-muted text-accent-foreground" aria-hidden="true"><ShieldCheck size={20} strokeWidth={1.6} /></span>
        <div className="grid min-w-0 gap-1"><CardTitle><h2 className="m-0 text-lg">Почта аккаунта</h2></CardTitle><CardDescription>Подтверждение адреса для сводок и уведомлений.</CardDescription></div>
      </div>
    </CardHeader>
    <CardContent className="grid gap-3">
      {sessionUnavailable ? <>
        <p role="alert" className="text-sm text-destructive">Не удалось проверить сессию. Убедитесь, что локальная база запущена, и повторите проверку.</p>
        <Button type="button" variant="outline" className="w-fit" onClick={() => router.refresh()}>Повторить проверку</Button>
      </> : !user ? <p className="text-sm">Для подтверждения адреса <Link href="/login" className="font-semibold text-accent-foreground underline">войдите в аккаунт</Link>.</p>
        : user.emailVerified ? <p ref={verifiedRef} tabIndex={-1} role="status" className="break-all text-sm">Адрес {user.email} подтверждён.</p>
          : <>
            <p className="break-all text-sm">Адрес {user.email} пока не подтверждён.</p>
            <div className="flex flex-wrap gap-3">
              <Button type="button" className="w-fit" disabled={pending} aria-busy={pending} onClick={() => void sendVerification()}>{pending ? "Запрашиваем письмо…" : "Отправить письмо подтверждения"}</Button>
              <Button type="button" variant="outline" disabled={pending} onClick={() => router.refresh()}>Обновить статус</Button>
            </div>
            {showMailpit && <p className="text-sm text-muted-foreground">В локальном демо письма остаются в <a href="http://127.0.0.1:8025" target="_blank" rel="noopener noreferrer" className="font-semibold text-accent-foreground underline">Mailpit</a>. Откройте письмо для своего адреса, перейдите по ссылке подтверждения, затем вернитесь в настройки и нажмите «Обновить статус».</p>}
            {notice && <p role={notice.kind === "error" ? "alert" : "status"} className={`rounded-lg border p-3 text-sm ${notice.kind === "error" ? "border-destructive text-destructive" : "border-border bg-muted text-foreground"}`}>{notice.text}</p>}
          </>}
    </CardContent>
  </Card>;
}
