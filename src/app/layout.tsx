import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Stock Market",
  description: "Наблюдайте за акциями и новостями в одном месте",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body>{children}</body></html>;
}
