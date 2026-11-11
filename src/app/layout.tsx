import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import CookieBanner from "@/components/CookieBanner";
import { HtmlSettingsSync } from "@/components/ThemeToggle";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LoocalProject",
  description: "Small project schedules with tasks and resources, kept local to your browser.",
};

const SETTINGS_SCRIPT = `(function(){try{var d=document.documentElement;var s=JSON.parse(localStorage.getItem("local-project.settings.v1")||"{}").state||{};var t=s.theme||(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");d.setAttribute("data-theme",t);if(s.language)d.setAttribute("lang",s.language)}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      data-theme="light"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Applies the saved theme (or the OS one) and language before the first paint. */}
        <script dangerouslySetInnerHTML={{ __html: SETTINGS_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <HtmlSettingsSync />
        {children}
        <CookieBanner />
      </body>
    </html>
  );
}
