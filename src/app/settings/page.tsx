import { LockKeyhole, SlidersHorizontal } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ProfileSettingsPreview } from "@/components/profile/profile-settings-preview";
import { DigestPreview } from "@/components/profile/digest-preview";
import { headers } from "next/headers";
import { EmailVerification, type VerificationUser } from "@/components/auth/email-verification";
import { getSession } from "@/server/auth/session";

export const metadata = { title: "Ваши настройки | AI Stock Market" };

export default async function SettingsPage() {
  const requestHeaders = await headers();
  let user: VerificationUser | null = null;
  let sessionUnavailable = false;
  try {
    const session = await getSession(new Headers(requestHeaders));
    if (session) user = { email: session.user.email, emailVerified: session.user.emailVerified };
  } catch {
    sessionUnavailable = true;
  }
  return (
    <AppShell active="Настройки">
      <div className="page-heading motion-enter">
        <div>
          <span className="eyebrow inline-flex items-center gap-2"><SlidersHorizontal size={14} aria-hidden="true" />ВАШЕ ПРОСТРАНСТВО</span>
          <h1>Ваши настройки</h1>
          <p>Личные предпочтения и письма. Всё под вашим контролем.</p>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs text-muted-foreground"><LockKeyhole size={14} aria-hidden="true" />Личные настройки</span>
      </div>
      <div className="grid min-w-0 gap-6">
        <EmailVerification user={user} sessionUnavailable={sessionUnavailable} showMailpit={process.env.LOCAL_DEMO === "true" && process.env.NODE_ENV !== "production"} />
        <ProfileSettingsPreview />
        {process.env.NODE_ENV === "development" && <DigestPreview />}
      </div>
    </AppShell>
  );
}
