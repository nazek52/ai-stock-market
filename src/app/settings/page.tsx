import { AppShell } from "@/components/app-shell";
import { ProfileSettingsPreview } from "@/components/profile/profile-settings-preview";

export default function SettingsPage() {
  return (
    <AppShell active="Настройки">
      <div className="page-heading">
        <div>
          <span className="eyebrow">ПРОФИЛЬ</span>
          <h1>Ваши настройки</h1>
          <p>Укажите интересы и предпочтения для будущего личного кабинета.</p>
        </div>
      </div>
      <ProfileSettingsPreview />
    </AppShell>
  );
}
