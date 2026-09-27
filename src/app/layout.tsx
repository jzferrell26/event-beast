import type { Metadata, Viewport } from "next";
import "@fontsource-variable/dm-sans";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "@fontsource/barlow-condensed/800.css";
import "./globals.css";
import "./experience.css";
import './speakers.css';
import "./organizer.css";
import "./launch.css";
import "./readability.css";
import "./roles.css";

export const metadata: Metadata = {
  title: { default: "Momentum Builder LIVE 2026 | Event Beast", template: "%s | Momentum Builder LIVE" },
  description: "Your agenda, your people, your next move. The Momentum Builder LIVE 2026 event companion.",
  applicationName: "Momentum Builder LIVE",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "MB LIVE" },
  formatDetection: { telephone: false },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#111113" };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }
