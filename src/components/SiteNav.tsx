"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/blog", label: "Blog" },
  { href: "/contact", label: "Contacto" },
];

export default function SiteNav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-3">
        <Link href="/" className="text-sm font-semibold text-neutral-900">
          Loocal<span className="text-green-600">Project</span>
        </Link>
        <div className="flex items-center gap-1">
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
                {link.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
