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
      <div className="page-heading">
        <div>
          <span className="eyebrow">ПРОФИЛЬ</span>
          <h1>Ваши настройки</h1>
          <p>Измените профиль, время сводки и согласие на ежедневные письма.</p>
        </div>
      </div>
      <div className="mb-5"><EmailVerification user={user} sessionUnavailable={sessionUnavailable} showMailpit={process.env.LOCAL_DEMO === "true" && process.env.NODE_ENV !== "production"} /></div>
      <ProfileSettingsPreview />
      {process.env.NODE_ENV === "development" && <div className="mt-5"><DigestPreview /></div>}
    </AppShell>
  );
}
