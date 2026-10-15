import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, BellRing, ListFilter, Newspaper } from "lucide-react";
import { Brand } from "@/components/brand";

const introductions = {
  login: { kicker: "Личное пространство инвестора", title: "Всё о рынке. В вашем ритме.", description: "Компании, новости и важные изменения — в одном рабочем пространстве." },
  register: { kicker: "Начните с собственного списка", title: "Ваш взгляд на рынок начинается здесь.", description: "Соберите интересующие компании и настройте удобный способ следить за ними." },
  reset: { kicker: "Восстановление доступа", title: "Вернитесь к своему рабочему пространству.", description: "После смены пароля ваш список компаний и сохранённые настройки останутся с вами." },
} as const;

const features = [
  { icon: ListFilter, title: "Ваш список компаний", description: "Сохраняйте акции, к которым хотите вернуться." },
  { icon: Newspaper, title: "Новости с источниками", description: "Читайте публикации и собирайте их в ежедневную сводку." },
  { icon: BellRing, title: "Ценовые уведомления", description: "Задавайте пороги и управляйте своими правилами." },
];

export function AuthFrame({ variant, children }: { variant: keyof typeof introductions; children: ReactNode }) {
  const introduction = introductions[variant];
  return <div className="auth-layout">
    <a className="skip-link" href="#main">Перейти к содержимому</a>
    <section className="auth-intro" aria-labelledby="auth-intro-title">
      <Brand />
      <div className="motion-enter grid min-w-0 gap-7">
        <div className="min-w-0">
          <p className="auth-kicker">{introduction.kicker}</p>
          <p id="auth-intro-title" className="auth-intro-title mt-5 max-w-xl text-4xl font-semibold leading-tight tracking-tight text-foreground sm:text-5xl">{introduction.title}</p>
          <p className="mt-5 max-w-md text-base text-muted-foreground">{introduction.description}</p>
        </div>
        <ul className="grid gap-5">
          {features.map(({ icon: Icon, title, description }) => <li key={title} className="auth-feature">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-muted text-accent-foreground" aria-hidden="true"><Icon size={19} strokeWidth={1.6} /></span>
            <div className="min-w-0"><strong className="text-sm font-semibold text-foreground">{title}</strong><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>
          </li>)}
        </ul>
      </div>
      <p className="auth-footnote">Информационный сервис. Не является инвестиционной рекомендацией.</p>
    </section>
    <main id="main" tabIndex={-1} className="auth-panel">
      <div className="motion-enter grid min-w-0 w-full max-w-md gap-6">
        <Link href={variant === "reset" ? "/login" : "/"} className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"><ArrowLeft size={16} aria-hidden="true" />{variant === "reset" ? "К входу" : "К обзору рынка"}</Link>
        {children}
      </div>
    </main>
  </div>;
}
