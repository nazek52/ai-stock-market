import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Stock Market",
  description: "Наблюдение за рынком акций и персональные новостные сводки.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body>{children}</body></html>;
}
