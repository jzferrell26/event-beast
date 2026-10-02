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
  title: { default: "Momentum Builder LIVE 2026 | Event Beast", template: "%s | Momentum Builder LIVE" },
  description: "Your agenda, speakers, sponsors and event essentials. Momentum Builder LIVE 2026, no attendee account required.",
  applicationName: "Momentum Builder LIVE",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "MB LIVE" },
  formatDetection: { telephone: false },
  icons: { icon: [{url:'/icons/momentum-mark-32.png',sizes:'32x32',type:'image/png'},{url:'/icons/momentum-mark-192.png',sizes:'192x192',type:'image/png'}], apple: '/icons/momentum-mark-180.png', shortcut: '/icons/momentum-mark-32.png' },
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#111113" };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }
