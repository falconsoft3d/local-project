"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/lib/useT";
import LanguageSwitcher from "./LanguageSwitcher";
import ThemeToggle from "./ThemeToggle";

const LINKS = [
  { href: "/", labelKey: "navHome" },
  { href: "/manual", labelKey: "navManual" },
  { href: "/blog", labelKey: "navBlog" },
  { href: "/contact", labelKey: "navContact" },
];

export default function SiteNav() {
  const pathname = usePathname();
  const t = useT();

  return (
    <nav className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-2 px-6 py-3">
        <Link href="/" className="text-sm font-semibold text-neutral-900">
          Loocal<span className="text-green-600">Project</span>
        </Link>
        <div className="flex flex-wrap items-center gap-1">
          {LINKS.map((link) => {
            const active =
              link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  active
                    ? "bg-green-50 text-green-700"
                    : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
                }`}
              >
                {t(link.labelKey)}
              </Link>
            );
          })}
          <div className="ml-2 flex items-center gap-1.5">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </div>
      </div>
    </nav>
  );
}
