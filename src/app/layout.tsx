import type { Metadata } from "next";
import { DemoModeProvider } from "@/components/demo-mode";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Stock Market",
  description: "Наблюдайте за акциями и новостями в одном месте",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const demoMode = process.env.LOCAL_DEMO === "true" && process.env.NODE_ENV !== "production";
  return <html lang="ru"><body><DemoModeProvider enabled={demoMode}>{children}</DemoModeProvider></body></html>;
}
