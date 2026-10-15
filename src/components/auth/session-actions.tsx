"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/components/auth/client";
import { Button } from "@/components/ui/button";

export function SessionActions() {
  const router = useRouter();
  const { data, isPending, error: sessionError, refetch } = authClient.useSession();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    setError("");
    try {
      const result = await authClient.signOut();
      if (result.error || !result.data?.success) throw new Error("Sign-out was not confirmed");
      const session = await authClient.getSession();
      if (session.error || session.data?.session) throw new Error("Session is still active or unavailable");
      router.replace("/login");
      router.refresh();
    } catch {
      setError("Не удалось подтвердить выход. Проверьте соединение и повторите попытку.");
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {isPending ? (
        <span className="topbar-badge" role="status">Проверяем вход…</span>
      ) : sessionError ? (
        <div role="alert" className="flex items-center gap-2 text-xs text-destructive">
          Не удалось проверить вход.
          <Button type="button" variant="outline" onClick={() => void refetch()}>Повторить</Button>
        </div>
      ) : data?.session ? (
        <Button type="button" variant="outline" onClick={() => void signOut()} disabled={signingOut} aria-busy={signingOut}>
          {signingOut ? "Выходим…" : "Выйти"}
        </Button>
      ) : (
        <Link href="/login" className="topbar-badge">Войти</Link>
      )}
      {error && <p role="alert" className="max-w-64 text-right text-xs text-destructive">{error}</p>}
    </div>
  );
}
