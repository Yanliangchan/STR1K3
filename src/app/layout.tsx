import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { ToastProvider } from "@/components/ui/toast";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "STR1K3", template: "%s · STR1K3" },
  description: "Standards, Discipline, Digitised. Instructor records for NORs, CROWs and statements.",
  robots: { index: false, follow: false },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "STR1K3", statusBarStyle: "default" },
  icons: { icon: "/icon.svg", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0c" },
  ],
};

// Applies "auto" before first paint so there is no flash of the wrong theme.
const themeScript = `(function(){try{if(sessionStorage.getItem('str1k3:splash')){document.documentElement.classList.add('no-splash')}else{sessionStorage.setItem('str1k3:splash','1')}}catch(e){}try{var m=window.matchMedia('(prefers-color-scheme: dark)');var a=function(){if(document.documentElement.dataset.theme==='auto'){document.documentElement.classList.toggle('dark',m.matches)}};a();m.addEventListener('change',a)}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html lang="en-GB" data-theme={theme} className={theme === "dark" ? "dark" : undefined} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
