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
import "./branding.css";
import "./mobile.css";
import './public-site.css';
import './hub.css';
import './message-attention.css';
import './thread-viewport.css';
import './organizer-polish.css';

export const metadata: Metadata = {
  metadataBase: new URL("https://2026live.momentumbuilder.com"),
  title: { default: "Momentum Builder LIVE 2026", template: "%s | Momentum Builder LIVE 2026" },
  description: "The official Momentum Builder LIVE 2026 event hub for the agenda, speakers, Impact Partners, networking and event essentials.",
  applicationName: "Momentum Builder LIVE 2026",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "MB LIVE 2026" },
  openGraph: {
    type: "website",
    url: "https://2026live.momentumbuilder.com",
    siteName: "Momentum Builder LIVE 2026",
    title: "Momentum Builder LIVE 2026",
    description: "The official event hub for Momentum Builder LIVE 2026."
  },
  twitter: {
    card: "summary",
    title: "Momentum Builder LIVE 2026",
    description: "The official event hub for Momentum Builder LIVE 2026."
  },
  formatDetection: { telephone: false },
  icons: { icon: [{url:'/icons/momentum-mark-32.png',sizes:'32x32',type:'image/png'},{url:'/icons/momentum-mark-192.png',sizes:'192x192',type:'image/png'}], apple: '/icons/momentum-mark-180.png', shortcut: '/icons/momentum-mark-32.png' },
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#111113" };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }
