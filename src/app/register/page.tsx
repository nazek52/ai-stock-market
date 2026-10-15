import { AuthForm } from "@/components/auth/auth-form";

export const metadata = { title: "Создать аккаунт | AI Stock Market" };

export default function RegisterPage() {
  return <AuthForm mode="register" />;
}
