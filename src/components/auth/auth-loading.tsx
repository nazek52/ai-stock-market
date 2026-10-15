import { AuthFrame } from "@/components/auth/auth-frame";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function AuthLoading({ variant }: { variant: "login" | "register" | "reset" }) {
  return <AuthFrame variant={variant}>
    <Card aria-busy="true">
      <CardHeader><h1 className="sr-only">Загружаем форму</h1><span className="skeleton h-7 w-2/3" aria-hidden="true" /></CardHeader>
      <CardContent className="grid gap-5">
        <p role="status" className="text-sm text-muted-foreground">Готовим ваше пространство…</p>
        <div className="grid gap-4" aria-hidden="true"><span className="skeleton h-12 w-full" /><span className="skeleton h-12 w-full" /><span className="skeleton mt-2 h-11 w-full" /></div>
      </CardContent>
    </Card>
  </AuthFrame>;
}
