import { AppShell } from "@/components/app-shell";
import { ProfileSettingsPreview } from "@/components/profile/profile-settings-preview";
import { DigestPreview } from "@/components/profile/digest-preview";

export default function SettingsPage() {
  return (
    <AppShell active="Настройки">
      <div className="page-heading">
        <div>
          <span className="eyebrow">ПРОФИЛЬ</span>
          <h1>Ваши настройки</h1>
          <p>Измените профиль, время сводки и согласие на ежедневные письма.</p>
        </div>
      </div>
      <ProfileSettingsPreview />
      {process.env.NODE_ENV === "development" && <div className="mt-5"><DigestPreview /></div>}
    </AppShell>
  );
}
