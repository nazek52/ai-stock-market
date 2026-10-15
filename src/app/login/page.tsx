import { AuthForm } from "@/components/auth/auth-form";

export const metadata = { title: "Войти в аккаунт | AI Stock Market" };

export default function LoginPage() {
  return <AuthForm mode="login" />;
}
