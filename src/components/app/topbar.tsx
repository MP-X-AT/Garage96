"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type TopbarProps = {
  title: string;
  subtitle?: string;
  primaryAction?: {
    href: string;
    label: string;
  };
};

const navItems = [
  { href: "/", label: "Start" },
  { href: "/tagesansicht", label: "Heute" },
  { href: "/wochenansicht", label: "Woche" },
  { href: "/monatsansicht", label: "Monat" },
  { href: "/jahresansicht", label: "Jahr" },
  { href: "/dashboard", label: "Dashboard" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

export function Topbar({ title, subtitle, primaryAction }: TopbarProps) {
  const pathname = usePathname();

  return (
    <header className="g98-surface sticky top-3 z-40 overflow-hidden">
      <div className="flex flex-col gap-4 p-4 md:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.18em] text-sky-700">
              Garage96 Kalender
            </div>
            <h1 className="font-heading truncate text-2xl font-semibold text-slate-900 md:text-3xl">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            {primaryAction ? (
              <Link href={primaryAction.href} className="g98-action-primary">
                {primaryAction.label}
              </Link>
            ) : null}
          </div>
        </div>

        <nav className="flex gap-2 overflow-x-auto pb-1">
          {navItems.map((item) => {
            const active = isActive(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition ${
                  active
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}